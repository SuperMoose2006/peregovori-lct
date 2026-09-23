"""Локальное распознавание: выбор провайдера и поведение при отказе службы.

ЧТО ЗДЕСЬ ЗАКРЫТО. Провайдеров стало два, и оба могут отсутствовать: облачный —
без ключа, локальный — пока служба грузит модель (полторы минуты после
перезапуска). Опасен именно второй случай: настроенный, но не поднявшийся
провайдер выглядит рабочим, и партия, начатая в эту минуту, молча осталась бы
без голоса. Поэтому фабрика спрашивает СЛУЖБУ, а не переменную окружения.

Тесты офлайновые: `conftest.py` ставит `NEGO_AI=off`, сеть не трогается — опрос
здоровья и запрос на распознавание подменяются.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.providers.asr import make_asr
from app.providers.asr.openrouter import OpenRouterASR
from app.providers.asr.parakeet import ParakeetASR, forget_probe


@pytest.fixture(autouse=True)
def _clean_probe():
    forget_probe()
    yield
    forget_probe()


def test_without_the_service_the_cloud_provider_is_chosen(monkeypatch):
    """Служба не ответила — партия уезжает в облако, а не ждёт."""
    monkeypatch.delenv("NEGO_ASR", raising=False)
    monkeypatch.setattr("app.providers.asr.service_ready", lambda: False)
    assert isinstance(make_asr(), OpenRouterASR)


def test_with_the_service_up_the_local_model_wins(monkeypatch):
    monkeypatch.delenv("NEGO_ASR", raising=False)
    monkeypatch.setattr("app.providers.asr.service_ready", lambda: True)
    assert isinstance(make_asr(), ParakeetASR)


def test_openrouter_can_be_demanded_explicitly(monkeypatch):
    """Явный выбор облака не проверяет службу вовсе — это аварийный выход."""
    monkeypatch.setenv("NEGO_ASR", "openrouter")

    def _boom() -> bool:
        raise AssertionError("службу спрашивать не должны")

    monkeypatch.setattr("app.providers.asr.service_ready", _boom)
    assert isinstance(make_asr(), OpenRouterASR)


@pytest.mark.asyncio
async def test_silence_never_reaches_the_service():
    """Пустой кусок — не повод будить модель."""
    got = await ParakeetASR().transcribe(np.zeros(0, dtype=np.float32), 16_000, "ru")
    assert got.text == ""
    assert got.final is True


@pytest.mark.asyncio
async def test_a_dead_service_yields_silence_not_a_crash(monkeypatch):
    """Служба упала посреди партии: ход теряется как «не расслышали», а не
    роняет сессию. Принцип 1 — без сети продукт остаётся играбельным."""

    class _Boom:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            raise OSError("служба недоступна")

    monkeypatch.setattr("app.providers.asr.parakeet.httpx.AsyncClient", _Boom)
    pcm = np.zeros(16_000, dtype=np.float32)
    got = await ParakeetASR().transcribe(pcm, 16_000, "ru")
    assert got.text == ""


@pytest.mark.asyncio
async def test_the_recognised_text_comes_back_trimmed(monkeypatch):
    seen: dict[str, object] = {}

    class _Fake:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, content=None, headers=None):
            seen["url"] = url
            seen["bytes"] = len(content or b"")
            seen["rate"] = (headers or {}).get("X-Sample-Rate")

            class _R:
                status_code = 200

                @staticmethod
                def raise_for_status():
                    return None

                @staticmethod
                def json():
                    return {"text": "  Давайте опираться на объективные данные  "}

            return _R()

    monkeypatch.setattr("app.providers.asr.parakeet.httpx.AsyncClient", _Fake)
    pcm = np.full(800, 0.25, dtype=np.float32)
    got = await ParakeetASR().transcribe(pcm, 16_000, "ru")
    assert got.text == "Давайте опираться на объективные данные"
    # float32 — четыре байта на отсчёт: уходит ровно звук, без обёрток.
    assert seen["bytes"] == 3200
    assert seen["rate"] == "16000"
    assert str(seen["url"]).endswith("/transcribe")
