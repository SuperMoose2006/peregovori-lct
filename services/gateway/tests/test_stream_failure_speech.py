"""Сорвался поток модели — придержанное не звучит.

Найдено после аудита 17.10. Сомнительная фраза («Договорились,») до
конца реплики придерживается (`reply_verdict` → hold). Если поток после неё
падал (сбой провайдера, бюджет 15 с), обработчик сбрасывал `collected`, но не
`held`: в пузыре и журнале — шаблон движка, а в звуке — «договорились»,
которого движок не давал. Ровно то, от чего защищает F05, и звук расходится
с текстом.
"""
import pytest

from app import engine
from app.orchestrator import negotiation
from app.providers.openrouter import chat
from app.realtime.session import RealtimeSession

OPENING = "Здравствуйте. Что для вас важнее всего в этом контракте?"


class Recorder:
    def __init__(self) -> None:
        self.said: list[str] = []

    def speak(self, text: str, *, generation_id: str, turn_id: int) -> None:
        self.said.append(text)

    def finish(self, generation_id: str) -> None:
        pass

    def clear(self) -> None:
        pass


@pytest.mark.asyncio
async def test_a_held_phrase_is_not_spoken_when_the_stream_fails(monkeypatch):
    monkeypatch.setattr(negotiation, "judge_enabled_for", lambda mode: False)

    async def stream(*args, **kwargs):
        # Делитель отдаёт «Договорились,» первым куском (запятая), и
        # reply_verdict его придерживает: реплика ещё может стать «…, если
        # цена подойдёт». Дальше поток рвётся.
        yield "Договорились, "
        yield "значит "
        yield "по "
        raise RuntimeError("provider dropped the stream")

    monkeypatch.setattr(chat, "available", lambda: True)
    monkeypatch.setattr(chat, "stream", stream)
    session = RealtimeSession(session_id="stream_fail", lang="ru",
                              engine_session=engine.create_session("supplier", "ru"))
    events: list[dict] = []
    monkeypatch.setattr(session.bus, "publish", events.append)
    tts = Recorder()
    await negotiation.NegotiationOrchestrator(session, tts=tts).on_player_turn(OPENING)

    done = [e for e in events if e.get("type") == "response.done"]
    assert len(done) == 1
    final = done[0]["text"]
    assert "договорились" not in final.lower()
    spoken = " ".join(tts.said).lower()
    assert "договорились" not in spoken, tts.said
    # Итог, который видит человек, он же и слышит.
    assert final in tts.said, (final, tts.said)
