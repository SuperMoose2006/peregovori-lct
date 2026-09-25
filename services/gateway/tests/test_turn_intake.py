"""test_turn_intake.py — один вход хода и его атомарная граница.

ЧТО ЗДЕСЬ СТОРОЖИТСЯ. Три дефекта, найденные чтением кода и ни разу не
воспроизведённые живьём, — поэтому доказываются стендом, а не наблюдением:

  * голос звал оркестратор мимо замка `_Work`, и распознанная реплика, пришедшая
    во время напечатанного хода, двигала тот же счётчик внахлёст;
  * ход, дождавшийся придержки или замка уже после вытеснения сокета, всё равно
    доходил до движка — партию к тому времени вёл другой владелец;
  * судья проглатывал отмену, и ход применялся с keyword-баллом уже после того,
    как его отменили; а счётчик хода увеличивался ДО судьи и при отмене
    оставался увеличенным без применённого хода.

Всё офлайн: судья подменён управляемой корутиной, сеть не нужна.
"""

from __future__ import annotations

import asyncio
import copy

import pytest

from app.orchestrator import judge as judge_mod
from app.orchestrator import negotiation as nego
from app.orchestrator.negotiation import NegotiationOrchestrator
from app.realtime.events import SessionInit
from app.realtime import endpoint


async def _session(**kw):
    session, err = await endpoint._build_session(SessionInit(scenarioId="supplier", **kw))
    assert err is None
    return session


class _Gate:
    """Судья, который отвечает только по команде теста."""

    def __init__(self) -> None:
        self.entered = asyncio.Event()
        self.release = asyncio.Event()
        self.calls = 0

    async def __call__(self, *args, **kwargs):
        self.calls += 1
        self.entered.set()
        await self.release.wait()
        return None


@pytest.fixture()
def slow_judge(monkeypatch):
    gate = _Gate()
    monkeypatch.setattr(nego, "judge_enabled_for", lambda mode: True)
    monkeypatch.setattr(nego, "judge_turn", gate)
    # Придержка по темпу к этим тестам отношения не имеет.
    async def no_budget(session):
        return None
    monkeypatch.setattr(endpoint, "_turn_budget", no_budget)
    return gate


def _players(session) -> list[str]:
    return [e["text"] for e in session.engine_session.log if e.get("role") == "player"]


# ---------------------------------------------------------------------------
# Один вход: голос и клавиатура не двигают движок внахлёст
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_voice_turn_waits_for_the_typed_turn_instead_of_overlapping_it(slow_judge, monkeypatch):
    # Настоящая проводка голоса: ход приходит из пайплайна через `_wire`, а не
    # из теста напрямую — иначе тест проверял бы замок, но не то, что голос
    # вообще до него доходит.
    monkeypatch.setenv("NEGO_VOICE", "classic")
    monkeypatch.setenv("NEGO_ASR", "parakeet")
    monkeypatch.setattr(endpoint.OpenAISpeechTTS, "available", lambda self: False)
    monkeypatch.setattr(endpoint.EdgeTTS, "available", lambda self: False)
    session = await _session(mode="voice", layers={"voice": True})
    work = endpoint._Work()
    orch, pipeline, _ = endpoint._wire(session, work=work)
    assert pipeline is not None, "стенд не поднял голосовой пайплайн"

    assert work.start_turn(orch, session, "Что для вас важнее всего, кроме цены?")
    await asyncio.wait_for(slow_judge.entered.wait(), 2)
    voice = asyncio.create_task(pipeline._on_turn("А сроки поставки для вас важны?"))
    await asyncio.sleep(0.05)

    # Напечатанный ход висит на судье; голосовой обязан ждать замка, а не
    # войти в движок вторым: ни один ход ещё не принят.
    assert slow_judge.calls == 1
    assert session.engine_session.turn == 0

    slow_judge.release.set()
    await asyncio.wait_for(voice, 3)
    await asyncio.wait_for(asyncio.gather(*work._turns), 3)

    assert session.engine_session.turn == 2
    assert _players(session) == ["Что для вас важнее всего, кроме цены?",
                                 "А сроки поставки для вас важны?"]
    assert [e["turn"] for e in session.engine_session.log if e.get("role") == "player"] == [1, 2]
    await pipeline.close()


@pytest.mark.asyncio
async def test_late_voice_turn_of_an_evicted_socket_is_not_counted(slow_judge):
    session = await _session()
    orch = NegotiationOrchestrator(session)
    work = endpoint._Work()
    session.evicted = True

    await asyncio.wait_for(work.run_turn(orch, session, "Поздняя расшифровка"), 2)

    assert slow_judge.calls == 0
    assert session.engine_session.turn == 0
    assert _players(session) == []


@pytest.mark.asyncio
async def test_a_turn_waiting_for_the_lock_is_dropped_if_the_socket_is_evicted_meanwhile(slow_judge):
    session = await _session()
    orch = NegotiationOrchestrator(session)
    work = endpoint._Work()

    assert work.start_turn(orch, session, "Первый ход")
    await asyncio.wait_for(slow_judge.entered.wait(), 2)
    queued = asyncio.create_task(work.run_turn(orch, session, "Второй ход, ждёт замка"))
    await asyncio.sleep(0.05)
    session.evicted = True
    slow_judge.release.set()
    await asyncio.wait_for(queued, 3)
    await asyncio.wait_for(asyncio.gather(*work._turns), 3)

    # Первый ход был принят до вытеснения; второй дождался замка уже в чужой
    # партии и до движка не дошёл.
    assert session.engine_session.turn == 1
    assert _players(session) == ["Первый ход"]


# ---------------------------------------------------------------------------
# Отмена во время судьи: ход не принят, счётчик и журнал целы
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cancel_during_judge_leaves_turn_log_and_state_untouched(slow_judge):
    session = await _session()
    orch = NegotiationOrchestrator(session)
    work = endpoint._Work()
    before_state = copy.deepcopy(session.engine_session.state)

    assert work.start_turn(orch, session, "Давайте опираться на рыночные данные: медиана 87.")
    await asyncio.wait_for(slow_judge.entered.wait(), 2)
    await work.aclose()  # так гасит ход уход сокета и вытеснение

    es = session.engine_session
    assert es.turn == 0
    assert _players(session) == []
    assert es.state == before_state

    # Следующий ход проходит как первый — номер не «съеден» отменой.
    slow_judge.release.set()
    work2 = endpoint._Work()
    assert work2.start_turn(orch, session, "Что для вас важнее всего, кроме цены?")
    await asyncio.wait_for(asyncio.gather(*work2._turns), 3)
    assert es.turn == 1
    assert _players(session) == ["Что для вас важнее всего, кроме цены?"]


@pytest.mark.asyncio
async def test_judge_propagates_cancellation_but_turns_timeout_into_none(monkeypatch):
    monkeypatch.setattr(judge_mod, "judge_enabled", lambda: True)
    started = asyncio.Event()

    async def hang(*args, **kwargs):
        started.set()
        await asyncio.sleep(3600)

    monkeypatch.setattr(judge_mod.orchat, "complete", hang)

    task = asyncio.create_task(judge_mod.judge_turn("ctx", "реплика", "ru"))
    await asyncio.wait_for(started.wait(), 2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    # Таймаут — по-прежнему «судья не успел», а не ошибка хода.
    monkeypatch.setattr(judge_mod, "JUDGE_BUDGET_S", 0.3)
    assert await asyncio.wait_for(judge_mod.judge_turn("ctx", "реплика", "ru"), 3) is None


@pytest.mark.asyncio
async def test_stopping_the_reply_does_not_undo_an_accepted_move():
    """Перебивание — остановка звука, а не отмена хода: принятое остаётся."""
    session = await _session()
    orch = NegotiationOrchestrator(session)
    await orch.on_player_turn("Что для вас важнее всего, кроме цены?")
    turn, state = session.engine_session.turn, copy.deepcopy(session.engine_session.state)

    await orch.interrupt(reason="client_cancel")
    await orch.interrupt(reason="barge_in")

    assert session.engine_session.turn == turn == 1
    assert session.engine_session.state == state
