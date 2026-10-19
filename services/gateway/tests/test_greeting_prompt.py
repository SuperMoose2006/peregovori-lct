"""«Добрый день» — приветствие, а не ход по делу (владелец 19.10: собеседник
«сразу свой поинт говорит без никакого введения»)."""

from app.ai.prompts import build_user
from app.engine import techniques


def _is_greeting(text: str) -> bool:
    a = techniques.analyze(text)
    return "rapport" in a.moves and a.number is None


def test_a_bare_greeting_asks_to_greet_back_without_a_position():
    assert _is_greeting("Добрый день!")
    assert not _is_greeting("Добрый день. Давайте 60 тысяч.")
    ru = build_user({"lang": "ru", "player_text": "Добрый день!",
                     "fallback": "Фиксирую: текущая цифра 180k ₽/мес.", "greeting": True})
    assert "поздоровайся" in ru and "НЕ называй" in ru
    en = build_user({"lang": "en", "player_text": "Good afternoon!",
                     "fallback": "Noted: 180k.", "greeting": True})
    assert "greet them back" in en
    plain = build_user({"lang": "ru", "player_text": "Давайте 60 тысяч.", "fallback": "Нет."})
    assert "поздоровайся" not in plain
