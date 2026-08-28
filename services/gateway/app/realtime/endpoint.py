"""endpoint.py — WebSocket `/v1/realtime`. Единственная дверь в партию.

ПРОИСХОЖДЕНИЕ ЖИЗНЕННОГО ЦИКЛА: MiniCPM-o-Demo (Apache-2.0, commit 50b0865c),
`gateway.py:1384` + `docs-app/content/docs/en/realtime-api/overview.md`.
Порядок `queue_done → session.init → session.created → input.append → …
→ session.close → session.closed` сохранён дословно, включая событие очереди,
которое мы отправляем сразу: у нас нет пула GPU-воркеров, но клиент (порт их
же `realtime-session.js`) ждёт этого события, и ломать протокол ради одной
сэкономленной строки бессмысленно.

ЧЕМ ЭТО ЛУЧШЕ СТАРОГО `/ws`. Там один цикл делал всё: читал сообщение, звал ИИ,
писал ответ. Пока он звал ИИ, он не читал сокет — то есть перебить оппонента
было физически нельзя, сообщение просто ждало в буфере. Здесь чтение и запись
разведены на две задачи: **читатель никогда не блокируется на ИИ**, поэтому
`response.cancel` доходит мгновенно, а писатель отдаёт то, что накопила шина,
выбрасывая хвосты погашенных поколений.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import os
from typing import Optional

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

from app import engine, views
from app.avatar.base import AvatarProvider
from app.avatar.presence import PresenceAvatar
from app.orchestrator.judge import judge_enabled
from app.orchestrator.negotiation import NegotiationOrchestrator
from app.orchestrator.tts_manager import TTSTaskManager
from app.perception.vision import VisionSampler
from app.perception.realtime_voice import RealtimeVoicePipeline
from app.perception.voice_pipeline import VoicePipeline
from app.providers.asr.openrouter import OpenRouterASR
from app.providers.openrouter import chat as orchat
from app.providers.routing import describe as describe_models
from app.providers.tts.base import Voice
from app.providers.tts.base import TTSProvider
from app.providers.tts.edge import EdgeTTS
from app.providers.tts.openai_speech import OpenAISpeechTTS
from app.realtime.events import SessionInit, error, session_closed
from app.realtime.session import (Layers, RealtimeSession, keep_for_resume,
                                  restore_from_resume)
from app.session import store


async def realtime_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    mode = websocket.query_params.get("mode", "text")
    if mode not in ("text", "voice"):
        await websocket.close(code=1008, reason=f"unsupported mode: {mode}")
        return

    # Очередь: у нас её нет, воркер всегда свободен. Событие всё равно шлём —
    # клиент ждёт именно его перед отправкой `session.init`.
    await websocket.send_json({"type": "session.queue_done"})

    session: Optional[RealtimeSession] = None
    orchestrator: Optional[NegotiationOrchestrator] = None
    voice: Optional[VoicePipeline] = None
    vision: Optional[VisionSampler] = None
    writer: Optional[asyncio.Task] = None

    try:
        while True:
            message = await websocket.receive_json()
            kind = message.get("type")

            # ---- session.init ---------------------------------------------
            if kind == "session.init":
                if session is not None:
                    await websocket.send_json(error("already_initialized",
                                                    "session already initialized"))
                    continue
                payload = SessionInit(**(message.get("payload") or {}))
                payload.mode = mode  # URL — истина, а не поле в теле
                session, problem = await _build_session(payload)
                if session is None:
                    await websocket.send_json(error("init_failed", problem or "init failed"))
                    continue

                orchestrator, voice, vision = _wire(session)
                writer = asyncio.create_task(_pump(websocket, session))
                await websocket.send_json(_created_payload(session, voice))
                continue

            if session is None or orchestrator is None:
                await websocket.send_json(error("not_initialized",
                                                "send session.init first"))
                continue

            # ---- input.append ---------------------------------------------
            if kind == "input.append":
                data = message.get("input") or {}
                text = data.get("text")
                if text:
                    session.append_input(text=text)
                frames = data.get("video_frames")
                if frames:
                    session.append_input(frames=frames)
                    if vision is not None:
                        # «Кадр изменился» считает браузер: у него кадр уже в
                        # canvas, а по сжатому JPEG честной разницы не получить.
                        # Номер хода снимается ЗДЕСЬ, а не там, где вернётся
                        # модель: взгляд длится секунду, за которую человек
                        # успевает отправить ход, и наблюдение уехало бы в
                        # ленту с чужим номером.
                        vision.offer(frames, change=data.get("frame_change"),
                                     turn=session.turn_id)
                audio_b64 = data.get("audio")
                if audio_b64 and voice is not None:
                    pcm = np.frombuffer(base64.b64decode(audio_b64), dtype=np.int16)
                    voice.feed(pcm)
                if data.get("force_listen"):
                    await orchestrator.interrupt(reason="force_listen")
                continue

            # ---- input.commit ---------------------------------------------
            if kind == "input.commit":
                text, _frames = session.take_input()
                if not text and voice is not None:
                    # Голосовой режим: клиент нажал «готово», не дожидаясь
                    # детектора конца хода. Уважаем — человек решил сам.
                    await voice.force_commit()
                elif text:
                    await orchestrator.on_player_turn(text)
                continue

            # ---- response.cancel (перебивание с клиента) -------------------
            if kind == "response.cancel":
                await orchestrator.interrupt(reason="client_cancel")
                continue

            # ---- coach.request (кнопка 💡) ---------------------------------
            if kind == "coach.request":
                await _send_hint(session)
                continue

            # ---- session.close ---------------------------------------------
            if kind == "session.close":
                await orchestrator.interrupt(reason="session_close")
                # Человек сам сказал, что закончил — ждать возвращения незачем.
                store.drop(session.session_id)
                await websocket.send_json(session_closed(session.session_id,
                                                         message.get("reason", "user_stop")))
                break

            await websocket.send_json(error("unknown_event", f"unknown message: {kind}"))

    except WebSocketDisconnect:
        pass
    except Exception as exc:  # сокет не должен падать от кривого сообщения
        with contextlib.suppress(Exception):
            await websocket.send_json(error("server_error", str(exc)))
    finally:
        if orchestrator is not None:
            with contextlib.suppress(Exception):
                await orchestrator.interrupt(reason="disconnect")
        if vision is not None:
            with contextlib.suppress(Exception):
                await vision.aclose()
        if session is not None:
            session.bus.close()
            # Отпускаем, а не удаляем: сокет мог оборваться сам. Явное
            # `session.close` уже удалило сессию выше.
            store.release(session.session_id)
            # Лента камеры живёт в этой сессии, а она сейчас умрёт вместе с
            # сокетом. Откладываем на тот же срок, что и саму партию — и только
            # если возвращаться есть куда: после явного `session.close` партии
            # уже нет в хранилище, и держать её ленту не за чем.
            if store.get(session.session_id) is not None:
                keep_for_resume(session)
        if writer is not None:
            writer.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await writer


# ---------------------------------------------------------------------------
# Сборка сессии
# ---------------------------------------------------------------------------

def _layers_for(payload: "SessionInit") -> Layers:
    """Слои сессии. На экзамене — принудительно выключенные, что бы ни прислал
    клиент: правило, которое соблюдает только браузер, правилом не является."""
    if payload.gameMode == "exam":
        return Layers.for_exam()
    return Layers.from_dict(payload.layers)


async def _build_session(payload: SessionInit) -> tuple[Optional[RealtimeSession], Optional[str]]:
    """Создать партию — или вернуться в брошенную. Возвращает (сессия, отказ)."""
    # Возвращение после обрыва. Сессия та же, ход тот же, шкалы те же: их
    # держал движок, а не соединение. Если срок ожидания вышел или сессии
    # никогда не было — молча начинаем новую: это лучше отказа.
    if payload.resume:
        existing = store.claim(payload.resume)
        if existing is not None:
            resumed = RealtimeSession(
                session_id=payload.resume,
                engine_session=existing,
                lang=payload.lang,
                mode=payload.mode,
                game_mode=payload.gameMode,
                layers=_layers_for(payload),
                reputation=payload.reputation,
            )
            # Ходы и шкалы вернул движок, наблюдения камеры вернуть некому:
            # `RealtimeSession` здесь новая. Без этой строки разбор после метро
            # показывал ленту с середины партии и молчал о том, что начала он не
            # знает, — а дыры в ленте не видно, в отличие от её отсутствия.
            restore_from_resume(resumed, payload.resume)
            return resumed, None

    scenario_id = payload.scenarioId

    if payload.gameMode == "custom":
        from app.ai.scenario_gen import generate_scenario
        generated = await generate_scenario(payload.situation or "", payload.lang)
        if generated is None:
            return None, ("Не удалось сгенерировать сценарий. Попробуйте переформулировать ситуацию."
                          if payload.lang == "ru" else
                          "Couldn't generate a scenario. Try rephrasing the situation.")
        scenario_id = generated.id

    try:
        engine_session = engine.create_session(scenario_id, payload.lang)
    except ValueError:
        return None, f"unknown scenario: {scenario_id}"

    if payload.reputation is not None:
        views.apply_reputation(engine_session, payload.reputation)

    # УСЛОВИЕ ДНЯ. Накладывается той же схемой, что репутация кампании: это вход
    # партии (длина, стартовые шкалы), а не правило подсчёта — `score_session`
    # о нём не знает. Дату присылает клиент; сверяем, что стол ТОГО дня и правда
    # этот, иначе «короткий стол» можно было бы выпросить на любом сценарии.
    daily_mod = None
    if payload.daily and payload.gameMode != "exam":
        from datetime import date as _date
        from app.engine.daily import apply_modifier, daily_table
        try:
            table = daily_table(_date.fromisoformat(payload.daily))
        except ValueError:
            table = None
        if table is not None and table.scenario_id == scenario_id:
            apply_modifier(engine_session, table.modifier)
            daily_mod = table.modifier.id

    session_id = store.new_id()
    store.put(session_id, engine_session)
    return RealtimeSession(
        session_id=session_id,
        engine_session=engine_session,
        lang=payload.lang,
        mode=payload.mode,
        game_mode=payload.gameMode,
        layers=_layers_for(payload),
        reputation=payload.reputation,
        daily=daily_mod,
    ), None


def _wire(session: RealtimeSession) -> tuple[
        NegotiationOrchestrator, Optional[VoicePipeline], Optional[VisionSampler]]:
    """Собрать подсистемы вокруг сессии по включённым слоям.

    Слои включают КАНАЛЫ, а не правила игры: выключенный голос означает, что
    синтез не поднимается, но ход, шкалы и грейд считаются ровно так же.
    """
    scenario = engine.by_id(session.engine_session.scenario_id)

    avatar: Optional[AvatarProvider] = None
    if session.layers.avatar:
        avatar = _make_avatar(session)

    tts: Optional[TTSTaskManager] = None
    if session.layers.voice:
        # ПОРЯДОК ПО ЗАМЕРУ, А НЕ ПО ЦЕНЕ. На заведомо новом тексте — а в игре
        # каждая реплика новая — edge даёт медиану 2318 мс до первого звука,
        # openai 936 мс. Прежняя цифра edge «570 мс» оказалась артефактом:
        # эндпоинт Microsoft кэширует уже произнесённый текст, и повторный
        # прогон той же фразы мерил кэш, а не синтез.
        # Edge остаётся запасным: он бесплатен и не требует ключа.
        provider: TTSProvider = OpenAISpeechTTS()
        if not provider.available():
            provider = EdgeTTS()
        if provider.available():
            tts = TTSTaskManager(provider, session.bus.publish,
                                 Voice(id="", lang=session.lang,
                                       female=_persona_is_female(scenario)))

    orchestrator = NegotiationOrchestrator(session, tts=tts, avatar=avatar)

    voice = None
    if session.mode == "voice" and session.layers.voice:
        # ДВА КОНВЕЙЕРА, ОДНА ПОВЕРХНОСТЬ. Realtime-сессия OpenAI распознаёт по
        # ходу речи и отдаёт текст через ~0.45 с после того, как человек
        # замолчал; старый путь копил звук и слал файлом — 3.3 с. Берём
        # realtime, когда для него есть ключ, и падаем на старый, когда нет:
        # без сети продукт обязан оставаться играбельным (инвариант 5).
        # NEGO_VOICE=classic принудительно возвращает старый путь. Нужен не для
        # красоты: это и аварийный выход, если realtime-сессия начнёт капризничать
        # на показе, и способ честно сравнить два конвейера на одной записи.
        want_classic = os.getenv("NEGO_VOICE", "").strip().lower() == "classic"
        pipeline = None if want_classic else RealtimeVoicePipeline(
            lang=session.lang,
            on_turn=orchestrator.on_player_turn,
            on_interrupt=lambda: orchestrator.interrupt(reason="barge_in"),
            publish=session.bus.publish,
        )
        if pipeline is None or not pipeline.available:
            pipeline = VoicePipeline(
                asr=OpenRouterASR(), lang=session.lang,
                on_turn=orchestrator.on_player_turn,
                on_interrupt=lambda: orchestrator.interrupt(reason="barge_in"),
                publish=session.bus.publish,
            )
        if pipeline.available:
            voice = pipeline
            # Замыкаем петлю: оркестратор знает, когда оппонент звучит, и
            # пайплайн поднимает планку перебивания на это время.
            orchestrator.on_speaking_change = pipeline.set_opponent_speaking

    vision: Optional[VisionSampler] = None
    if session.layers.camera:
        sampler = VisionSampler(session.lang, session.bus.publish,
                                # Не `observations.append`: одна запись ведёт
                                # обе формы — плоскую для промпта оппонента и
                                # ленту с ходами для разбора.
                                session.note_vision,
                                pokerface=session.layers.pokerface)
        vision = sampler if sampler.available() else None

    return orchestrator, voice, vision


def _make_avatar(session: RealtimeSession) -> AvatarProvider:
    """Лицо оппонента. Всегда `presence`: картинка меняется по реакции движка.

    Здесь был второй путь — провайдер `livetalking` на GPU-хосте, включавшийся
    переменной `NEGO_AVATAR_URL`. Он удалён: липсинк там так и не заработал
    (два STUB — согласование WebRTC и подача PCM не были подключены), а
    настоящий липсинк теперь делает OpenTalking семью своими рендерерами.
    Держать нерабочую вторую ветку рядом с работающей чужой — это обещать
    возможность, которой нет.
    """
    return PresenceAvatar(session.engine_session.scenario_id, session.bus.publish)


#: Мужские имена, оканчивающиеся на «а»/«я». Нужны только для СГЕНЕРИРОВАННЫХ
#: персон: у готовых сценариев пол объявлен полем и не угадывается вовсе.
#: Только ОДНОЗНАЧНО мужские. «Саша» и «Женя» тоже кончаются на «а»/«я», но они
#: двуполые — записать их сюда значило бы заменить одну выдумку другой.
_MALE_NAMES_ENDING_IN_A = frozenset({
    "никита", "илья", "кузьма", "лука", "фома", "савва", "данила", "гаврила",
    "добрыня", "мина", "сила",
})


def _persona_is_female(scenario) -> bool:
    """Пол голоса берём ИЗ СЦЕНАРИЯ, а не угадываем по имени.

    Угадывание стояло здесь как STUB и ошибалось на половине столов: строка
    имени это «Имя, должность», и эвристика по окончанию читала ДОЛЖНОСТЬ.
    «Ирина, глава продаж» кончается на «продаж» → мужской голос; «Алексей,
    руководитель смежного отдела» → на «отдела» → женский; «Павел, основатель
    стартапа» → на «стартапа» → женский. Четыре оппонента из восьми говорили
    чужим голосом, и на слух это заметно сразу.

    У сгенерированных сценариев поля может не быть — там остаётся догадка, но
    уже по ПЕРВОМУ слову, то есть по имени, а не по должности.
    """
    female = getattr(getattr(scenario, "counterpart", None), "female", None)
    if isinstance(female, bool):
        return female
    try:
        name = scenario.counterpart.name.get("ru", "")
    except Exception:
        return True
    first = name.split(",")[0].strip()
    if not first:
        return True
    # Мужские имена на -а/-я: их в русском немного, и без списка догадка
    # уверенно ошибается на самых обычных — Никита, Илья, Данила.
    if first.lower() in _MALE_NAMES_ENDING_IN_A:
        return False
    return first.endswith(("а", "я"))


def _created_payload(session: RealtimeSession, voice: Optional[VoicePipeline]) -> dict:
    """`session.created` — единственное место, где клиент узнаёт правду о возможностях.

    Здесь нет обещаний: каждое поле отражает то, что действительно поднялось.
    Слой, который не поднялся, приезжает как `false` с причиной, и интерфейс
    рисует «недоступно» вместо того, чтобы имитировать работу.
    """
    engine_session = session.engine_session
    scenario = engine.by_id(engine_session.scenario_id)
    # «Ваша репутация вас опережает». Строка была написана на двух языках и НЕ
    # ВЫЗЫВАЛАСЬ НИОТКУДА: кампания обещает, что репутация переносится между
    # актами, а игрок видел только безымянный сдвиг доверия — без объяснения,
    # откуда он взялся. Теперь оппонент говорит об этом вслух.
    intro = (views.reputation_intro(session.reputation, session.lang)
             if session.game_mode == "campaign" else "")
    greeting = views.greeting_line(engine_session, session.lang)
    if intro:
        greeting = intro + " " + greeting

    capabilities = {
        "voice": bool(session.layers.voice),
        "microphone": voice is not None,
        "camera": bool(session.layers.camera) and orchat.available(),
        # Отдельная возможность, а не подпункт камеры: тумблер «покерфейс»
        # может стоять, а слой при этом не подняться (нет ключа — нет модели
        # зрения). Клиент обязан различать «выключено» и «недоступно».
        "pokerface": bool(session.layers.pokerface) and orchat.available(),
        # Условие дня — не возможность, а факт партии, но едет тем же путём:
        # клиент показывает подпись, только если условие ДЕЙСТВИТЕЛЬНО легло.
        "daily": session.daily,
        "judge": judge_enabled(),
        "cloud_ai": orchat.available(),
        "models": describe_models(),
        "avatar": {"available": False, "lipsync": False, "transport": "none"},
    }
    if session.layers.avatar:
        caps = _make_avatar(session).capabilities()
        capabilities["avatar"] = {
            "available": caps.available, "lipsync": caps.lipsync,
            "transport": caps.transport, "states": list(caps.states),
            "reason": caps.reason or None,
        }

    return {
        "type": "session.created",
        "session_id": session.session_id,
        "mode": session.mode,
        # Клиент по этому флагу решает, показывать ли приветствие ещё раз:
        # в продолженной партии оно уже было сказано.
        "resumed": engine_session.turn > 0,
        "scenario": views.scenario_view(scenario, session.lang).model_dump(),
        "state": views.state_view(engine_session).model_dump(),
        "greeting": greeting,
        "capabilities": capabilities,
    }


def _attach_vision_tape(event: dict, session: RealtimeSession) -> None:
    """Подшить к разбору ленту наблюдений — ту, что с ходами и временем.

    ПОЧЕМУ ЗДЕСЬ, А НЕ В ОРКЕСТРАТОРЕ. Разбор считает движок, оркестратор его
    собирает — но «на каком ходу это было видно» это факт РАЗГОВОРА, и живёт
    он в `RealtimeSession` ровно затем, чтобы `score_session` до него не
    дотягивался. Оркестратор кладёт в `deb["observations"]` плоские строки (всё,
    что у него есть); realtime-слой, который и владеет проводом, заменяет их той
    же правдой в полной форме.

    КЛЮЧА НЕТ ВОВСЕ, если слой не высказался ни разу: пустая лента под
    невставшей камерой — это обещание, выданное за наблюдение (принцип 2).
    Без ключа сэмплер не создаётся, записей нет, карточки на клиенте нет.
    """
    deb = event.get("debrief")
    if not isinstance(deb, dict):
        return
    if session.vision_notes:
        deb["observations"] = list(session.vision_notes)
    else:
        deb.pop("observations", None)


async def _pump(websocket: WebSocket, session: RealtimeSession) -> None:
    """Писатель: шина → сокет. Хвосты погашенных поколений отсеивает `drain()`."""
    try:
        async for event in session.bus.drain():
            if event.get("type") == "debrief":
                _attach_vision_tape(event, session)
            await websocket.send_json(event)
    except (WebSocketDisconnect, RuntimeError, asyncio.CancelledError):
        return
    except Exception:
        return


async def _send_hint(session: RealtimeSession) -> None:
    """Подсказка тренера. Никогда не выдаёт ещё не вскрытые интересы."""
    engine_session, lang = session.engine_session, session.lang
    base = views.compute_hint(engine_session, lang)
    payload = {"type": "turn.coach", "kind": "hint", "text": base}

    if orchat.available():
        from app.ai.coach import build_prompts as coach_prompts, parse as coach_parse
        facts = views.coach_facts(engine_session, lang)
        facts["fallback_hint"] = base
        try:
            system, user = coach_prompts(facts, lang)
            raw = await orchat.complete(system, user, role="opponent",
                                        max_tokens=300, temperature=0.6, raw=True)
            tip = coach_parse(raw or "", lang)
            if tip:
                payload["text"] = tip.get("why") or base
                payload["line"] = tip.get("line")
        except Exception:
            pass
    session.bus.publish(payload)
