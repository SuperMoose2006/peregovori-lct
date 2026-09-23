"""`/api/health` обязан называть ТОГО, КТО СЛУШАЕТ НА САМОМ ДЕЛЕ.

ЗАЧЕМ ЭТОТ ФАЙЛ. Строка про голос уже один раз разошлась с реальностью: после
перевода на realtime-сессию OpenAI health продолжал называть модель запасного
пути. Ошибка повторилась, когда у классического пути появился второй провайдер —
локальная модель: переменная `NEGO_VOICE=classic` отвечает на вопрос «каким
конвейером», а «чем распознаём» решает фабрика по ответу локальной службы.
Health пересказывал этот выбор своими словами и снова соврал.

Поэтому здесь закреплено не содержание строки, а её источник: описание берётся
у ТОГО ЖЕ провайдера, которого получит партия. На показе по этой строке судят,
работает ли голос, и «выглядит настоящим, а внутри другой» — ровно то четвёртое
состояние, которого в продукте не бывает.
"""

from __future__ import annotations

import pytest

from app.main import _voice_describe
from app.providers.asr.openrouter import OpenRouterASR
from app.providers.asr.parakeet import ParakeetASR, forget_probe


@pytest.fixture(autouse=True)
def _online(monkeypatch):
    # Офлайн health честно отвечает «недоступно» — это отдельная ветка.
    monkeypatch.setenv("NEGO_AI", "api")
    forget_probe()
    yield
    forget_probe()


def test_offline_says_so_and_names_nobody(monkeypatch):
    monkeypatch.setenv("NEGO_AI", "off")
    assert _voice_describe() == "unavailable (NEGO_AI=off)"


def test_the_classic_path_names_the_local_model_when_the_service_answers(monkeypatch):
    monkeypatch.setenv("NEGO_VOICE", "classic")
    monkeypatch.setattr("app.providers.asr.make_asr", lambda: ParakeetASR())
    got = _voice_describe()
    assert got.startswith("classic (")
    assert "parakeet" in got, got
    # Ровно то, ради чего тест: облачная модель не смеет попасть в строку,
    # когда слушает локальная.
    assert "gemini" not in got


def test_the_classic_path_names_the_cloud_model_when_the_service_is_down(monkeypatch):
    monkeypatch.setenv("NEGO_VOICE", "classic")
    monkeypatch.setattr("app.providers.asr.make_asr", lambda: OpenRouterASR())
    got = _voice_describe()
    assert "openrouter" in got
    assert "parakeet" not in got


def test_the_realtime_path_names_the_streaming_model(monkeypatch):
    monkeypatch.delenv("NEGO_VOICE", raising=False)
    monkeypatch.setenv("OPENAI_REALTIME_KEY", "sk-test")
    got = _voice_describe()
    assert "openai-realtime" in got
    assert "потоком" in got


def test_without_a_realtime_key_the_string_says_why(monkeypatch):
    """Классический путь без ключа — не поломка, но человек должен понимать,
    почему текст не появляется по ходу речи."""
    monkeypatch.delenv("NEGO_VOICE", raising=False)
    monkeypatch.delenv("OPENAI_REALTIME_KEY", raising=False)
    monkeypatch.setattr("app.providers.asr.make_asr", lambda: ParakeetASR())
    got = _voice_describe()
    assert got.startswith("classic (")
    assert "ключа realtime нет" in got
