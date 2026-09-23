"""Служба локального распознавания (`services/asr-parakeet/server.py`) — без модели.

ПОЧЕМУ ЭТО ПРОВЕРЯЕТСЯ ИЗ ТЕСТОВ ГЕЙТВЕЯ. У службы своих тестов нет, а
гейтвей от неё зависит напрямую: `ParakeetASR` шлёт ей сырой PCM и верит
ответу. Две половины одного протокола живут в разных службах, и расхождение
(имя заголовка, порядок байт, форма ответа) снаружи выглядит как «голос
молчит», а не как ошибка.

ПОЧЕМУ БЕЗ МОДЕЛИ. NeMo грузится только в startup-хуке и занимает 5.7 ГБ.
`TestClient` без `with` хук не запускает, поэтому модуль импортируется
дёшево, а вместо модели подкладывается подделка с тем же `transcribe()`. Она
же читает временный WAV, пока он существует, — так проверяется ровно то, что
получила бы настоящая модель.
"""

from __future__ import annotations

import importlib.util
import itertools
import os
import warnings
import wave
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient

SERVER = Path(__file__).resolve().parents[2] / "asr-parakeet" / "server.py"
_names = itertools.count()


def _load():
    """Свежий экземпляр модуля: `MAX_SECONDS` и `THREADS` читаются из окружения
    при импорте, и общий на все тесты модуль не дал бы проверить переменные."""
    spec = importlib.util.spec_from_file_location(f"dialog_asr_server_{next(_names)}", SERVER)
    module = importlib.util.module_from_spec(spec)
    with warnings.catch_warnings():
        # `on_event` устарел в FastAPI; это забота службы, а не этого файла.
        warnings.simplefilter("ignore", DeprecationWarning)
        spec.loader.exec_module(module)
    return module


class FakeModel:
    """Подделка NeMo: читает WAV в момент вызова и отвечает как Hypothesis."""

    def __init__(self, text="  87 тысяч  ", as_hypothesis=True):
        self.text, self.as_hypothesis = text, as_hypothesis
        self.calls: list[dict] = []

    def transcribe(self, paths, batch_size=1, verbose=False):
        with wave.open(paths[0], "rb") as w:
            self.calls.append({
                "path": paths[0], "batch_size": batch_size,
                "channels": w.getnchannels(), "width": w.getsampwidth(),
                "rate": w.getframerate(), "frames": w.getnframes(),
                "samples": np.frombuffer(w.readframes(w.getnframes()), dtype="<i2"),
            })
        return [SimpleNamespace(text=self.text) if self.as_hypothesis else self.text]


@pytest.fixture
def sidecar():
    return _load()


@pytest.fixture
def loaded(sidecar):
    sidecar._model = FakeModel()
    sidecar._loaded_at = 14.5
    return sidecar


def _post(module, body: bytes, rate: str | None = "16000"):
    headers = {"Content-Type": "application/octet-stream"}
    if rate is not None:
        headers["X-Sample-Rate"] = rate
    client = TestClient(module.app, raise_server_exceptions=False)
    return client.post("/transcribe", content=body, headers=headers)


# ------------------------------------------------------------------ /health

def test_health_is_503_while_the_model_loads_and_200_after(sidecar):
    """По этому коду юнит systemd (`ExecStartPost`) держит старт гейтвея: 200 во
    время загрузки отпустил бы гейтвей к службе, которая полторы минуты молчит."""
    client = TestClient(sidecar.app)   # без `with`: startup (NeMo) не запускается
    assert sidecar._model is None
    loading = client.get("/health")
    assert loading.status_code == 503 and loading.json()["ok"] is False

    sidecar._model, sidecar._loaded_at = FakeModel(), 14.46
    ready = client.get("/health")
    assert ready.status_code == 200
    assert ready.json() == {"ok": True, "model": sidecar.MODEL_NAME,
                            "load_seconds": 14.5, "threads": sidecar.THREADS}


def test_transcribe_is_refused_while_the_model_loads(sidecar):
    audio = np.zeros(1600, dtype=np.float32).tobytes()
    assert _post(sidecar, audio).status_code == 503


# -------------------------------------------------------------- /transcribe

def test_an_empty_body_is_an_empty_transcript_without_touching_the_model(loaded):
    response = _post(loaded, b"")
    assert response.status_code == 200 and response.json() == {"text": ""}
    assert not loaded._model.calls


@pytest.mark.parametrize("rate", ["abc", "", "16000.5"])
def test_a_non_numeric_sample_rate_is_a_400(loaded, rate):
    response = _post(loaded, np.zeros(160, dtype=np.float32).tobytes(), rate)
    assert response.status_code == 400
    assert not loaded._model.calls


def test_a_missing_sample_rate_means_16_khz(loaded):
    assert _post(loaded, np.zeros(1600, dtype=np.float32).tobytes(), None).status_code == 200
    assert loaded._model.calls[0]["rate"] == 16000


def test_audio_longer_than_the_ceiling_is_a_413_and_never_reaches_the_model(loaded):
    """Минута с лишним — значит VAD не сработал; считать такое дороже, чем отказать.
    Частота занижена, чтобы проверить настоящий потолок без мегабайт в теле."""
    rate = 100
    at_limit = np.zeros(int(loaded.MAX_SECONDS * rate), dtype=np.float32)
    over = np.zeros(at_limit.size + 1, dtype=np.float32)
    assert _post(loaded, at_limit.tobytes(), str(rate)).status_code == 200
    assert _post(loaded, over.tobytes(), str(rate)).status_code == 413
    assert len(loaded._model.calls) == 1


def test_the_ceiling_follows_asr_max_seconds(monkeypatch):
    monkeypatch.setenv("ASR_MAX_SECONDS", "2")
    module = _load()
    module._model = FakeModel()
    assert module.MAX_SECONDS == 2.0
    assert _post(module, np.zeros(3 * 16000, dtype=np.float32).tobytes()).status_code == 413


@pytest.mark.parametrize("rate", [16000, 24000])
def test_float32_pcm_reaches_the_model_as_16_bit_mono_wav_of_the_same_length(loaded, rate):
    pcm = np.array([0.0, 0.5, -0.5, 1.0, -1.0, 1.7, -3.0, 0.25] * 50, dtype=np.float32)
    response = _post(loaded, pcm.astype("<f4").tobytes(), str(rate))

    assert response.status_code == 200
    assert response.json()["text"] == "87 тысяч", "пробелы модели не срезаны"
    call = loaded._model.calls[0]
    assert (call["channels"], call["width"], call["rate"]) == (1, 2, rate)
    assert call["frames"] == pcm.size, "длина речи поменялась по дороге"
    assert call["batch_size"] == 1
    # Выход за [-1, 1] обрезается, а не заворачивается через знак: без клипа
    # громкий кусок превращался бы в щелчок на противоположном краю шкалы.
    expected = (np.clip(pcm, -1.0, 1.0) * 32767.0).astype(np.int16)
    assert np.array_equal(call["samples"], expected)
    assert response.json()["seconds"] == round(pcm.size / rate, 2)


def test_the_temporary_wav_does_not_outlive_the_request(loaded):
    """Речь человека на диске не остаётся — так обещает комментарий в службе."""
    assert _post(loaded, np.zeros(1600, dtype=np.float32).tobytes()).status_code == 200
    assert not os.path.exists(loaded._model.calls[0]["path"])


def test_a_plain_string_answer_is_accepted_too(sidecar):
    """Разные версии NeMo отдают то Hypothesis, то строку — служба обязана
    понимать обе, иначе обновление библиотеки молча обнулит расшифровку."""
    sidecar._model = FakeModel(text=" Что важно? ", as_hypothesis=False)
    assert _post(sidecar, np.zeros(1600, dtype=np.float32).tobytes()).json()["text"] == "Что важно?"


@pytest.mark.xfail(strict=True, reason=(
    "server.py:88-95 проверяет только, что X-Sample-Rate — целое, и тело не "
    "проверяет вовсе: частота 0 даёт ZeroDivisionError, отрицательная — "
    "wave.Error, тело не кратное 4 байтам — ValueError из np.frombuffer; все три → 500"))
@pytest.mark.parametrize(("rate", "body"), [
    ("0", np.zeros(160, dtype=np.float32).tobytes()),
    ("-16000", np.zeros(160, dtype=np.float32).tobytes()),
    ("16000", b"\x00\x00\x00"),
])
def test_malformed_audio_is_a_400_not_a_crash(loaded, rate, body):
    assert _post(loaded, body, rate).status_code == 400


# ----------------------------------------------------- провод гейтвей ↔ служба

@pytest.mark.asyncio
async def test_the_gateway_client_and_the_sidecar_speak_the_same_protocol(loaded, monkeypatch):
    """Настоящий `ParakeetASR` против настоящего приложения службы, без сети:
    имя заголовка, порядок байт и форма ответа сверяются обеими сторонами сразу."""
    import httpx
    from app.providers.asr import parakeet

    real_client = httpx.AsyncClient

    def over_asgi(**kwargs):
        return real_client(transport=httpx.ASGITransport(app=loaded.app), **kwargs)

    monkeypatch.setattr(parakeet.httpx, "AsyncClient", over_asgi)
    monkeypatch.setenv("NEGO_ASR_URL", "http://asr.invalid")
    pcm = np.linspace(-0.9, 0.9, 24000, dtype=np.float32)

    result = await parakeet.ParakeetASR().transcribe(pcm, 24000, "ru")

    assert result.text == "87 тысяч" and result.final
    call = loaded._model.calls[0]
    assert (call["rate"], call["frames"]) == (24000, pcm.size)
    assert np.array_equal(call["samples"], (pcm * 32767.0).astype(np.int16))
