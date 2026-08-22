"""Маршрутизация моделей и защиты, которые вырос из живого бейк-оффа.

Сети здесь нет: только разрешение переменных окружения и чистые текстовые
защиты. Причины каждой защиты — в `docs/model-bakeoff.md`.

ЧТО ИЗМЕНИЛОСЬ. Раньше эти тесты проверяли выбор модели внутри
`chat_models.OpenAIBackend`. Синхронный слой бэкендов удалён (живой путь ходит в
OpenRouter асинхронно), и выбор модели переехал в `providers/routing.py` — где
он стал ролевым: судья и оппонент больше не обязаны быть одной моделью.
"""

import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.ai.judge import TECHNIQUES_RU, _clean_techniques  # noqa: E402
from app.ai.sanitize import sanitize  # noqa: E402
from app.providers.routing import PREMIUM_OPPONENT, describe, model_for  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for key in ("NEGO_MODEL_OPPONENT", "NEGO_MODEL_JUDGE", "NEGO_MODEL_VISION",
                "NEGO_MODEL_REASONING", "NEGO_MODEL_ASR"):
        monkeypatch.delenv(key, raising=False)
    yield


# ---------------------------------------------------------------------------
# Маршрутизация
# ---------------------------------------------------------------------------

def test_every_role_has_a_default():
    """Ни одна роль не должна оставаться без модели: иначе она молча отвалится."""
    roles = ("opponent", "judge", "vision", "reasoning", "asr")
    for role in roles:
        assert model_for(role), f"роль {role} без дефолтной модели"
    assert set(describe()) == set(roles)


def test_env_overrides_the_default(monkeypatch):
    monkeypatch.setenv("NEGO_MODEL_JUDGE", "vendor/some-fast-model")
    assert model_for("judge") == "vendor/some-fast-model"
    assert describe()["judge"] == "vendor/some-fast-model"


def test_role_override_is_per_role(monkeypatch):
    """Смена модели оппонента НЕ должна утаскивать за собой судью.

    Ради этого роли и разведены: судья стоит в критическом пути хода, и ставить
    туда дорогую модель «заодно» — значит платить секундами тишины.
    """
    monkeypatch.setenv("NEGO_MODEL_OPPONENT", PREMIUM_OPPONENT)
    assert model_for("opponent") == PREMIUM_OPPONENT
    assert model_for("judge") != PREMIUM_OPPONENT, "судья поехал вслед за оппонентом"


def test_blank_env_falls_back_to_the_default(monkeypatch):
    """Пустая переменная — это не «модель без имени», а её отсутствие."""
    default = model_for("opponent")
    monkeypatch.setenv("NEGO_MODEL_OPPONENT", "   ")
    assert model_for("opponent") == default


def test_premium_opponent_is_a_named_constant():
    """У переключателя «максимальное качество» один канонический адрес.

    Иначе строка модели расползается по коду и документации, и они расходятся.
    """
    assert "/" in PREMIUM_OPPONENT
    assert PREMIUM_OPPONENT != model_for("opponent"), "премиум не должен быть дефолтом разработки"


# ---------------------------------------------------------------------------
# Защиты, оплаченные бейк-оффом
# ---------------------------------------------------------------------------

def test_foreign_script_reply_is_rejected():
    """Дешёвые мультиязычные модели роняют иероглифы посреди русской фразы.

    Шаблонная реплика движка лучше искажённой, поэтому `sanitize()` её
    отвергает целиком.
    """
    assert sanitize("Да, для нас — 携手守护, и мы идём навстречу.") is None
    assert sanitize("Мы готовы обсудить объём.") == "Мы готовы обсудить объём."


def test_out_of_character_reply_is_rejected():
    """Оппонент не имеет права ломать четвёртую стену."""
    assert sanitize("Как языковая модель, я не могу вести переговоры.") is None
    assert sanitize("As an AI, I cannot assist with that.") is None


def test_markdown_is_stripped_not_shown():
    assert sanitize("**Хорошо**, давайте обсудим.") == "Хорошо, давайте обсудим."
    assert sanitize('"Триста тысяч."') == "Триста тысяч."


def test_judge_techniques_are_whitelisted():
    """Свободные ярлыки доезжают до плашек судьи, поэтому выживает только словарь."""
    got = _clean_techniques(
        ["вскрытие интересов", "интерrogация", "  РАЗМЕН  ", "вскрытие интересов"], "ru")
    assert got == ["вскрытие интересов", "размен"]
    assert all(t in TECHNIQUES_RU for t in got)
    assert _clean_techniques(None, "ru") == []
