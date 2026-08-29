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
from typing import Callable, Optional

from app import engine, views
from app.ai.prompts import build_prompts
from app.avatar.base import AvatarProvider, state_for_reaction
from app.orchestrator.judge import judge_enabled_for, judge_turn
from app.orchestrator.tts_manager import TTSTaskManager
from app.providers.openrouter import chat as orchat
from app.realtime.events import output_delta, response_done
from app.realtime.session import RealtimeSession
from app.vendor.olv.sentence_divider import SentenceDivider


#: Сколько ждём слово наставника, прежде чем отдать разбор без него. Разбор
#: самодостаточен: грейд, шкалы, ключевые ходы и советы посчитал движок.
DEBRIEF_NOTE_BUDGET_S = 8.0


class NegotiationOrchestrator:
    """Один ход игрока от начала до конца."""

    def __init__(self, session: RealtimeSession,
                 tts: Optional[TTSTaskManager] = None,
                 avatar: Optional[AvatarProvider] = None) -> None:
        self.session = session
        self.tts = tts
        self.avatar = avatar
        self._generation_task: Optional[asyncio.Task] = None
        #: Кому сообщать, звучит ли голос оппонента. Ставится извне
        #: (`realtime/endpoint.py`) на голосовой пайплайн — без этого его защита
        #: от самоподслушивания мертва.
        self.on_speaking_change: Optional[Callable[[bool], None]] = None

    def _set_speaking(self, speaking: bool) -> None:
        if self.on_speaking_change:
            self.on_speaking_change(speaking)

    # ------------------------------------------------------------------ ход

    async def on_player_turn(self, text: str) -> None:
        """Игрок сходил. Текст уже нормализован (клавиатура и ASR тут неразличимы).

        Модальность здесь не упоминается ни разу — это и есть тот инвариант,
        ради которого протокол держится текстовым в ядре.
        """
        sess = self.session
        engine_sess = sess.engine_session
        bus, lang = sess.bus, sess.lang

        text = (text or "").strip()[:800]
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
        engine_sess.turn += 1
        turn_id = engine_sess.turn
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
                await self.avatar.set_state("thinking")
            try:
                context, interests = views.judge_context(engine_sess)
                secondary = views.judge_secondary(engine_sess)
                judgement = await judge_turn(context, text, lang, interests, secondary)
            except Exception:
                judgement = None
            bus.publish({"type": "judge.completed", "turn_id": turn_id,
                         "semantic": judgement is not None})

        # 3. Движок считает ход. ЕДИНСТВЕННОЕ место, где меняется состояние игры.
        result = engine.apply_move(engine_sess, analysis, text, judge=judgement)

        timeout = False
        if engine_sess.state.status == "active" and engine_sess.turn >= engine_sess.max_turns:
            engine_sess.state.status = "breakdown"
            result.closed = True
            timeout = True

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
        if judgement:
            bus.publish({
                "type": "turn.coach",
                "turn_id": turn_id,
                "text": judgement.get("note") or "",
                "techniques": list(judgement.get("techniques") or []),
                # Низкий семантический балл при сработавших ключевых словах —
                # это попугайство, а не приём. Отсюда зачёркнутая плашка в UI.
                "reject": int(judgement.get("arg_score", 100)) < 35,
            })

        # 5. Лицо оппонента. Эмоцию знает движок — модель об этом не спрашивают.
        if self.avatar:
            await self.avatar.set_state(state_for_reaction(result.reaction),
                                        reaction=result.reaction)

        # 6. Реплика. Шаблон движка — не запасной план на случай беды, а базовая
        #    линия: без сети игра целиком идёт на нём.
        templated = (views.timeout_line(lang) if timeout
                     else engine.render_line(engine_sess, result.reaction, result.closed))

        if timeout or not orchat.available():
            await self._deliver_plain(templated, turn_id)
        else:
            facts = views.build_facts(engine_sess, result)
            facts["fallback"] = templated
            if sess.observations:
                # Зрение попадает в контекст оппонента, но НИКОГДА в счёт.
                facts["observations"] = sess.observations[-3:]
            self._generation_task = asyncio.create_task(
                self._stream_opponent(facts, templated, turn_id))
            await self._generation_task

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
            async for chunk in orchat.stream(system, user, role="opponent",
                                             max_tokens=220, temperature=0.8):
                # Сырые токены — клиенту сразу, чтобы реплика печаталась.
                sess.spoken_so_far += chunk
                sess.bus.publish(output_delta("text", generation_id=generation_id,
                                              turn_id=turn_id, text=chunk))
                yield chunk

        from app.ai.sanitize import rejected, sanitize, speakable

        collected: list[str] = []
        #: Прозвучало ли хоть что-то. Нужно для случая, когда отвергнуты ВСЕ
        #: фразы: молчащий оппонент в голосовом режиме — это не «честно», это
        #: сломанный ход.
        spoken_any = False
        #: Реплика уже испорчена — дальше не озвучиваем ничего.
        tainted = False
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
                say = None if tainted else speakable(phrase)
                if self.tts and say:
                    self.tts.speak(say, generation_id=generation_id, turn_id=turn_id)
                    spoken_any = True
                if self.avatar and say:
                    await self.avatar.speak(b"", generation_id=generation_id)
        except asyncio.CancelledError:
            # Перебили. `interrupt()` уже дописал услышанное в историю и погасил
            # поколение на шине — здесь просто выходим.
            raise
        except Exception:
            collected = []

        # Авторитетный итог. Дельты были сырыми; санитайзер судит реплику
        # целиком и может её отвергнуть — тогда остаётся шаблон движка.
        final = sanitize(" ".join(collected)) or templated
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
            await self.avatar.interrupt()

        if cancelled:
            sess.bus.publish({"type": "generation.cancelled",
                              "generation_id": cancelled, "reason": reason})

    # ----------------------------------------------------------------- разбор

    async def _send_debrief(self) -> None:
        """Финальный разбор. Считает движок; ИИ только пишет сопроводительное слово."""
        sess = self.session
        deb = views.debrief_view(sess.engine_session).model_dump()
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
