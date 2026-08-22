"""simulate.py — прогон одной реплики через НАСТОЯЩИЙ движок.

Зачем отдельный модуль: типы упражнений `reaction` и `meters` не хранят ответ
как мнение автора — ответ ВЫЧИСЛЯЕТСЯ движком. Тест банка сверяет записанный
ответ с вычисленным, поэтому упражнение не может разойтись с игрой после
правки баланса. Здесь же лежит тонкая обёртка, чтобы эта логика не дублировалась
в тестах, в генераторе фронтенд-зеркала и в экзамене.
"""

from __future__ import annotations

from app.engine.engine import Session, apply_move, create_session
from app.engine.techniques import analyze

METERS = ("trust", "tension", "info", "leverage")


def seeded(scenario_id: str, lang: str = "ru", state: dict | None = None,
           turn: int = 0) -> Session:
    """Сессия в заданной точке партии. `state` — значения шкал, как в упражнении."""
    sess = create_session(scenario_id, lang)
    sess.turn = turn
    if state:
        for key in METERS:
            if key in state:
                setattr(sess.state, key, float(state[key]))
        if "turn" in state:
            sess.turn = int(state["turn"])
    return sess


def run(scenario_id: str, lang: str, line: str, state: dict | None = None,
        turn: int = 0) -> dict:
    """Реакция и дельты шкал на одну реплику. Единственный источник — движок."""
    sess = seeded(scenario_id, lang, state, turn)
    result = apply_move(sess, analyze(line), line)
    deltas = {k: float(result.deltas.get(k, 0)) for k in METERS}
    largest = max(METERS, key=lambda k: (abs(deltas[k]), METERS.index(k) * -1))
    return {
        "reaction": result.reaction,
        "deltas": deltas,
        "largest_delta": largest,
        "closed": result.closed,
    }


def answer_for(item: dict, lang: str = "ru") -> str:
    """Вычислить ответ для генерируемых типов (`reaction`, `meters`)."""
    line = item["player_line"][lang]
    out = run(item["scenario_id"], lang, line,
              state=item.get("state"), turn=item.get("seed_turn", 0))
    if item["type"] == "reaction":
        return out["reaction"]
    ask = item.get("ask", "largest_delta")
    if ask == "largest_delta":
        return out["largest_delta"]
    if ask.startswith("sign_of:"):
        meter = ask.split(":", 1)[1]
        value = out["deltas"][meter]
        return "up" if value > 0 else "down" if value < 0 else "flat"
    if ask == "reaction":
        return out["reaction"]
    raise ValueError(f"unknown ask: {ask}")
