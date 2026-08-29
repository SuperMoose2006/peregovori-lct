"""test_voice_path.py — механика голосового хода на обоих конвейерах.

ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. `test_voice.py` проверяет СИНТЕЗ (обрезка тишины, порядок
фраз, отмена), `test_realtime_voice_join.py` — склейку кусков расшифровки. Ни
один не трогал то, что решает, СОСТОЯЛСЯ ЛИ ХОД: окно тишины, гонку с
окончательной расшифровкой, потолок накопления и честность неподнявшегося слоя.
Ровно там и нашлись дефекты, каждый из которых виден только в живой партии:

  * одна фраза уходила в движок ДВУМЯ ходами, если окончательная расшифровка
    опаздывала за окно тишины (замер: окно 900 мс, расшифровка 810–930 мс —
    гонка на сотню миллисекунд, и она проигрывалась);
  * потолок хода считал ОТКРЫТЫЙ МИКРОФОН, а не речь, и раз в две минуты
    молча стирал накопленное — вместе с ходом, если попадал на реплику;
  * отвергнутый ключ убивал задачу необработанным исключением, а интерфейс
    продолжал показывать работающий микрофон.

Всё офлайн (`conftest.py` держит `NEGO_AI=off`): события OpenAI подделаны,
провайдеры подделаны, сеть не нужна.
"""

from __future__ import annotations

import asyncio

import numpy as np
import pytest

from app.perception import realtime_voice as rv
from app.perception.realtime_voice import RealtimeVoicePipeline
from app.perception.turn_detect import TurnDecision
from app.perception.vad import SAMPLE_RATE, SpeechDetector, VADConfig
from app.perception.voice_pipeline import VoicePipeline


# ---------------------------------------------------------------------------
# Стенд: конвейер realtime без сети
# ---------------------------------------------------------------------------

class _Rig:
    """Конвейер с подделанной сессией OpenAI: события подаём руками."""

    def __init__(self, lang: str = "ru") -> None:
        self.turns: list[str] = []
        self.events: list[dict] = []
        self.interrupts = 0
        self.pipe = RealtimeVoicePipeline(
            lang=lang,
            on_turn=self._on_turn,
            on_interrupt=self._on_interrupt,
            publish=self.events.append,
        )
        self.pipe._loop = asyncio.get_event_loop()

    async def _on_turn(self, text: str) -> None:
        self.turns.append(text)

    async def _on_interrupt(self) -> None:
        self.interrupts += 1

    # -- события «как у OpenAI» ---------------------------------------------

    async def started(self) -> None:
        await self.pipe._on_event({"type": "input_audio_buffer.speech_started"})

    async def stopped(self) -> None:
        await self.pipe._on_event({"type": "input_audio_buffer.speech_stopped"})

    async def delta(self, text: str) -> None:
        await self.pipe._on_event({
            "type": "conversation.item.input_audio_transcription.delta",
            "delta": text})

    async def completed(self, text: str) -> None:
        await self.pipe._on_event({
            "type": "conversation.item.input_audio_transcription.completed",
            "transcript": text})

    @property
    def finals(self) -> list[str]:
        return [e["text"] for e in self.events
                if e.get("type") == "user.transcript" and e.get("final")]


@pytest.fixture(autouse=True)
def _fast_windows(monkeypatch):
    """Те же правила, но в масштабе теста: окно тишины 100 мс, запас 250 мс.

    Пропорция сохранена (запас больше окна, как 1500 против 900), а ждать
    реального окна в наборе тестов незачем.
    """
    monkeypatch.setattr(rv, "_QUIET_MS", 100)
    monkeypatch.setattr(rv, "_ASR_GRACE_MS", 250)


# ---------------------------------------------------------------------------
# Гонка окна тишины с окончательной расшифровкой
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_late_transcript_does_not_play_the_same_line_twice():
    """Расшифровка опоздала за окно тишины — ход всё равно ОДИН.

    Живой лог до починки (порт 8013, 29 августа):

        108421 _commit 'Но при одном условии — договор на год.'   ← гипотеза
        108453 transcription.completed (та же фраза)
        109353 _commit 'Но при одном условии — договор на год.'   ← ещё раз

    Одна фраза человека тратила два хода партии: движок дважды двигал цену и
    дважды жёг `max_turns`, а оппонент отвечал сам себе.
    """
    rig = _Rig()
    await rig.started()
    await rig.delta("Но при одном условии договор на год")
    await rig.stopped()
    # Окно тишины (100 мс) истекает раньше, чем приходит расшифровка (180 мс).
    await asyncio.sleep(0.18)
    await rig.completed("Но при одном условии — договор на год.")
    await asyncio.sleep(0.4)

    assert len(rig.turns) == 1, f"один ход человека уехал {len(rig.turns)} раза: {rig.turns}"
    assert rig.finals == rig.turns, "экран и движок увидели разное"


@pytest.mark.asyncio
async def test_engine_gets_the_authoritative_transcript_not_the_draft():
    """Дождавшись расшифровки, в движок отдаём ЕЁ, а не живую гипотезу.

    Гипотеза — черновик: она обрывается на полуслове и не несёт пунктуации.
    Разбор хода читает именно текст, поэтому черновик стоил бы игроку тега
    приёма.
    """
    rig = _Rig()
    await rig.started()
    await rig.delta("по рынку такие квар")
    await rig.stopped()
    await asyncio.sleep(0.05)
    await rig.completed("По рынку такие квартиры идут дешевле.")
    await asyncio.sleep(0.3)

    assert rig.turns == ["По рынку такие квартиры идут дешевле."]


@pytest.mark.asyncio
async def test_missing_transcript_still_lets_the_player_move():
    """Расшифровка не пришла вовсе — ход всё равно уходит, по гипотезе.

    Ожидание обязано быть ограниченным: игрок, который не может сходить, —
    это сломанная игра, а не медленная. Отсюда потолок `_ASR_GRACE_MS`.
    """
    rig = _Rig()
    await rig.started()
    await rig.delta("Давайте опираться на объективные данные")
    await rig.stopped()
    await asyncio.sleep(0.6)          # окно 100 мс + запас 250 мс + фора

    assert rig.turns == ["Давайте опираться на объективные данные"]


@pytest.mark.asyncio
async def test_short_pause_inside_a_thought_keeps_one_move():
    """«Я готов… (короткая пауза) …но при одном условии» — это ОДИН ход.

    Пауза короче окна тишины не закрывает ход: реплика переговорщика почти
    всегда содержит такую заминку, и рвать её надвое значит дать оппоненту
    ответить на половину аргумента.
    """
    rig = _Rig()
    await rig.started()
    await rig.delta("Я готов согласиться")
    await rig.stopped()
    await asyncio.sleep(0.05)                       # пауза короче окна (100 мс)
    await rig.started()                             # человек продолжил
    await rig.delta(" но при одном условии")
    await rig.stopped()
    await asyncio.sleep(0.05)
    await rig.completed("Я готов согласиться, но при одном условии.")
    await asyncio.sleep(0.4)

    assert rig.turns == ["Я готов согласиться, но при одном условии."]


@pytest.mark.asyncio
async def test_long_pause_does_split_the_move_and_that_is_documented():
    """Пауза ДЛИННЕЕ окна и запаса ход рвёт — и это надо знать.

    На быстром пути детектора конца реплики (`turn_detect.py`) нет: его зовёт
    только классический конвейер. Здесь решает таймер, поэтому «я подумаю…
    (три секунды) …хорошо, согласен» уходит в движок ДВУМЯ ходами. Тест
    закрепляет факт, а не одобряет его: если появится детектор, он упадёт и
    потребует переписать ожидание.
    """
    rig = _Rig()
    await rig.started()
    await rig.delta("Я готов согласиться")
    await rig.stopped()
    await rig.completed("Я готов согласиться.")
    await asyncio.sleep(0.4)                        # пауза длиннее окна + запаса
    await rig.started()
    await rig.delta("но при одном условии")
    await rig.stopped()
    await rig.completed("Но при одном условии.")
    await asyncio.sleep(0.4)

    assert rig.turns == ["Я готов согласиться.", "Но при одном условии."]


@pytest.mark.asyncio
async def test_silence_alone_never_becomes_a_move():
    """Человек нажал «готово», не сказав ни слова — хода нет.

    Пустой ход дошёл бы до движка как реплика нулевой длины и сжёг бы номер
    хода ни за что.
    """
    rig = _Rig()
    await rig.pipe.force_commit()
    assert rig.turns == []
    assert rig.finals == []


# ---------------------------------------------------------------------------
# Потолок накопления
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_open_microphone_does_not_eat_the_players_move():
    """Потолок хода считает РЕЧЬ, а не время с открытым микрофоном.

    Браузер шлёт кадры непрерывно, тишину в том числе (`media-provider.ts` не
    гасит поток по локальному VAD — иначе нечем было бы перебивать). Счётчик
    рос от одного факта «микрофон включён», и каждые две минуты партии
    срабатывал `reset()`: если он приходился на говорящего человека, ход
    исчезал молча — ни расшифровки, ни ошибки, ни ответа оппонента.
    """
    rig = _Rig()
    quiet = np.zeros(SAMPLE_RATE, dtype=np.int16)   # секунда тишины
    for _ in range(rv._MAX_TURN_SECONDS + 10):      # две с лишним минуты «в эфире»
        rig.pipe.feed(quiet)
    assert rig.pipe._fed_samples == 0, "тишина копится как реплика"

    await rig.started()
    await rig.delta("Мы готовы обсудить срок")
    rig.pipe.feed(quiet)
    await rig.stopped()
    await rig.completed("Мы готовы обсудить срок.")
    await asyncio.sleep(0.3)

    assert rig.turns == ["Мы готовы обсудить срок."]


@pytest.mark.asyncio
async def test_forgotten_microphone_in_a_noisy_room_still_has_a_ceiling():
    """Настоящий забытый микрофон — тот, в который льётся звук, — потолок имеет."""
    rig = _Rig()
    await rig.started()
    await rig.delta("бесконечная реплика")
    loud = np.full(SAMPLE_RATE, 500, dtype=np.int16)
    for _ in range(rv._MAX_TURN_SECONDS + 2):
        rig.pipe.feed(loud)
    assert rig.pipe._parts == [] and rig.pipe._live == "", "накопленное не сброшено"


# ---------------------------------------------------------------------------
# Слой, который не поднялся, говорит об этом
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rejected_key_is_said_out_loud_not_swallowed(monkeypatch):
    """Ключ отвергнут — интерфейс обязан узнать, а задача не должна падать молча.

    До починки `session.update` летел в уже закрытый сокет вне try/except:
    задача умирала с «exception was never retrieved», `capabilities.microphone`
    оставался `true`, и человек говорил в пустоту. Это то самое четвёртое
    состояние — «выглядит настоящим, а внутри пусто», — которого не бывает.
    """
    rig = _Rig()
    rig.pipe._key = "sk-not-a-real-key"

    class _DeadSocket:
        async def send(self, _payload):
            raise ConnectionError("invalid_api_key")

        async def close(self):
            pass

    async def _connect(*_a, **_kw):
        return _DeadSocket()

    import types
    fake = types.SimpleNamespace(connect=_connect)
    monkeypatch.setitem(__import__("sys").modules, "websockets", fake)

    await rig.pipe._ensure_session()               # не должно бросить

    errors = [e for e in rig.events if e.get("type") == "error"]
    assert errors, "слой умер молча"
    assert errors[0]["error"]["code"] == "asr_unavailable"
    assert rig.pipe._ws is None

    # Второй раз про то же самое не кричим: кадры идут потоком.
    rig.pipe._tell_dead()
    assert len([e for e in rig.events if e.get("type") == "error"]) == 1


@pytest.mark.asyncio
async def test_english_session_is_told_in_english():
    """Билингвальность (инвариант 4) — в том числе у отказов."""
    rig = _Rig(lang="en")
    rig.pipe._tell_dead()
    message = rig.events[0]["error"]["message"]
    assert "unavailable" in message and "type your move" in message


# ---------------------------------------------------------------------------
# Перебивание: два рубежа
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_barge_in_needs_speech_to_survive_the_window():
    """Щелчок не перебивает, речь перебивает.

    Быстрый рубеж существует потому, что медленный (ждать РАСПОЗНАННЫХ слов)
    давал отмену через 2.34 с — две секунды оппонент говорит поверх человека,
    то есть перебивания фактически нет.
    """
    rig = _Rig()
    rig.pipe.set_opponent_speaking(True)
    await rig.started()
    rig.pipe._speaking = False                     # мигнуло и пропало
    await asyncio.sleep((rv._BARGE_CONFIRM_MS + 60) / 1000)
    assert rig.interrupts == 0, "щелчок погасил оппонента"

    rig2 = _Rig()
    rig2.pipe.set_opponent_speaking(True)
    await rig2.started()                           # и человек продолжает говорить
    await asyncio.sleep((rv._BARGE_CONFIRM_MS + 60) / 1000)
    assert rig2.interrupts == 1, "настоящая речь не перебила"


@pytest.mark.asyncio
async def test_recognised_words_barge_in_even_if_the_fast_gate_missed():
    """Второй рубеж: речь мигнула, но слова распознались — это перебивание."""
    rig = _Rig()
    rig.pipe.set_opponent_speaking(True)
    await rig.delta("секунду")
    assert rig.interrupts == 1


@pytest.mark.asyncio
async def test_a_grunt_does_not_barge_in():
    """«а», «м» и щелчки эха сквозь AEC порог в три символа не проходят."""
    rig = _Rig()
    rig.pipe.set_opponent_speaking(True)
    await rig.delta("а")
    assert rig.interrupts == 0


# ---------------------------------------------------------------------------
# Своё VAD: холодное окно — не выдумка, а свойство машины состояний
# ---------------------------------------------------------------------------

def test_own_vad_needs_a_full_window_before_it_decides():
    """`max(silence_window, prefix_window)` звука — прежде чем VAD скажет хоть что-то.

    Число из docs/latency.md («холодное окно ~976 мс») — не наблюдение над
    сетью, а прямое следствие переноса машины состояний из TEN: пока окно проб
    не заполнено, решение не принимается вовсе. Проверяется без модели, на
    самих переходах.
    """
    detector = SpeechDetector(config=VADConfig())
    assert detector.window_size == 1000 // 16          # силовое окно, 62 хопа
    cold_ms = detector.window_size * detector.config.hop_size_ms
    assert 950 <= cold_ms <= 1000

    fired: list[str] = []
    detector.on_speech_start = lambda: fired.append("start")
    # Заполняем окно «речью» напрямую: модель здесь ни при чём, проверяются
    # переходы. Пока проб меньше окна, стартовать нельзя.
    for _ in range(detector.window_size - 1):
        detector._push_probe(1.0)
    assert fired == [], "решение принято на неполном окне"
    detector._push_probe(1.0)
    assert fired == ["start"]


# ---------------------------------------------------------------------------
# Классический конвейер — аварийный выход
# ---------------------------------------------------------------------------

class _FakeASR:
    def __init__(self, text: str) -> None:
        self.text = text
        self.calls = 0

    async def transcribe(self, _pcm, _rate, _lang):
        self.calls += 1
        return type("R", (), {"text": self.text})()


def _classic(asr, decision: TurnDecision):
    turns: list[str] = []
    events: list[dict] = []

    async def on_turn(text: str) -> None:
        turns.append(text)

    async def on_interrupt() -> None:
        pass

    pipe = VoicePipeline(asr=asr, lang="ru", on_turn=on_turn,
                         on_interrupt=on_interrupt, publish=events.append)

    async def _eval(_text, _lang="ru"):
        return decision

    pipe._turn_detector.eval = _eval
    pipe._loop = asyncio.get_event_loop()
    return pipe, turns, events


@pytest.mark.asyncio
async def test_classic_pipeline_delivers_a_finished_thought():
    """Аварийный выход обязан работать: детектор сказал «закончено» — ход ушёл."""
    asr = _FakeASR("По рынку такие квартиры идут дешевле.")
    pipe, turns, events = _classic(asr, TurnDecision.FINISHED)
    pipe._audio.append(np.full(SAMPLE_RATE, 300, dtype=np.int16))
    await pipe._settle_turn()

    assert turns == ["По рынку такие квартиры идут дешевле."]
    assert [e["text"] for e in events if e.get("final")] == turns


@pytest.mark.asyncio
async def test_classic_pipeline_waits_for_an_unfinished_thought():
    """«Фраза оборвана» — ход НЕ уходит, звук копится дальше.

    Асимметрия осознанная: ошибиться в сторону «подождать» дешевле, чем
    перебить человека на середине мысли.
    """
    asr = _FakeASR("Я готов согласиться")
    pipe, turns, _ = _classic(asr, TurnDecision.UNFINISHED)
    pipe._audio.append(np.full(SAMPLE_RATE, 300, dtype=np.int16))
    await pipe._settle_turn()

    assert turns == []
    assert pipe._audio, "накопленное стёрли — вторая половина мысли потеряна"


@pytest.mark.asyncio
async def test_stubborn_unfinished_eventually_commits_by_itself():
    """Потолок ожидания, обещанный `force_threshold_ms`, теперь настоящий.

    Раньше здесь стоял тест-закрепитель: «потолка нет, единственный выход —
    кнопка». Он был прав и держал расхождение громким, пока его не закрыли.

    Почему потолок обязателен. `eval` возвращает UNFINISHED не только когда
    человек правда не договорил: это ЖЕ значение — ответ на любую беду самого
    детектора, включая таймаут и отсутствие ключа. Без потолка сетевая заминка
    даёт микрофон, который работает, расшифровку, которая видна, и ход, который
    не уезжает никогда. Снаружи это неотличимо от «нас внимательно слушают» —
    четвёртое состояние, которого по принципу 2 не бывает.
    """
    asr = _FakeASR("Я готов согласиться")
    pipe, turns, _ = _classic(asr, TurnDecision.UNFINISHED)
    pipe._turn_detector.config.force_threshold_ms = 60  # в тесте не ждём пять секунд

    pipe._audio.append(np.full(SAMPLE_RATE, 300, dtype=np.int16))
    await pipe._settle_turn()
    assert turns == [], "ход уехал сразу — потолок подменил собой детектор"

    await asyncio.sleep(0.2)
    assert turns == ["Я готов согласиться"], "потолок не сработал: ход не уедет никогда"
    assert pipe.stats.forced == 1


@pytest.mark.asyncio
async def test_the_ceiling_counts_silence_and_not_the_length_of_the_thought():
    """Заговорил снова — отсчёт снимается. Иначе потолок режет длинную мысль.

    Пять секунд ТИШИНЫ после того, как человек замолчал, однозначны. Пять
    секунд ОТ НАЧАЛА фразы — нет: ровно столько длится обычная реплика в
    переговорах (docs/latency.md: 5.5 с), и такой потолок обрывал бы каждую
    вторую на середине.
    """
    asr = _FakeASR("Я готов")
    pipe, turns, _ = _classic(asr, TurnDecision.UNFINISHED)
    pipe._turn_detector.config.force_threshold_ms = 60

    pipe._audio.append(np.full(SAMPLE_RATE, 300, dtype=np.int16))
    await pipe._settle_turn()          # детектор: «не договорил», потолок взведён
    pipe._speech_started()             # человек продолжил мысль
    await asyncio.sleep(0.2)
    assert turns == [], "потолок дотикал, пока человек говорил — мысль обрезана"

    # А когда он снова замолчал — потолок опять при деле.
    await pipe._settle_turn()
    await asyncio.sleep(0.2)
    assert turns == ["Я готов"]


@pytest.mark.asyncio
async def test_the_button_still_works_and_does_not_send_the_turn_twice():
    """Кнопка «готово» была единственным выходом и осталась выходом.

    Гонка здесь настоящая: человек жмёт кнопку в ту же секунду, когда дотикал
    потолок. Оба пути ведут в `force_commit`, и если бы он не чистил за собой,
    один ход ушёл бы в движок дважды.
    """
    asr = _FakeASR("Я готов согласиться")
    pipe, turns, _ = _classic(asr, TurnDecision.UNFINISHED)
    pipe._turn_detector.config.force_threshold_ms = 60

    pipe._audio.append(np.full(SAMPLE_RATE, 300, dtype=np.int16))
    await pipe._settle_turn()
    await pipe.force_commit()          # кнопка успела первой
    await asyncio.sleep(0.2)           # потолок дотикивает в пустоту
    assert turns == ["Я готов согласиться"], f"ход ушёл {len(turns)} раз(а)"


@pytest.mark.asyncio
async def test_closing_the_game_takes_the_ceiling_with_it():
    """Партия кончилась — потолок не имеет права досчитать и сходить за неё."""
    asr = _FakeASR("Я готов согласиться")
    pipe, turns, _ = _classic(asr, TurnDecision.UNFINISHED)
    pipe._turn_detector.config.force_threshold_ms = 60

    pipe._audio.append(np.full(SAMPLE_RATE, 300, dtype=np.int16))
    await pipe._settle_turn()
    await pipe.close()
    await asyncio.sleep(0.2)
    assert turns == [], "потолок сходил уже после конца партии"


# ---------------------------------------------------------------------------
# Инвариант 7 на шве: голос отдаёт ровно тот текст, что напечатала клавиатура
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_voice_hands_the_orchestrator_the_very_same_string():
    """Между расшифровкой и движком нет НИ ОДНОГО преобразования.

    Нормализацию делает `on_player_turn` — одна на оба входа. Если бы голос
    подчищал текст у себя (обрезал, менял регистр, снимал пунктуацию), та же
    реплика с микрофона и с клавиатуры дала бы разные теги приёмов и разный
    балл: инвариант 7 держится именно на этом отсутствии.
    """
    said = "  По рынку такие квартиры идут дешевле, давайте опираться на данные.  "
    rig = _Rig()
    await rig.started()
    await rig.stopped()
    await rig.completed(said)
    await asyncio.sleep(0.3)

    # `_joined()` снимает пробелы по краям кусков — и БОЛЬШЕ НИЧЕГО.
    assert rig.turns == [said.strip()]


# ---------------------------------------------------------------------------
# Сокет ушёл — распознавание уходит с ним
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_socket_end_closes_the_recognition_session():
    """Партия кончилась — сессия распознавания закрыта, задачи сняты.

    Замер до починки: две сыгранные и ЗАКРЫТЫЕ голосовые партии оставляли ровно
    два лишних соединения к провайдеру, живущих до конца процесса. Снаружи
    ничего не ломалось — публикация в закрытую шину безвредна, — пока провайдер
    не начинал считать ОДНОВРЕМЕННЫЕ сессии. На показе, где партии идут
    комнатой, упираются в это первым.
    """
    rig = _Rig()
    closed: list[bool] = []

    class _Socket:
        async def close(self):
            closed.append(True)

    rig.pipe._ws = _Socket()
    rig.pipe._reader = asyncio.create_task(asyncio.sleep(60))
    rig.pipe._sender = asyncio.create_task(asyncio.sleep(60))
    rig.pipe._arm_quiet()

    await rig.pipe.close()
    await asyncio.sleep(0)

    assert closed == [True], "соединение к провайдеру осталось открытым"
    assert rig.pipe._reader.cancelled() or rig.pipe._reader.done()
    assert rig.pipe._sender.cancelled() or rig.pipe._sender.done()
    assert rig.pipe._quiet is None
    # Закрылись мы сами — про обрыв никому не рассказываем.
    assert not [e for e in rig.events if e.get("type") == "error"]


@pytest.mark.asyncio
async def test_the_endpoint_actually_closes_the_pipeline():
    """Обе реализации несут `close()`, и сокет его зовёт.

    Разбором исходника, а не мокой: утечка была именно в том, что вызова НЕ
    БЫЛО, — а такое доказывается только тем, что вызов есть.
    """
    import inspect

    from app.realtime import endpoint
    from app.perception.voice_pipeline import VoicePipeline as _Classic

    assert inspect.iscoroutinefunction(_Classic.close)
    assert inspect.iscoroutinefunction(RealtimeVoicePipeline.close)
    assert "await voice.close()" in inspect.getsource(endpoint.realtime_ws)
