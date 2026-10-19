"""negotiation.py — оркестратор хода. Сердце новой архитектуры.

╔══════════════════════════════════════════════════════════════════════════╗
║ ПОРТ UPSTREAM-КОДА                                                       ║
║ Источник: TEN Framework, Apache-2.0 + доп. условия Agora (неконкуренция); ║
║           разбор — docs/upstream-code-map.md §5                          ║
║ Коммит:   2e56d9659d8599350962374c0dc24725a03d73ce                       ║
║ Файл:     ai_agents/agents/examples/voice-assistant/tenapp/              ║
║           ten_packages/extension/main_python/extension.py                ║
║ Дополнено: Open-LLM-VTuber (MIT, 992309c0),                              ║
║           conversations/conversation_handler.py:112 — `heard_response`   ║
║ Полный провенанс: docs/upstream-code-map.md                              ║
╚══════════════════════════════════════════════════════════════════════════╝

ЧТО ВЗЯТО У TEN. Форма `MainControlExtension`: владение ходом через `turn_id`,
накопление `sentence_fragment` с отдачей готовых фраз в синтез по мере
готовности, и — главное — `_interrupt()` как ОДНА точка, которая гасит все
подсистемы разом. У TEN это три адресата (LLM, TTS, RTC-канал); у нас четыре,
добавился аватар.

ЧТО ДОБАВЛЕНО ИЗ Open-LLM-VTuber И ЗАЧЕМ. У TEN при перебивании услышанный
кусок просто теряется. Для болталки это неважно, для переговоров — нет: если
оппонента оборвали на «Я готов уступить, если вы…», а он этого не помнит, то
следующей репликой он повторит ту же мысль с начала. В голосе это слышно
мгновенно и полностью разрушает ощущение живого человека. Поэтому кусок
дописывается в историю (`RealtimeSession.interrupt()`).

ЧТО ЗДЕСЬ НЕ ПОМЕНЯЛОСЬ И НЕ ПОМЕНЯЕТСЯ. Порядок остаётся прежним: судья →
движок → оппонент. Движок — единственный источник истины. ИИ не решает, сдвинулась
ли цена, вскрыт ли интерес и какой грейд: он только формулирует то, что движок
уже посчитал. Изменилась не логика, а способ ожидания — три последовательных
блокирующих вызова превратились в конвейер, где каждый результат уходит клиенту
в тот момент, когда становится известен.

ПОЧЕМУ ЭТО ВАЖНО ДЛЯ ОЩУЩЕНИЯ. Раньше игрок отправлял реплику и несколько
секунд смотрел на пустоту. Теперь: теги приёмов появляются мгновенно
(детерминированный разбор), затем честная подпись «судья читает», затем реплика
оппонента печатается и звучит по фразам. Пауза не исчезла — она стала
объяснимой и заполненной.
"""

from __future__ import annotations

import asyncio
import time
from typing import Callable, Optional

from app import engine, views
from app.probe import ProbeMemory, next_probe
from app.ai.prompts import build_prompts
from app.avatar.base import AvatarProvider, state_for_reaction
from app.orchestrator.judge import judge_enabled_for, judge_turn
from app.orchestrator.tts_manager import TTSTaskManager
from app.providers.openrouter import chat as orchat
from app.realtime.events import output_delta, response_done
from app.realtime.session import MAX_TURN_CHARS, RealtimeSession
from app.vendor.olv.sentence_divider import SentenceDivider


#: Сколько ждём слово наставника, прежде чем отдать разбор без него. Разбор
#: самодостаточен: грейд, шкалы, ключевые ходы и советы посчитал движок.
DEBRIEF_NOTE_BUDGET_S = 8.0
# Total wall-clock budget, including a provider that drips tokens indefinitely.
OPPONENT_STREAM_BUDGET_S = 15.0


#: Короткие реакции по характеру персонажа. Нейтральные: «так» и «угу» не
#: соглашаются и не спорят — ими человек показывает, что услышал, пока думает.
#: Без «понимаю» и «хорошо»: первое — штамп, второе звучит как согласие с
#: тем, чего движок ещё не посчитал.
_BACKCHANNELS = {
    "ru": {"tough": ["Так.", "Ага.", "Ну…"],
           "analytical": ["Так…", "Секунду…", "Ага…"],
           "": ["Так…", "Угу…", "Ага…"]},
    "en": {"tough": ["Right.", "Uh-huh.", "Well…"],
           "analytical": ["Okay…", "One second…", "Mm-hm…"],
           "": ["Mm-hm…", "Right…", "Okay…"]},
}


def backchannel_phrases(lang: str, style: str | None) -> list[str]:
    table = _BACKCHANNELS.get(lang, _BACKCHANNELS["ru"])
    return list(table.get(style or "", table[""]))


class NegotiationOrchestrator:
    """Один ход игрока от начала до конца."""

    def __init__(self, session: RealtimeSession,
                 tts: Optional[TTSTaskManager] = None,
                 avatar: Optional[AvatarProvider] = None) -> None:
        self.session = session
        self.tts = tts
        self.avatar = avatar
        if tts and avatar:
            tts.on_audio = avatar.speak
            tts.on_audio_error = self._fallback_avatar
            # У локальных лиц оба — пустые: звук идёт в шину сразу, конец
            # звука никому не сообщается. Лицо от внешнего сервиса придерживает
            # звук под свои кадры и дорисовывает хвост реплики по сигналу конца.
            tts.audio_out = avatar.audio_out
            tts.on_audio_end = avatar.end_of_speech
        self._generation_task: Optional[asyncio.Task] = None
        #: Кому сообщать, звучит ли голос оппонента. Ставится извне
        #: (`realtime/endpoint.py`) на голосовой пайплайн — без этого его защита
        #: от самоподслушивания мертва.
        self.on_speaking_change: Optional[Callable[[bool], None]] = None
        #: Короткие реакции («Угу…»), которые уже готовы голосом персонажа, и
        #: номер хода, на котором реакция уже прозвучала: одна на ход.
        self._backchannels: list[str] = []
        self._backchannel_turn = -1
        self._backchannel_next = 0

    # ------------------------------------------------------- короткая реакция

    def prepare_backchannel(self) -> Optional[asyncio.Task]:
        """Заранее озвучить короткие реакции голосом персонажа (в созвоне).

        Жалоба владельца 19.10: человек договорил, а собеседник молчит секунды
        — распознавание, судья, мысль, синтез, — и кажется, что всё зависло.
        Живой человек на созвоне в эту секунду отзывается: «так…», «угу». Звук
        готовится заранее, чтобы реакция шла сразу, без полусекунды синтеза.
        """
        if not self.tts:
            return None
        try:
            style = engine.by_id(self.session.engine_session.scenario_id).counterpart.style
        except Exception:
            style = ""
        phrases = backchannel_phrases(self.session.lang, style)

        async def run() -> None:
            for phrase in phrases:
                if await self.tts.prepare(phrase):
                    self._backchannels.append(phrase)
        return asyncio.create_task(run())

    def backchannel(self) -> bool:
        """Человек, похоже, договорил — отозваться коротко, пока готовится ответ.

        Не звучит, если собеседник ещё говорит (перебивать себя нельзя), если
        на этом ходу реакция уже была, если стол закрыт или звука не готово.
        Реакция — своё поколение без текста: в журнал разговора не пишется, и
        настоящий ответ, начинаясь, гасит её, если она ещё звучит."""
        sess = self.session
        if not self.tts or not self._backchannels:
            return False
        if sess.engine_session.state.status != "active":
            return False
        if self._backchannel_turn == sess.turn_id:
            return False
        if self.tts.playing_until > time.monotonic() or (
                self._generation_task is not None and not self._generation_task.done()):
            return False
        phrase = self._backchannels[self._backchannel_next % len(self._backchannels)]
        self._backchannel_next += 1
        self._backchannel_turn = sess.turn_id
        generation_id = sess.begin_generation()
        return self.tts.speak_prepared(phrase, generation_id=generation_id, turn_id=sess.turn_id + 1)

    def _set_speaking(self, speaking: bool) -> None:
        if self.on_speaking_change:
            self.on_speaking_change(speaking)

    async def _fallback_avatar(self) -> None:
        """A broken optional face must not discard an already applied move."""
        from app.avatar.amplitude import AmplitudeAvatar
        old = self.avatar
        if old:
            # Придержанный старым лицом звук — человеку сейчас и по порядку,
            # ДО того, как синтез начнёт публиковать мимо него: иначе
            # следующий кусок реплики обогнал бы предыдущий.
            old.flush_audio()
        self.avatar = AmplitudeAvatar(self.session.engine_session.scenario_id, self.session.bus.publish)
        self.session.avatar_provider = self.avatar
        if self.tts:
            self.tts.on_audio = self.avatar.speak
            self.tts.audio_out = self.avatar.audio_out
            self.tts.on_audio_end = self.avatar.end_of_speech
        await self.avatar.set_state('listening')
        if old:
            try:
                await asyncio.wait_for(old.close(), timeout=0.1)
            except asyncio.CancelledError:
                raise
            except Exception:
                pass

    async def _avatar_state(self, state: str, *, reaction: str | None = None) -> None:
        if not self.avatar:
            return
        try:
            await asyncio.wait_for(self.avatar.set_state(state, reaction=reaction), timeout=0.05)
        except asyncio.CancelledError:
            raise
        except Exception:
            await self._fallback_avatar()
            await self.avatar.set_state(state, reaction=reaction)

    # ------------------------------------------------------------------ ход

    async def on_player_turn(self, text: str) -> None:
        """Игрок сходил. Текст уже нормализован (клавиатура и ASR тут неразличимы).

        Модальность здесь не упоминается ни разу — это и есть тот инвариант,
        ради которого протокол держится текстовым в ядре.
        """
        sess = self.session
        engine_sess = sess.engine_session
        bus, lang = sess.bus, sess.lang

        # Предел — тот же, что у сокета и у композера. Здесь стояло 800 при
        # вводе до 2000: пузырь показывал ход целиком, а движок и судья видели
        # обрезок, и вопрос или цена в хвосте молча терялись — офлайн-ядро
        # читало всё (инвариант 8, найдено после аудита 17.10).
        text = (text or "").strip()[:MAX_TURN_CHARS]
        if not text or engine_sess.state.status != "active":
            return

        # Если оппонент ещё говорит — его перебили самим фактом хода.
        await self.interrupt(reason="new_turn")

        # 1. Детерминированный разбор. Мгновенный, без сети: теги приёмов
        #    появляются под репликой игрока раньше, чем оппонент начал думать.
        #
        #    РАЗБОР СОСТОИТ ИЗ ДВУХ РАЗНЫХ ВЕЩЕЙ, И ГОТОВЫ ОНИ В РАЗНОЕ ВРЕМЯ.
        #    `tags`/`primary`/`spin`/`flags` считает классификатор — он и есть
        #    те самые 3 мс, и после этого их уже ничто не меняет: ни судья, ни
        #    `apply_move` к ним не притрагиваются (проверено на эталонных
        #    партиях, `tests/test_analysis_split.py`). А `arg_quality` здесь
        #    ЧЕРНОВОЙ: судья его перепишет, штраф за повтор — обрежет. Поэтому
        #    число из этого события показывать игроку нельзя; авторитетное
        #    уходит ниже, в `engine.state`.
        analysis = engine.analyze(text)
        # НОМЕР ХОДА ЗАКРЕПЛЯЕТСЯ В ТОЧКЕ ПРИНЯТИЯ, А НЕ ЗДЕСЬ. До `apply_move`
        # впереди ожидание судьи — секунда сети, — и отмена в эту секунду
        # (обрыв, вытеснение) раньше оставляла счётчик увеличенным без
        # применённого хода и без строки в журнале: партия теряла ход из
        # лимита. Теперь всё до точки принятия — черновик без побочных
        # эффектов на движке; сама точка ниже не содержит ни одного `await`.
        turn_id = engine_sess.turn + 1
        bus.publish({
            "type": "turn.analysis",
            "turn_id": turn_id,
            "text": text,
            "analysis": views.analysis_view(analysis).model_dump(),
        })

        # 2. Судья. Честное имя ожидания: он читает реплику, а оппонент в этот
        #    момент ещё ничего не «печатает» — движок не может посчитать ход,
        #    пока не получил балл.
        judgement = None
        # На экзамене судьи нет вовсе — см. `judge_enabled_for`: его балл
        # невоспроизводим, а сертификат обязан быть воспроизводимым.
        if judge_enabled_for(sess.game_mode):
            bus.publish({"type": "judge.started", "turn_id": turn_id})
            if self.avatar:
                await self._avatar_state("thinking")
            try:
                context, interests = views.judge_context(engine_sess)
                secondary = views.judge_secondary(engine_sess)
                judgement = await judge_turn(context, text, lang, interests, secondary)
            except Exception:
                judgement = None
            bus.publish({"type": "judge.completed", "turn_id": turn_id,
                         "semantic": judgement is not None})

        # 3. ТОЧКА ПРИНЯТИЯ ХОДА. Отсюда и до публикации `engine.state` — ни
        #    одного `await`: счётчик, движок и журнал меняются одним куском, и
        #    отмена либо не застаёт ход вовсе, либо застаёт его принятым.
        #    Движок считает ход — ЕДИНСТВЕННОЕ место, где меняется состояние игры.
        engine_sess.turn = turn_id
        result = engine.apply_move(engine_sess, analysis, text, judge=judgement)

        timeout = views.close_on_turn_limit(engine_sess, result)

        engine_sess.log.append({"role": "player", "text": text, "judge": judgement,
                                "turn": turn_id, "deltas": result.deltas})

        # 4. Истина движка уходит клиенту немедленно — до реплики оппонента.
        #    Здесь же едет ОКОНЧАТЕЛЬНОЕ качество аргумента: то самое число,
        #    которое `apply_move` только что положил в метрики и которое войдёт
        #    в грейд. До этой строки клиент видел черновик из `turn.analysis` —
        #    ни судейский, ни движковый: спам-реплика показывала 84, а в счёт
        #    шло 12. `judged` называет источник, чтобы keyword-балл никогда не
        #    рисовался под видом судейского (принцип 2).
        bus.publish({
            "type": "engine.state",
            "turn_id": turn_id,
            "state": views.state_view(engine_sess).model_dump(),
            "deltas": views.deltas_view(result).model_dump(),
            "arg_quality": analysis.arg_quality,
            "judged": judgement is not None,
            "reaction": result.reaction,
            "closed": result.closed,
        })
        # Вопрос строится только ПОСЛЕ судьи, apply_move и проверки лимита:
        # ранний анализ ещё не знает ни реакции, ни того, закрылся ли стол.
        probe = (next_probe(result.reaction, turn_id, result.closed, sess.probe_memory)
                 if sess.layers.probe else None)
        if judgement:
            # Заметка судьи, называющая ещё не вскрытый интерес, не уходит:
            # подсказка не выдаёт ответ до вопроса (`views.names_unrevealed_interest`).
            note = judgement.get("note") or ""
            if views.names_unrevealed_interest(engine_sess, lang, note):
                note = ""
            bus.publish({
                "type": "turn.coach",
                "turn_id": turn_id,
                "text": note,
                "techniques": list(judgement.get("techniques") or []),
                # Низкий семантический балл при сработавших ключевых словах —
                # это попугайство, а не приём. Отсюда зачёркнутая плашка в UI.
                "reject": int(judgement.get("arg_score", 100)) < 35,
            })

        # 5. Лицо оппонента. Эмоцию знает движок — модель об этом не спрашивают.
        if self.avatar:
            await self._avatar_state(state_for_reaction(result.reaction), reaction=result.reaction)

        # 6. Реплика. Шаблон движка — не запасной план на случай беды, а базовая
        #    линия: без сети игра целиком идёт на нём.
        templated = (views.timeout_line(lang) if timeout
                     else engine.render_line(engine_sess, result.reaction, result.closed))

        interrupted = False
        if timeout or not orchat.available():
            await self._deliver_plain(templated, turn_id)
        else:
            facts = views.build_facts(engine_sess, result)
            facts["fallback"] = templated
            if sess.observations:
                # Зрение попадает в контекст оппонента, но НИКОГДА в счёт.
                facts["observations"] = sess.observations[-3:]
            cues = sess.fresh_cues(turn_id)
            if cues:
                # Мимика — подписями на языке партии, а не кодами и не текстом
                # модели: из-за границы доверия в промпт едет только закрытый
                # список (`vision.CUES`). На предложение и настрой не влияет —
                # их считает движок, и это повторено в самом промпте.
                from app.perception.vision import cue_labels
                facts["face_cues"] = cue_labels(cues, lang)
            reply = self._generation_task = asyncio.create_task(
                self._stream_opponent(facts, templated, turn_id))
            try:
                await reply
            except asyncio.CancelledError:
                # ПЕРЕБИЛИ РЕПЛИКУ, А НЕ ХОД. `interrupt()` гасит задачу
                # реплики, а ход её ждёт — и отмена раньше приходила сюда же:
                # закрывший стол ход, перебитый на «Отлично, по рукам…», так и
                # не отправлял разбор (найдено после аудита 17.10). Отменён сам
                # ход (обрыв, вытеснение — `_Work.aclose`) — выходим.
                me = asyncio.current_task()
                if me is not None and me.cancelling():
                    raise
                interrupted = True

        # Показываем вопрос после реплики, как в офлайне: иначе карточка
        # встанет между частями ещё печатающегося ответа. Перебитый ответ
        # такт вопросов не сдвигает: человек уже говорит следующий ход.
        if probe and not interrupted:
            sess.probe_memory = ProbeMemory(turn_id, result.reaction)
            bus.publish({"type": "probe", **probe.model_dump()})

        if result.closed:
            await self._send_debrief()

    # ------------------------------------------------------- реплика оппонента

    async def _deliver_plain(self, line: str, turn_id: int) -> None:
        """Отдать готовую реплику целиком (офлайн / таймаут партии)."""
        sess = self.session
        generation_id = sess.begin_generation()
        self._set_speaking(True)
        sess.engine_session.log.append({"role": "opp", "text": line})
        sess.bus.publish(output_delta("text", generation_id=generation_id,
                                      turn_id=turn_id, text=line, final=True))
        if self.tts:
            self.tts.speak(line, generation_id=generation_id, turn_id=turn_id)
        sess.bus.publish(response_done(generation_id=generation_id, turn_id=turn_id,
                                       text=line, reason="turn_end"))
        self._finish_generation()

    async def _stream_opponent(self, facts: dict, templated: str, turn_id: int) -> None:
        """Поток модели → фразы → одновременно текст на экран и звук в синтез.

        Конвейер здесь и есть ответ на задержку. Модель ещё генерирует третье
        предложение, а первое уже звучит.
        """
        sess = self.session
        generation_id = sess.begin_generation()
        self._set_speaking(True)
        system, user = build_prompts(facts)
        divider = SentenceDivider(faster_first_response=True)

        async def token_stream():
            async with asyncio.timeout(OPPONENT_STREAM_BUDGET_S):
                async for chunk in orchat.stream(system, user, role="opponent",
                                                 max_tokens=220, temperature=0.8):
                    # Сырые токены — клиенту сразу, чтобы реплика печаталась.
                    sess.spoken_so_far += chunk
                    sess.bus.publish(output_delta("text", generation_id=generation_id,
                                                  turn_id=turn_id, text=chunk))
                    yield chunk

        from app.ai.sanitize import contradicts, rejected, reply_verdict, sanitize, speakable

        collected: list[str] = []
        #: Прозвучало ли хоть что-то. Нужно для случая, когда отвергнуты ВСЕ
        #: фразы: молчащий оппонент в голосовом режиме — это не «честно», это
        #: сломанный ход.
        spoken_any = False
        #: Реплика уже испорчена — дальше не озвучиваем ничего.
        tainted = False
        #: Реплика спорит с движком (sanitize.reply_verdict) — в итог идёт шаблон.
        contradicted = False
        #: Фразы, которые ещё нельзя озвучить: реплика может закончиться и
        #: оправданием («…, могу 95»), и обещанием («…, и по рукам»).
        held: list[str] = []
        try:
            async for sentence in divider.process_stream(token_stream()):
                phrase = (sentence.text or "").strip()
                if not phrase:
                    continue
                collected.append(phrase)
                # ЗВУК ПРОВЕРЯЕТСЯ ЗДЕСЬ, А НЕ ВНИЗУ. Санитайзер под этим
                # циклом судит реплику целиком — и к тому моменту синтез уже
                # отзвучал: фраза уходит в озвучку, как только сложилась, ради
                # чего весь конвейер и построен. Поэтому «как языковая модель,
                # я не могу вести переговоры» получало замену пузыря на шаблон,
                # а человек эту фразу УЖЕ СЛЫШАЛ. В голосовом режиме звук и
                # есть реплика.
                # ПЕРВАЯ ЖЕ ИСПОРЧЕННАЯ ФРАЗА ПОРТИТ ВСЮ РЕПЛИКУ, и это не
                # перестраховка. Делитель режет поток на КУСКИ, а не на
                # предложения — он торопится отдать первый звук и рвёт по
                # запятой тоже. «Как языковая модель, я не могу вести
                # переговоры.» распадается на «Как языковая модель,» и «я не
                # могу вести переговоры.»: маркер выхода из роли остаётся в
                # первом куске, а второй — уже «чистый» — уходил в синтез, и
                # человек слышал отказ. Проверка каждого куска по отдельности
                # эту реплику НЕ ловит; ловит только память о том, что реплика
                # уже испорчена.
                if rejected(phrase):
                    tainted = True
                # Обещание, которого движок не дал, — та же порча: прозвучав,
                # оно уже обмануло. Судится НАКОПЛЕННЫЙ текст (делитель рвёт
                # поток и по запятой), а сомнительное придерживается до конца
                # реплики (см. reply_verdict).
                verdict = "ok" if contradicted else reply_verdict(" ".join(collected), facts, final=False)
                if verdict == "bad":
                    contradicted = tainted = True
                    held = []
                    sess.reply_rejected = True
                say = None if tainted else speakable(phrase)
                if say:
                    held.append(say)
                if self.tts and verdict == "ok" and not tainted:
                    for part in held:
                        self.tts.speak(part, generation_id=generation_id, turn_id=turn_id)
                        spoken_any = True
                    held = []
        except asyncio.CancelledError:
            # Перебили. `interrupt()` уже дописал услышанное в историю и погасил
            # поколение на шине — здесь просто выходим.
            raise
        except Exception:
            # Поток сорвался — итогом станет шаблон движка, и звучать обязан он
            # же. Придержанное («Договорились,» до конца реплики) раньше
            # озвучивалось здесь как сошедшееся: человек слышал сделку, которой
            # движок не давал, а видел шаблон (найдено после аудита 17.10).
            collected, held = [], []
            tainted = True

        # Авторитетный итог. Дельты были сырыми; санитайзер судит реплику
        # целиком и может её отвергнуть — тогда остаётся шаблон движка.
        if not contradicted and contradicts(" ".join(collected), facts):
            contradicted = tainted = True
            sess.reply_rejected = True
        final = (None if contradicted else sanitize(" ".join(collected))) or templated
        # Придержанное звучит, только если реплика сошлась целиком.
        if self.tts and held and not tainted:
            for part in held:
                self.tts.speak(part, generation_id=generation_id, turn_id=turn_id)
                spoken_any = True
        # Не прозвучало НИЧЕГО — значит отвергнуты все фразы (или модель
        # промолчала). Озвучиваем итог: он либо очищенная реплика, либо шаблон
        # движка, и то и другое в характере. Иначе ход прошёл бы в тишине.
        # Озвучиваем итог, если реплика испорчена (тогда `final` — шаблон
        # движка) или если не прозвучало вообще ничего. Небольшой повтор, когда
        # начало успело прозвучать до порчи, — приемлемая цена: услышанный
        # выход из роли дороже.
        if self.tts and (tainted or not spoken_any) and final:
            self.tts.speak(final, generation_id=generation_id, turn_id=turn_id)
        sess.engine_session.log.append({"role": "opp", "text": final})
        sess.bus.publish(response_done(generation_id=generation_id, turn_id=turn_id,
                                       text=final, reason="turn_end"))
        self._finish_generation()

    def _finish_generation(self) -> None:
        """Текст реплики закончен — но поколение ещё ЖИВО.

        Это не педантизм, а исправление настоящей ошибки. `response.done` значит
        «модель дописала текст»; звук в этот момент ещё синтезируется и играет
        секундами дольше. Если обнулить `generation_id` здесь, то `interrupt()`
        решит, что гасить нечего, и человек, заговоривший поверх звучащей
        реплики, не сможет её перебить — самый заметный сбой из возможных.

        Поколение закрывается только двумя способами: его гасит `interrupt()`
        или его сменяет следующее (`begin_generation`).
        """
        # Услышанное дописано в историю обычной репликой — чтобы `interrupt()`
        # не занёс её второй раз как оборванную.
        self.session.spoken_so_far = ""
        # Новых фраз этого поколения не будет: синтез скажет лицу «конец
        # звука», когда отдаст последнее (без слушателя — ничего не делает).
        if self.tts and self.session.generation_id:
            self.tts.finish(self.session.generation_id)

    # ------------------------------------------------------------ перебивание

    async def interrupt(self, reason: str = "barge_in") -> None:
        """Погасить ответ оппонента. Единственная точка (порт `_interrupt` TEN).

        Порядок важен. Сначала гасим шину — с этого момента ни один чанк, даже
        уже опубликованный, наружу не выйдет. Потом останавливаем производителей:
        всё, что они успеют дописать, уже никого не догонит.
        """
        sess = self.session
        if sess.generation_id is None and self._generation_task is None:
            return

        cancelled = sess.interrupt(reason=reason)  # шина + `heard_response` в историю

        if self._generation_task and not self._generation_task.done():
            self._generation_task.cancel()
            try:
                await self._generation_task
            except (asyncio.CancelledError, Exception):
                pass
        self._generation_task = None

        self._set_speaking(False)
        if self.tts:
            self.tts.clear()
        if self.avatar:
            try:
                await asyncio.wait_for(self.avatar.interrupt(), timeout=0.05)
            except asyncio.CancelledError:
                raise
            except Exception:
                await self._fallback_avatar()

        if cancelled:
            sess.bus.publish({"type": "generation.cancelled",
                              "generation_id": cancelled, "reason": reason})

    # ----------------------------------------------------------------- разбор

    async def _send_debrief(self) -> None:
        """Финальный разбор. Считает движок; ИИ только пишет сопроводительное слово."""
        sess = self.session
        deb = views.debrief_view(sess.engine_session).model_dump()
        if sess.game_mode == "exam":
            from app.attestation import enabled, issue
            deb["attestation_enabled"] = enabled()
            try:
                deb["attestation"] = await asyncio.to_thread(issue, sess)
            except Exception:
                # Registry failures must not lose a completed negotiation.
                deb["attestation"] = None
        deb["turning_points"] = views.turning_points(sess.engine_session)

        if sess.observations:
            # Наблюдения камеры — отдельной карточкой с плашкой «наблюдение,
            # не влияет на оценку». Внутрь счёта они не попадают физически:
            # `score_session` их не видит (они живут в RealtimeSession).
            deb["observations"] = sess.observations

        if orchat.available():
            # Слово наставника — украшение поверх готового разбора, поэтому у него
            # есть потолок ожидания. Без него медленная модель задерживала ВЕСЬ
            # разбор: он публикуется одним событием, и человек смотрел в пустоту
            # столько, сколько думала модель (замер на glm-5.3 — минуты).
            try:
                facts = views.debrief_facts(sess.engine_session, deb, sess.lang)
                note = await asyncio.wait_for(
                    self._debrief_note(facts, sess.lang), timeout=DEBRIEF_NOTE_BUDGET_S)
                if note:
                    deb.update(note)
            except Exception:  # включая TimeoutError: разбор важнее украшения
                pass

        sess.bus.publish({"type": "debrief", "debrief": deb})

    async def _debrief_note(self, facts: dict, lang: str) -> Optional[dict]:
        """Сопроводительное слово наставника: пересказывает счёт, но не меняет его."""
        from app.ai.debriefer import build_prompts as debrief_prompts, parse as debrief_parse
        system, user = debrief_prompts(facts, lang)
        raw = await orchat.complete(system, user, role="reasoning",
                                    max_tokens=400, temperature=0.4, raw=True)
        parsed = debrief_parse(raw or "", lang)
        if not parsed:
            return None
        return {"ai_verdict": parsed.get("verdict"), "ai_strength": parsed.get("strength"),
                "ai_growth": parsed.get("growth")}
