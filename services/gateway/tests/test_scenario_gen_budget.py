"""Генерация «своей сделки» обязана сдаваться раньше, чем клиент.

Живой замер поймал ровно этот случай: модель роли `reasoning` думала 142 секунды
и не возвращала валидный JSON, а клиент ждёт 30 и показывает «не удалось». Для
пользователя это выглядело как поломка продукта, хотя сервер добросовестно ждал.

Бюджет проверяется на подменённом провайдере: сеть в тестах не нужна и не
допускается (conftest ставит NEGO_AI=off).
"""

import asyncio
import time

import pytest

from app.ai import scenario_gen


@pytest.mark.asyncio
async def test_generation_gives_up_within_its_budget(monkeypatch) -> None:
    async def never_answers(*args, **kwargs):
        await asyncio.sleep(60)
        return "{}"

    monkeypatch.setattr(scenario_gen, "GEN_BUDGET_S", 0.4)
    from app.providers.openrouter import chat as orchat
    monkeypatch.setattr(orchat, "complete", never_answers)

    started = time.perf_counter()
    result = await scenario_gen.generate_scenario("любая ситуация", "ru")
    elapsed = time.perf_counter() - started

    assert result is None, "молчащая модель не должна давать сценарий"
    assert elapsed < 2.0, f"сдались только через {elapsed:.1f}с — клиент уже ушёл"


@pytest.mark.asyncio
async def test_second_attempt_runs_only_while_budget_lasts(monkeypatch) -> None:
    """Ретрай существует ради болтливых моделей, а не ради удвоения ожидания."""
    calls = 0

    async def babbles(*args, **kwargs):
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.1)
        return "конечно! вот ваш сценарий:"   # не JSON

    monkeypatch.setattr(scenario_gen, "GEN_BUDGET_S", 5.0)
    from app.providers.openrouter import chat as orchat
    monkeypatch.setattr(orchat, "complete", babbles)

    assert await scenario_gen.generate_scenario("ситуация", "ru") is None
    assert calls == 2, "две попытки — столько и заявлено"


@pytest.mark.asyncio
async def test_debrief_waits_for_the_note_only_so_long(monkeypatch) -> None:
    """Разбор самодостаточен: слово наставника не имеет права его задерживать.

    Он публикуется ОДНИМ событием, поэтому медленная модель раньше держала
    человека перед пустым экраном столько, сколько думала.
    """
    from app.orchestrator import negotiation

    assert negotiation.DEBRIEF_NOTE_BUDGET_S <= 10, (
        "потолок ожидания слова наставника должен оставаться человеческим")
