"""server.py — распознавание речи моделью NVIDIA parakeet-tdt-0.6b-v3.

ПОЧЕМУ ОТДЕЛЬНАЯ СЛУЖБА, А НЕ МОДУЛЬ ГЕЙТВЕЯ. Замер на боевой машине: пик
резидентной памяти при загрузке модели — 5.7 ГБ, а юнит гейтвея ограничен
`MemoryMax=2G` и обязан таким остаться: он держит партии в памяти, и раздувать
его лимит ради одной модели значит потерять предсказуемость всего процесса.
Вторая причина — время: модель поднимается 14.5 с из кэша, и это никак не должно
попадать в путь запуска гейтвея.

ЧТО ЭТА СЛУЖБА НЕ ДЕЛАЕТ. Она не потоковая. Модель отвечает на КУСОК речи
целиком, а не выдаёт гипотезу по ходу фразы. Поэтому она занимает место
«классического» распознавания (после конца реплики), а не realtime-пути OpenAI,
который рисует текст на экране, пока человек ещё говорит. Разница видна
пользователю, и выдавать одно за другое нельзя.

ЗАМЕР НА ЭТОЙ МАШИНЕ (12 ядер Ryzen 9 5950X, шесть потоков торчу):
фраза 12.17 с распознаётся за 1.1–1.4 с, то есть RTF ≈ 0.1 — примерно
десятикратный запас к реальному времени. Русский текст возвращается с числами
УЖЕ цифрами («восемьдесят семь тысяч» → «87 тысяч»), что движку как раз и нужно:
`engine/numbers.py` нормализует и словесную форму, но цифра короче путь.

ПРОТОКОЛ. `POST /transcribe` — тело это сырой PCM float32 моно; частота в
заголовке `X-Sample-Rate`. Ответ `{"text": str}`. `GET /health` отвечает, только
когда модель уже загружена: пока она грузится, честнее вернуть 503, чем принять
запрос и молчать полторы минуты.
"""

from __future__ import annotations

import io
import os
import tempfile
import time
import wave

import numpy as np
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

MODEL_NAME = os.getenv("ASR_MODEL", "nvidia/parakeet-tdt-0.6b-v3")
#: Потоков BLAS на распознавание. Всех ядер машины брать нельзя: рядом живёт
#: гейтвей, и его партии важнее лишних процентов RTF.
THREADS = int(os.getenv("ASR_THREADS", "6"))
#: Потолок длины куска. Реплика в переговорах — секунды; минута с лишним
#: означает, что VAD не сработал, и считать её дороже, чем отказать.
MAX_SECONDS = float(os.getenv("ASR_MAX_SECONDS", "90"))

app = FastAPI(title="dialog-asr")

_model = None
_loaded_at: float | None = None


@app.on_event("startup")
def _load() -> None:
    global _model, _loaded_at
    import torch

    torch.set_num_threads(THREADS)
    import nemo.collections.asr as nemo_asr

    t0 = time.time()
    model = nemo_asr.models.ASRModel.from_pretrained(MODEL_NAME)
    model.eval()
    _model = model
    _loaded_at = time.time() - t0
    print(f"модель {MODEL_NAME} загружена за {_loaded_at:.1f} с, потоков {THREADS}", flush=True)


@app.get("/health")
def health() -> JSONResponse:
    if _model is None:
        # Ещё грузится. 503 — это не ошибка, а «спроси позже»: вызывающий
        # возьмёт другого провайдера, вместо того чтобы ждать молча.
        return JSONResponse({"ok": False, "reason": "загружается"}, status_code=503)
    return JSONResponse({"ok": True, "model": MODEL_NAME, "load_seconds": round(_loaded_at or 0, 1),
                         "threads": THREADS})


@app.post("/transcribe")
async def transcribe(request: Request, x_sample_rate: str = Header(default="16000")) -> dict:
    if _model is None:
        raise HTTPException(status_code=503, detail="модель ещё грузится")
    raw = await request.body()
    if not raw:
        return {"text": ""}
    try:
        rate = int(x_sample_rate)
    except ValueError:
        raise HTTPException(status_code=400, detail="X-Sample-Rate не число")

    pcm = np.frombuffer(raw, dtype=np.float32)
    if pcm.size == 0:
        return {"text": ""}
    if pcm.size / rate > MAX_SECONDS:
        raise HTTPException(status_code=413, detail=f"кусок длиннее {MAX_SECONDS} с")

    # NeMo принимает путь к файлу — на нём и замерялось. Временный файл живёт
    # в PrivateTmp юнита и исчезает вместе с запросом: речь на диске не остаётся.
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        _write_wav(tmp.name, pcm, rate)
        t0 = time.time()
        out = _model.transcribe([tmp.name], batch_size=1, verbose=False)
    took = time.time() - t0

    text = out[0].text if hasattr(out[0], "text") else str(out[0])
    seconds = pcm.size / rate
    print(f"{seconds:.1f} с речи → {took:.2f} с, RTF {took / max(seconds, 0.01):.3f}", flush=True)
    return {"text": text.strip(), "seconds": round(seconds, 2), "took": round(took, 2)}


def _write_wav(path: str, pcm: np.ndarray, rate: int) -> None:
    """float32 [-1, 1] → 16-битный моно wav, как ждёт модель."""
    clipped = np.clip(pcm, -1.0, 1.0)
    ints = (clipped * 32767.0).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(ints.tobytes())


# Чтобы `python server.py` работал так же, как `uvicorn server:app`.
if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(app, host=os.getenv("ASR_HOST", "127.0.0.1"),
                port=int(os.getenv("ASR_PORT", "8020")), workers=1)
