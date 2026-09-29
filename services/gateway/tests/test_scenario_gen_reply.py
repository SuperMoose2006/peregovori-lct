"""Ответ модели в «своей сделке» — чужие данные, и доехать до стола они могут
только через нормализацию.

ЗАЧЕМ. Промпт просит у модели имя значка из набора и строгий JSON, но просьба —
не гарантия: дешёвые модели отвечают эмодзи, придумывают слово, оборачивают
JSON в болтовню и ставят сложность 42. Значок рисует браузер своим SVG по
имени (`app/icons.py`), и имя вне набора нарисовать нечем — на экране пустое
место. Остальные поля идут прямо в движок, и там промах стоит дороже: сценарий
без трёх интересов или с однобоким языком ломает разбор и вторую локаль.

`test_icon_names.py` проверяет только, что промпт запрещает эмодзи. Здесь —
что запрет держится, когда модель его нарушила. Модель подменена: сеть в
тестах не нужна и не допускается (conftest ставит NEGO_AI=off).
"""

from __future__ import annotations

import asyncio
import json

import pytest

from app import engine, views
from app.ai import scenario_gen
from app.engine import scenarios as registry
from app.icons import ICON_NAMES

BASE = {
    "title": "Аренда склада", "icon": "box", "difficulty": 3,
    "role": "Вы арендатор и хотите снизить ставку.",
    "counterpart_name": "Олег", "counterpart_persona": "Собственник склада.",
    "style": "analytical", "unit": " ₽/м²", "dir": "lower_is_better",
    "opponent_open": 900, "opponent_reservation": 700, "player_target": 720,
    "player_reservation": 820, "batna_strength": 55, "batna_note": "Склад через дорогу.",
    "hidden_interests": ["Простой половины площадей", "Кредит под залог здания", "Смена управляющего"],
    "tradeoffs": ["Договор на три года", "Предоплата за квартал"],
    "briefing": "Цель 720, красная линия 820.",
}

#: Ходы из эталонных партий: критерий, условный размен, обязательство. Ими же
#: играет `test_admin_context.py` — они заведомо двигают цену в движке.
MOVES = {
    "ru": ["По рыночным данным медиана независимых прайсов 87, потому что это отраслевой стандарт.",
           "Если мы дадим подтвержденный график, сможете подвинуться?",
           "Я предлагаю долгосрочный контракт в обмен на снижение цены."],
    "en": ["Market data shows a median price of 87, because this is the industry standard.",
           "I offer a confirmed schedule in exchange for a better price.",
           "I offer a long-term commitment in exchange for a lower price."],
}


@pytest.fixture(autouse=True)
def isolated_registry(monkeypatch):
    monkeypatch.setattr(registry, "_RUNTIME", {})
    monkeypatch.setattr(registry, "_RUNTIME_USED", {})


def _generate(monkeypatch, reply, lang: str = "ru"):
    from app.providers.openrouter import chat

    async def complete(*_args, **_kwargs):
        return reply if isinstance(reply, str) else json.dumps(reply, ensure_ascii=False)

    monkeypatch.setattr(chat, "complete", complete)
    return asyncio.run(scenario_gen.generate_scenario("Хочу снизить ставку аренды склада.", lang))


# ------------------------------------------------------------------- значок

_MISSING = object()


@pytest.mark.parametrize(("icon", "expected"), [
    ("handshake", "handshake"),
    # Регистр и пробелы — не промах, а небрежность: имя узнаётся.
    ("  Handshake\n", "handshake"),
    ("🤝", "target"),
    ("handshake 🤝", "target"),
    ("unicorn", "target"),
    ("", "target"),
    (None, "target"),
    (_MISSING, "target"),
    (42, "target"),
    (["handshake"], "target"),
], ids=["known", "case-space", "emoji", "name+emoji", "unknown", "empty", "null",
        "missing", "number", "list"])
def test_the_icon_is_always_a_drawable_name(monkeypatch, icon, expected):
    reply = {k: v for k, v in BASE.items() if k != "icon"}
    if icon is not _MISSING:
        reply["icon"] = icon
    scenario = _generate(monkeypatch, reply)

    assert scenario is not None
    assert scenario.icon == expected
    # На провод значок уходит через `views` — проверяем то, что увидит браузер.
    assert views.scenario_view(scenario, "ru").icon in ICON_NAMES


def test_a_chatty_fenced_reply_still_yields_the_table(monkeypatch):
    """Дешёвые модели предваряют JSON болтовнёй — ради этого ретрай и
    вырезание блока, а не отказ с первой попытки."""
    reply = ("Конечно! Вот сценарий:\n```json\n"
             + json.dumps({**BASE, "icon": "💼"}, ensure_ascii=False)
             + "\n```\nУдачи на переговорах!")
    scenario = _generate(monkeypatch, reply)
    assert scenario is not None and scenario.title["ru"] == "Аренда склада"
    assert scenario.icon == "target"


# ------------------------------------------------------- остальные поля

@pytest.mark.parametrize(("raw", "expected"), [
    (42, 5), (-3, 1), ("4", 3), ("hard", 3), (None, 3), (2.9, 3),
])
def test_difficulty_is_clamped_to_the_scale_the_engine_knows(monkeypatch, raw, expected):
    assert _generate(monkeypatch, {**BASE, "difficulty": raw}).difficulty == expected


@pytest.mark.parametrize("lang", ["ru", "en"])
def test_a_sloppy_reply_becomes_a_complete_bilingual_playable_table(monkeypatch, lang):
    """Недостающее достраивается, лишнее срезается, чужие литеры заменяются —
    и получившийся стол играется тем же движком без нарушения инвариантов."""
    sloppy = {**BASE, "style": "aggressive", "dir": "cheaper please",
              "hidden_interests": ["Один-единственный интерес"],
              "tradeoffs": [], "batna_strength": 250,
              # Числа вразнобой: упорядочить их — забота генератора, не модели.
              "opponent_open": 700, "opponent_reservation": 900,
              "player_target": 820, "player_reservation": 720}
    scenario = _generate(monkeypatch, sloppy, lang)

    assert scenario is not None
    assert scenario.counterpart.style == "analytical"
    assert scenario.headline.dir == "lower_is_better"
    assert scenario.player_batna.strength == 100
    for field in (scenario.title, scenario.role, scenario.briefing, scenario.counterpart.name):
        assert set(field) == {"ru", "en"}, "вторая локаль пуста — движок упадёт на KeyError"
    for loc in ("ru", "en"):
        assert len(scenario.hidden_interests[loc]) == 3, "у сценария обязано быть три интереса"
        assert len(scenario.tradeoffs[loc]) >= 2
    assert (scenario.opponent_reservation < scenario.player_target
            < scenario.player_reservation < scenario.opponent_open)
    assert engine.by_id(scenario.id) is scenario, "стол не зарегистрирован — партия не найдёт его"

    # Партия доигрывается движком целиком: ни один ход не роняет `apply_move`,
    # цена сдвигается со стартовой, счёт считается. Floor по дороге проверяется
    # попутно (инвариант 1) — до него эталонные ходы не доводят, это страховка.
    session = engine.create_session(scenario.id, lang)
    opening = session.state.offer_opp
    for n in range(12):
        if session.state.status != "active":
            break
        text = MOVES[lang][n % 3]
        session.turn += 1
        engine.apply_move(session, engine.analyze(text), text)
        assert session.state.offer_opp >= scenario.opponent_reservation
    assert session.state.offer_opp < opening, "стол не торгуется — зона собрана вхолостую"
    assert 0 <= engine.score_session(session)["overall"] <= 100
