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
import logging
import os
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

import numpy as np
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app import engine, views
from app.avatar.base import AvatarProvider
from app.avatar.factory import create_avatar
from app.orchestrator.judge import judge_enabled_for
from app.orchestrator.negotiation import NegotiationOrchestrator
from app.orchestrator.tts_manager import TTSTaskManager
from app.perception.vision import VisionSampler
from app.perception.realtime_voice import RealtimeVoicePipeline
from app.perception.voice_pipeline import VoicePipeline
from app.protocol import reproducible_run
from app.providers.asr import make_asr, voice_mode, describe_voice
from app.providers.openrouter import chat as orchat
from app.providers.routing import describe as describe_models
from app.providers.tts.base import Voice
from app.providers.tts.base import TTSProvider
from app.providers.tts.edge import EdgeTTS
from app.providers.tts.openai_speech import OpenAISpeechTTS
from app.realtime import limits
from app.realtime.events import InputAppend, SessionInit, error, session_closed
from app.realtime.session import (MAX_AUDIO_BYTES, MAX_FRAME_B64, Layers,
                                  RealtimeSession, keep_for_resume,
                                  restore_from_resume)
from app.session import store

_log = logging.getLogger(__name__)

#: Коды закрытия, по которым клиент НЕ переподключается. Обычный обрыв (1006,
#: 1001) значит «связь пропала, вернись» — на нём `resume` и держится. Эти три
#: значат «сервер отказал по существу», и молчаливая попытка номер два не
#: изменит ответа, зато превратит один отказ в три.
#:
#: 4401 — назовите пароль (`main.py`).
WS_TAKEN_OVER = 4409     #: партию забрал другой сокет — играть тут больше нечего
WS_RATE_LIMITED = 4429   #: с этого адреса уже слишком много партий

#: Сколько ходов ждёт очереди, пока считается текущий. Один: игрок ходит по
#: очереди с оппонентом, а всё, что сверх, — либо дрожащий палец, либо тот, кто
#: решил проверить, сколько платных ходов примет сокет за секунду.
_MAX_QUEUED_TURNS = 1

#: Короче этого «своя сделка» не генерируется. Не строгость ради строгости:
#: описание уезжает в самую дорогую роль (`reasoning`), и из пустой строки она
#: вернёт либо ничего, либо выдумку — оплаченную в обоих случаях.
_MIN_SITUATION_CHARS = 10


# ---------------------------------------------------------------------------
# Кто сейчас владеет партией
# ---------------------------------------------------------------------------
#
# ЧТО БЫЛО СЛОМАНО. `resume` не проверял, занята ли партия. Три сокета с одним
# и тем же идентификатором получали `session.created` с одним id и играли ОДНУ
# сессию движка: два хода считались внахлёст, `session.close` с любого из них
# вынимал партию из-под остальных, а обрыв любого ставил живой партии срок в
# пять минут.
#
# ПОЧЕМУ НЕ ПРОСТО ОТКАЗАТЬ ВТОРОМУ. Ради чего `resume` и написан: в метро TCP
# умирает молча, сервер узнаёт об обрыве не сразу — иногда через десятки секунд
# keepalive. Честное возвращение в этот промежуток получило бы «партия занята»,
# то есть главный сценарий сломался бы ровно там, где он нужен.
#
# ПОЭТОМУ ВЫТЕСНЕНИЕ. Приходящий забирает партию, прежний сокет закрывается
# кодом, который клиент отличает от обрыва сети, и получает `session.closed`
# со внятной причиной. Партия при этом не дёргается: она принадлежит движку, а
# сокеты только сменились.

@dataclass
class _Owner:
    """Живой владелец партии: сокет, его сессия и способ его погасить."""
    websocket: WebSocket
    session: "RealtimeSession"
    #: Замыкание над локальными переменными СВОЕГО вызова `realtime_ws`: ход,
    #: судья, синтез, зрение, писатель. Гасит их, ничего не зная о том, кто
    #: вытесняет.
    quiesce: "Callable[[], Awaitable[None]]"
    lease: Optional[limits.Lease] = None


#: session_id → владелец. Пусто в покое: запись живёт ровно столько, сколько
#: сокет держит партию.
_OWNERS: dict[str, _Owner] = {}


async def _evict_owner(session_id: str) -> bool:
    """Вытеснить прежнего владельца партии. True — было кого вытеснять.

    Порядок здесь не произвольный:
      1. метка `evicted` — чтобы `finally` вытесненного не сделал `drop`
         (вынул бы партию из-под нового) и не сделал `release` (поставил бы
         живой партии срок в пять минут);
      2. лента камеры откладывается тем же механизмом, что и при обрыве, —
         иначе новый владелец получил бы разбор, начинающийся с середины
         партии, а дыры в ленте не видно, в отличие от её отсутствия;
      3. подсистемы гасятся ВМЕСТЕ С ПИСАТЕЛЕМ — после этого в старый сокет
         никто, кроме нас, не пишет, и `session.closed` не переплетётся с
         чужим чанком;
      4. аренда места на хосте отпускается сразу: читатель вытесненного может
         ещё висеть на `receive`, а место он занимать уже не должен.
    """
    previous = _OWNERS.pop(session_id, None)
    if previous is None:
        return False
    previous.session.evicted = True
    keep_for_resume(previous.session)
    with contextlib.suppress(Exception):
        await previous.quiesce()
    if previous.lease is not None:
        previous.lease.release()
    with contextlib.suppress(Exception):
        await previous.websocket.send_json(session_closed(session_id, "taken_over"))
    with contextlib.suppress(Exception):
        await previous.websocket.close(code=WS_TAKEN_OVER, reason="taken_over")
    return True


def _why(exc: ValidationError) -> str:
    """Чем именно плох `payload`: поле и причина, без значений и без ссылок.

    Полный `str(ValidationError)` пересказывает клиенту наши типы, повторяет
    присланное значение и приписывает ссылку на errors.pydantic.dev с версией.
    Клиенту нужно одно: какое поле он заполнил не так.
    """
    parts = [".".join(str(x) for x in e["loc"]) + ": " + e["msg"] for e in exc.errors()[:3]]
    return "; ".join(parts) or "invalid payload"


class _Work:
    """Фоновая работа сокета: ход и подсказка.

    ПОЧЕМУ ЗАДАЧАМИ. Шапка этого файла обещает: «читатель никогда не
    блокируется на ИИ, поэтому `response.cancel` доходит мгновенно». Обещание
    было неверным для текстового пути — `await on_player_turn(...)` держал
    читателя весь стрим модели, и кнопка перебивания разбиралась уже ПОСЛЕ
    `response.done` (замер: cancel отправлен на 1.73 с, обработан на 2.11 с).
    Заодно оборванный сокет замечался только после того, как ход дозвонил в
    платные модели до конца.

    Замок здесь не для скорости, а для движка: `on_player_turn` двигает
    `engine.turn`, и два хода внахлёст (голосовой пайплайн + `input.commit`)
    посчитали бы один ход дважды.
    """

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._turns: set[asyncio.Task] = set()
        self._hint: Optional[asyncio.Task] = None

    def start_turn(self, orchestrator: "NegotiationOrchestrator",
                   session: "RealtimeSession", text: str) -> bool:
        if len(self._turns) > _MAX_QUEUED_TURNS:
            return False
        task = asyncio.create_task(self._turn(orchestrator, session, text))
        self._turns.add(task)
        task.add_done_callback(self._turns.discard)
        return True

    async def _turn(self, orchestrator: "NegotiationOrchestrator",
                    session: "RealtimeSession", text: str) -> None:
        # ПРИДЕРЖКА ПО ТЕМПУ ЖИВЁТ ЗДЕСЬ, А НЕ В ЦИКЛЕ ЧТЕНИЯ СОКЕТА.
        #
        # Первая редакция ждала прямо в обработчике `input.commit` — то есть
        # внутри цикла, который читает сообщения. Пока он спал, до сервера не
        # доходило НИЧЕГО: ни `response.cancel`, ни `session.close`. Человек,
        # чей ход придержан, не мог ни перебить оппонента, ни выйти из партии,
        # и снаружи это выглядело как зависший продукт — ровно то, чего
        # придержка вместо отказа и должна была избежать.
        #
        # В задаче она безвредна: ход уже принят, индикатор «оппонент думает»
        # честно горит, а сокет продолжает слушать.
        await _turn_budget(session)
        async with self._lock:
            try:
                await orchestrator.on_player_turn(text)
            except asyncio.CancelledError:
                raise
            except Exception:
                # Ход не состоялся — сказать об этом обязаны: молчащий сокет
                # выглядит как «оппонент думает», и человек ждёт вечно.
                _log.exception("realtime: ход упал")
                session.bus.publish(error("turn_failed", "turn failed"))

    def start_hint(self, session: "RealtimeSession") -> None:
        if self._hint is not None and not self._hint.done():
            return
        self._hint = asyncio.create_task(self._safe_hint(session))

    @staticmethod
    async def _safe_hint(session: "RealtimeSession") -> None:
        try:
            await _send_hint(session)
        except asyncio.CancelledError:
            raise
        except Exception:
            _log.exception("realtime: подсказка упала")

    async def aclose(self) -> None:
        """Сокет ушёл — платить за его ход больше не за что."""
        tasks = [t for t in (*self._turns, self._hint) if t is not None]
        for task in tasks:
            task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task


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
    work = _Work()
    peer = websocket.client.host if websocket.client else ""
    lease: Optional[limits.Lease] = None
    owner: Optional[_Owner] = None

    async def _quiesce() -> None:
        """Погасить всё, что запустил ЭТОТ сокет, и замолчать.

        Замыкание, а не метод: живые задачи — локальные переменные этого вызова,
        и вытесняющему сокету незачем знать, из чего они состоят. Писатель
        гасится последним и обязательно: после `quiesce` в сокет пишет только
        тот, кто вытесняет, — иначе `session.closed` уехал бы вперемешку с
        чанком синтеза.
        """
        await work.aclose()
        if orchestrator is not None:
            with contextlib.suppress(Exception):
                await orchestrator.interrupt(reason="taken_over")
        if vision is not None:
            with contextlib.suppress(Exception):
                await vision.aclose()
        if writer is not None:
            writer.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await writer

    try:
        while True:
            try:
                message = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception:
                # Не-JSON, пустой кадр, бинарный кадр. Раньше это уходило в
                # общий `except` внизу — то есть ОДНО кривое сообщение уносило
                # партию целиком. Сокет смотрит в интернет; мусор в нём —
                # норма, а не исключительная ситуация.
                await websocket.send_json(error("bad_json", "message is not valid JSON"))
                continue
            if not isinstance(message, dict):
                # `null`, массив, число, строка: у всех есть `.get`… только не
                # у них. Проверяем форму, а не ловим AttributeError.
                await websocket.send_json(error("bad_message",
                                                "message must be a JSON object"))
                continue
            kind = message.get("type")

            if session is not None and session.evicted:
                # Партию забрал другой сокет, а этот успел прислать вдогонку
                # ход, отмену или закрытие. Ни одно из них не должно доехать до
                # движка: считать ход дважды и закрывать чужой стол — ровно то,
                # ради чего вытеснение и делалось. Сокет уже закрыт с той
                # стороны, отвечать некуда — просто уходим.
                break

            try:
                # ---- session.init ---------------------------------------------
                if kind == "session.init":
                    if session is not None:
                        await websocket.send_json(error("already_initialized",
                                                        "session already initialized"))
                        continue
                    raw = message.get("payload") or {}
                    if not isinstance(raw, dict):
                        await websocket.send_json(error("bad_payload",
                                                        "payload must be an object"))
                        continue
                    try:
                        payload = SessionInit(**raw)
                    except ValidationError as exc:
                        await websocket.send_json(error("bad_payload", _why(exc)))
                        continue
                    payload.mode = mode  # URL — истина, а не поле в теле

                    # Место под партию занимается ДО генерации сценария: самый
                    # дорогой вызов в продукте не должен уходить в модель ради
                    # партии, которой не дадут начаться. Отказ идёт словами и
                    # отдельным кодом закрытия — молчаливый разрыв клиент
                    # принял бы за обрыв сети и пошёл бы переподключаться.
                    lease = limits.acquire_session(peer)
                    if lease is None:
                        await websocket.send_json(error(
                            "too_many_sessions", limits.too_many_sessions(payload.lang),
                            "rate_limited"))
                        await websocket.close(code=WS_RATE_LIMITED, reason="too_many_sessions")
                        return

                    # ГЕНЕРАЦИЯ «СВОЕЙ СДЕЛКИ» — САМЫЙ ДОРОГОЙ ВЫЗОВ В ПРОДУКТЕ,
                    # и до сих пор он был единственным платным входом вообще без
                    # предела: пределы стоят на партии, на взгляде и на ходе, а
                    # это ни то, ни другое, ни третье. Отказать здесь можно
                    # честно — партии ещё нет, ждать нечему, а готовые столы
                    # никуда не делись. Спрашиваем ДО модели и после аренды:
                    # порядок тот же, что у места под партию.
                    if payload.gameMode == "custom" and not limits.paid_slot(peer):
                        lease.release()
                        lease = None
                        await websocket.send_json(error(
                            "too_many_generations",
                            limits.too_many_generations(payload.lang), "rate_limited"))
                        continue

                    session, problem = await _build_session(payload)
                    if session is None:
                        lease.release()
                        lease = None
                        await websocket.send_json(error("init_failed", problem or "init failed"))
                        continue
                    session.client_host = peer

                    orchestrator, voice, vision = _wire(session)
                    writer = asyncio.create_task(_pump(websocket, session))
                    # Владельцем записываемся ПОСЛЕ того, как всё поднято:
                    # вытесняющий зовёт `quiesce`, и гасить полусобранное было
                    # бы гонкой на ровном месте.
                    owner = _Owner(websocket=websocket, session=session,
                                   quiesce=_quiesce, lease=lease)
                    _OWNERS[session.session_id] = owner
                    await websocket.send_json(_created_payload(session, voice))
                    if payload.resume and session.engine_session.state.status != "active":
                        # A disconnect may have swallowed the final debrief. The
                        # finished state is authoritative; issuance is idempotent.
                        await orchestrator._send_debrief()
                    continue

                if session is None or orchestrator is None:
                    await websocket.send_json(error("not_initialized",
                                                    "send session.init first"))
                    continue

                # ---- input.append ---------------------------------------------
                if kind == "input.append":
                    raw = message.get("input") or {}
                    if not isinstance(raw, dict):
                        await websocket.send_json(error("bad_input",
                                                        "input must be an object"))
                        continue
                    try:
                        # Схема `InputAppend` была объявлена в events.py и не
                        # вызывалась ниоткуда: разбор шёл по `.get()`, поэтому
                        # `video_frames: "строка"` доезжал до модели зрения
                        # посимвольно, а `text: 12345` ронял сессию на срезе.
                        data = InputAppend(**raw)
                    except ValidationError as exc:
                        await websocket.send_json(error("bad_input", _why(exc)))
                        continue

                    if data.text:
                        session.append_input(text=data.text)
                    frames = data.video_frames or []
                    if frames and any(len(f) > MAX_FRAME_B64 for f in frames):
                        # Кадр целиком уезжает в платную модель. Молча урезать
                        # нельзя: клиент решит, что его видели.
                        await websocket.send_json(error("frame_too_large",
                                                        f"frame exceeds {MAX_FRAME_B64} base64 chars"))
                        frames = [f for f in frames if len(f) <= MAX_FRAME_B64]
                    if frames:
                        session.append_input(frames=frames)
                        if vision is not None:
                            # «Кадр изменился» считает браузер: у него кадр уже в
                            # canvas, а по сжатому JPEG честной разницы не получить.
                            # Номер хода снимается ЗДЕСЬ, а не там, где вернётся
                            # модель: взгляд длится секунду, за которую человек
                            # успевает отправить ход, и наблюдение уехало бы в
                            # ленту с чужим номером.
                            vision.offer(frames, change=data.frame_change,
                                         turn=session.turn_id)
                    if data.audio and voice is not None:
                        try:
                            blob = base64.b64decode(data.audio, validate=True)
                        except Exception:
                            await websocket.send_json(error("bad_audio",
                                                            "audio must be base64 PCM16"))
                            continue
                        if len(blob) > MAX_AUDIO_BYTES:
                            await websocket.send_json(error("audio_too_large",
                                                            f"audio chunk exceeds {MAX_AUDIO_BYTES} bytes"))
                            continue
                        # Нечётный хвост — не повод ронять партию: PCM16 идёт
                        # парами байт, лишний байт просто не звук.
                        pcm = np.frombuffer(blob[:len(blob) - len(blob) % 2], dtype=np.int16)
                        voice.feed(pcm)
                    if data.force_listen:
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
                        if not work.start_turn(orchestrator, session, text):
                            await websocket.send_json(error("busy", "turn already in flight"))
                    continue

                # ---- response.cancel (перебивание с клиента) -------------------
                if kind == "response.cancel":
                    await orchestrator.interrupt(reason="client_cancel")
                    continue

                # ---- coach.request (кнопка 💡) ---------------------------------
                if kind == "coach.request":
                    # Задачей, а не `await`: подсказку считает платная модель, и
                    # читатель, вставший на ней, не примет ни перебивания, ни
                    # хода. Вторая просьба, пока первая в пути, — не вторая
                    # подсказка, а второй счёт от провайдера.
                    work.start_hint(session)
                    continue

                # ---- session.close ---------------------------------------------
                if kind == "session.close":
                    await orchestrator.interrupt(reason="session_close")
                    # Человек сам сказал, что закончил — ждать возвращения незачем.
                    store.drop(session.session_id)
                    reason = message.get("reason")
                    await websocket.send_json(session_closed(
                        session.session_id,
                        str(reason)[:64] if isinstance(reason, str) else "user_stop"))
                    break

                await websocket.send_json(error("unknown_event", f"unknown message: {str(kind)[:64]}"))
            except WebSocketDisconnect:
                raise
            except Exception:
                # Сообщение уронило обработчик — партия при этом цела. Наружу
                # идёт код, а не `str(exc)`: питоновский текст исключения
                # рассказывает клиенту про наши типы и поля, а починить по нему
                # всё равно нечего. Подробность — в лог, он наш.
                _log.exception("realtime: %s уронил обработчик", kind)
                with contextlib.suppress(Exception):
                    await websocket.send_json(error("server_error", "internal error"))
                continue

    except WebSocketDisconnect:
        pass
    except Exception:  # сокет не должен падать от кривого сообщения
        _log.exception("realtime: сессия оборвалась исключением")
        with contextlib.suppress(Exception):
            await websocket.send_json(error("server_error", "internal error"))
    finally:
        await work.aclose()
        if orchestrator is not None:
            with contextlib.suppress(Exception):
                await orchestrator.interrupt(reason="disconnect")
            if orchestrator.avatar is not None:
                with contextlib.suppress(Exception):
                    await asyncio.wait_for(orchestrator.avatar.close(), timeout=1)
        if voice is not None:
            # РАСПОЗНАВАНИЕ ЗАКРЫВАЕТСЯ ВМЕСТЕ С СОКЕТОМ. Этой строки здесь не
            # было, и `RealtimeVoicePipeline` пережидал партию: его сессия к
            # OpenAI оставалась открытой, а `_read_loop` и `_send_loop` — живыми
            # задачами до конца процесса. Замер: две сыгранные и ЗАКРЫТЫЕ
            # голосовые партии оставляли ровно два лишних соединения наружу.
            # Молча — потому что публикация в закрытую шину безвредна, и снаружи
            # ничего не ломалось до тех пор, пока провайдер не начинал считать
            # одновременные сессии. На показе, где партии идут комнатой, это
            # ровно тот предел, в который упираются первым.
            with contextlib.suppress(Exception):
                await voice.close()
        if vision is not None:
            with contextlib.suppress(Exception):
                await vision.aclose()
        if session is not None:
            # Снимаемся с владения ТОЛЬКО если владеем: вытесненный сокет
            # доживает свой `finally` уже после того, как запись занял новый,
            # и `pop` без проверки личности вынес бы живого владельца.
            if _OWNERS.get(session.session_id) is owner:
                _OWNERS.pop(session.session_id, None)
            session.bus.close()
            if not session.evicted:
                # Отпускаем, а не удаляем: сокет мог оборваться сам. Явное
                # `session.close` уже удалило сессию выше.
                store.release(session.session_id)
                # Лента камеры живёт в этой сессии, а она сейчас умрёт вместе с
                # сокетом. Откладываем на тот же срок, что и саму партию — и только
                # если возвращаться есть куда: после явного `session.close` партии
                # уже нет в хранилище, и держать её ленту не за чем.
                if store.get(session.session_id) is not None:
                    keep_for_resume(session)
            # Вытесненный не трогает ни хранилище, ни ленту: партия уже чужая, и
            # `release` поставил бы ЖИВОЙ партии срок в пять минут, а `drop` —
            # вынул бы её из-под нового владельца. Ленту ему уже переложило
            # само вытеснение.
        if lease is not None:
            lease.release()
        if writer is not None:
            writer.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await writer


# ---------------------------------------------------------------------------
# Сборка сессии
# ---------------------------------------------------------------------------

def _layers_for(payload: "SessionInit") -> Layers:
    """Слои сессии. В партии НА ЗАЧЁТ — принудительно выключенные, что бы ни
    прислал клиент: правило, которое соблюдает только браузер, правилом не
    является. Зачёт — это экзамен И капстоун курса (`REPRODUCIBLE_MODES`):
    капстоун сверяют с эталонным прогоном движка ровно так же."""
    if reproducible_run(payload.gameMode):
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
            # Resume cannot promote a coached practice run into an exam.
            original_mode = store.context(payload.resume).get("game_mode", "practice")
            payload = payload.model_copy(update={"gameMode": original_mode})
            # Партия могла остаться ЗА ЖИВЫМ СОКЕТОМ: в метро TCP умирает
            # молча, и сервер узнаёт об обрыве позже человека. Прежний владелец
            # вытесняется — с внятной причиной и отдельным кодом закрытия, — а
            # не отказывает вернувшемуся. Делается это ЗДЕСЬ, до
            # `restore_from_resume`: вытеснение откладывает ленту камеры тем же
            # механизмом, что и обрыв, и следующая строка её подхватывает.
            await _evict_owner(payload.resume)
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
        situation = (payload.situation or "").strip()
        if len(situation) < _MIN_SITUATION_CHARS:
            # Спрашиваем ДО модели. Генерация сценария — самый дорогой вызов в
            # продукте (роль `reasoning`, 1400 токенов, бюджет секунд), и пустое
            # описание не даст из него ничего, кроме счёта: `{"gameMode":"custom"}`
            # без ситуации — это оплаченный нами запрос ни о чём.
            return None, ("Опишите ситуацию: с кем и о чём переговоры."
                          if payload.lang == "ru" else
                          "Describe the situation: with whom and about what.")
        generated = (await generate_scenario(situation, payload.lang, context=payload.context)
                     if payload.context else await generate_scenario(situation, payload.lang))
        if generated is None:
            return None, ("Не удалось сгенерировать сценарий. Попробуйте переформулировать ситуацию."
                          if payload.lang == "ru" else
                          "Couldn't generate a scenario. Try rephrasing the situation.")
        scenario_id = generated.id

    try:
        engine_session = engine.create_session(scenario_id, payload.lang)
    except ValueError:
        # Обрезаем ЧУЖУЮ строку, прежде чем вернуть её в ответе. `scenarioId`
        # приходит с улицы и ничем не ограничен: пятимегабайтное поле
        # возвращалось назад целиком, то есть один кривой запрос покупал
        # пятимегабайтный ответ. Все остальные отражения в этом файле уже
        # обрезаны (`_why`, причина закрытия, неизвестное событие) — это было
        # последним.
        return None, f"unknown scenario: {scenario_id[:64]}"

    if payload.reputation is not None:
        views.apply_reputation(engine_session, payload.reputation)

    # УСЛОВИЕ ДНЯ. Накладывается той же схемой, что репутация кампании: это вход
    # партии (длина, стартовые шкалы), а не правило подсчёта — `score_session`
    # о нём не знает. Дату присылает клиент; сверяем, что стол ТОГО дня и правда
    # этот, иначе «короткий стол» можно было бы выпросить на любом сценарии.
    daily_mod = None
    # В зачётной партии условия дня нет вовсе: капстоун со срезанным лимитом
    # ходов — уже не тот капстоун, который доказан прогоном движка.
    if payload.daily and not reproducible_run(payload.gameMode):
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
    from app.engine.scenarios import SCENARIOS
    store.put(session_id, engine_session, context={
        "game_mode": payload.gameMode,
        "attestable": payload.gameMode == "exam" and payload.reputation is None
                      and any(s.id == scenario_id for s in SCENARIOS),
    })
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
        # Provider selection is explicit; failure falls back to text only.
        async def guarded_turn(text: str) -> None:
            """Ход из голоса — через ту же калитку, что и напечатанный.

            Два пути к движку — `input.commit` и распознанная речь, — и предел
            обязан стоять на обоих. Иначе он превращается в предел на КЛАВИАТУРУ:
            микрофон остаётся открытым входом в те же три платных вызова.
            """
            await _turn_budget(session)
            await orchestrator.on_player_turn(text)

        want_realtime = voice_mode() == "realtime"
        pipeline = RealtimeVoicePipeline(
            lang=session.lang,
            on_turn=guarded_turn,
            on_interrupt=lambda: orchestrator.interrupt(reason="barge_in"),
            publish=session.bus.publish,
        ) if want_realtime else None
        if voice_mode() == "classic":
            pipeline = VoicePipeline(
                asr=make_asr(), lang=session.lang,
                on_turn=guarded_turn,
                on_interrupt=lambda: orchestrator.interrupt(reason="barge_in"),
                publish=session.bus.publish,
            )
        if pipeline is not None and pipeline.available:
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
                                pokerface=session.layers.pokerface,
                                # Бюджет спрашивается ТАМ, ГДЕ ВЫЗОВ И
                                # ПРОИСХОДИТ. Кадры приходят несколько раз в
                                # секунду, а смотрит слой раз в восемь: списание
                                # за каждый предложенный кадр опустошило бы
                                # ведро, не потратив у провайдера ни копейки.
                                budget=lambda: _vision_budget(session))
        vision = sampler if sampler.available() else None

    return orchestrator, voice, vision


async def _turn_budget(session: RealtimeSession) -> None:
    """Придержать ход, если с этого адреса они идут слишком часто.

    ПОЧЕМУ ПРЕДЕЛ ЕСТЬ. Ход — самый дорогой вход в продукт: судья, поток
    реплики оппонента, синтез речи. Три платных вызова, и не ограничивало их
    ничто — при том что куда более дешёвый взгляд камеры считали внимательно.
    Довод про пароль тот же, что в `limits.py`: на показе его знают все, кому
    назвали.

    ПОЧЕМУ ЗДЕСЬ НЕТ ОТКАЗА. Отказанный ход оставил бы человека перед вечным
    «оппонент печатает»: клиент ждёт `response.done`, а ошибка внутри партии
    ложится строкой в ленту и индикатор не гасит. Поэтому ход не отвергается
    никогда — он ждёт. Живая комната идёт вдвое медленнее предела и ожидания
    не заметит; скрипт поедет медленнее, что и требовалось.
    """
    delay = limits.turn_delay(session.client_host)
    if delay > 0:
        await asyncio.sleep(delay)


def _vision_budget(session: RealtimeSession) -> bool:
    """Хватает ли адресу бюджета ещё на один взгляд платной модели.

    ОТКАЗ ГОВОРИТСЯ ВСЛУХ, НО ОДИН РАЗ. Молчащий слой неотличим от сломанной
    камеры — а «выглядит настоящим, а внутри пусто» в продукте не бывает. Зато
    кадры идут потоком, и честность на каждом кадре превратилась бы в поток
    ошибок, за которым не видно партии. Поэтому первая исчерпанная секунда
    называется словами, а дальше слой просто реже смотрит.
    """
    if limits.vision_allowed(session.client_host):
        return True
    if not session.vision_limit_told:
        session.vision_limit_told = True
        session.bus.publish(error("vision_rate_limited",
                                  limits.vision_rate_limited(session.lang),
                                  "rate_limited"))
    return False


def _make_avatar(session: RealtimeSession) -> AvatarProvider:
    """Voice uses local amplitude animation; text keeps the portrait provider."""
    if session.avatar_provider is None:
        session.avatar_provider = create_avatar(session.engine_session.scenario_id,
                                                session.bus.publish, voice=session.layers.voice)
    return session.avatar_provider


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
        "asr": describe_voice(),
        "camera": bool(session.layers.camera) and orchat.available(),
        # Отдельная возможность, а не подпункт камеры: тумблер «покерфейс»
        # может стоять, а слой при этом не подняться (нет ключа — нет модели
        # зрения). Клиент обязан различать «выключено» и «недоступно».
        "pokerface": bool(session.layers.pokerface) and orchat.available(),
        # Условие дня — не возможность, а факт партии, но едет тем же путём:
        # клиент показывает подпись, только если условие ДЕЙСТВИТЕЛЬНО легло.
        "daily": session.daily,
        # Не глобальный выключатель, а ответ про ЭТОТ стол: на экзамене
        # судьи нет, и бейдж «судит ИИ по смыслу» рисовать не на чем.
        "judge": judge_enabled_for(session.game_mode),
        "cloud_ai": orchat.available(),
        "models": describe_models(),
        "avatar": {"available": False, "lipsync": False, "transport": "none"},
    }
    if session.layers.avatar:
        caps = _make_avatar(session).capabilities()
        capabilities["avatar"] = {
            "available": caps.available, "lipsync": caps.lipsync,
            "lipsync_mode": caps.lipsync_mode,
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

    А ВОТ «СМОТРЕЛ И МОЛЧАЛ» — ЭТО НЕ «НЕ СМОТРЕЛ». Пустая лента отвечала сразу
    на два разных вопроса одинаково: слой, который посмотрел двенадцать раз и
    каждый раз честно ответил «ничего примечательного», выглядел в разборе точно
    так же, как слой, не поднявшийся вовсе. Это то самое четвёртое состояние,
    только с обратным знаком — работающий слой, показанный как отсутствующий.
    Поэтому число досмотренных кадров едет отдельным ключом, и едет ТОЛЬКО когда
    смотреть и правда получалось.
    """
    deb = event.get("debrief")
    if not isinstance(deb, dict):
        return
    if session.vision_notes:
        deb["observations"] = list(session.vision_notes)
    else:
        deb.pop("observations", None)
    if session.vision_looks:
        deb["observation_looks"] = session.vision_looks
    else:
        deb.pop("observation_looks", None)


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

    # ПОЧЕМУ ЗДЕСЬ ПРЕДЕЛ. `_Work.start_hint` не даёт считать ДВЕ подсказки
    # одновременно — и только. Пятое нажатие подряд стоило одного счёта, а
    # пятое ПОСЛЕ ответа — второго, и так сколько угодно: кнопка 💡 была
    # платным вызовом без всякого предела на адрес. Ведро общее с ходом
    # (`limits.paid_slot`): кошелёк один.
    #
    # Отказ здесь ничего не ломает и ничего не имитирует: `base` — это
    # настоящая подсказка движка, та самая, которой продукт живёт в офлайне.
    # Человек получает совет, просто не переписанный моделью.
    if orchat.available() and limits.paid_slot(session.client_host):
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
