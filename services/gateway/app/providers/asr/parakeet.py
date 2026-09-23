"""parakeet.py — распознавание речи локальной службой (NVIDIA parakeet-tdt-0.6b-v3).

ЧТО ЭТО МЕНЯЕТ ПО СРАВНЕНИЮ С ОБЛАКОМ. Три вещи, и только третья про качество:

  · деньги — распознавание перестаёт стоить за минуту: модель своя;
  · приватность — речь не уходит с машины вовсе;
  · числа — модель возвращает их ЦИФРАМИ («восемьдесят семь тысяч» → «87
    тысяч»). Движку это по пути: `engine/numbers.py` понимает и словесную форму,
    но цифра короче и надёжнее.

ЧЕГО ЭТО НЕ МЕНЯЕТ. Модель не потоковая: она отвечает на кусок речи целиком,
как и распознавание через chat-completions. Текста «по ходу фразы» здесь нет и
не будет — это свойство realtime-пути OpenAI, и подменять одно другим значило бы
обещать то, чего нет.

ПОЧЕМУ ПО HTTP, А НЕ ИМПОРТОМ. Модель занимает в пике 5.7 ГБ, а юнит гейтвея
ограничен двумя. Она живёт отдельной службой (`services/asr-parakeet`), и этот
класс — тонкий клиент к ней. Служба слушает только петлю.
"""

from __future__ import annotations

import os
import time

import httpx
import numpy as np

from app.providers.asr.base import ASRProvider, Transcript

#: Адрес службы. Пусто → провайдера нет, и фабрика возьмёт облачного.
URL = os.getenv("NEGO_ASR_URL", "http://127.0.0.1:8020").rstrip("/")

#: Ожидание ответа. Потолок щедрый: при RTF 0.1 даже минутная реплика
#: укладывается в шесть секунд, а лишняя секунда ожидания лучше потерянного хода.
_TIMEOUT = float(os.getenv("NEGO_ASR_TIMEOUT_S", "20"))

#: На сколько верим результату опроса здоровья. Служба поднимается полторы
#: минуты, и дёргать её на каждой партии незачем.
_PROBE_TTL_S = 60.0

_probe: tuple[float, bool] | None = None


def service_ready(timeout: float = 0.5) -> bool:
    """Поднялась ли служба. Ответ кэшируется: проверка стоит запроса в петлю.

    ВАЖНО, ЧТО ЭТО НЕ `available()`. Провайдер может быть настроен, но служба
    ещё грузит модель — тогда партия обязана уйти к облачному провайдеру, а не
    ждать. Пока модель грузится, служба честно отвечает 503.
    """
    global _probe
    now = time.monotonic()
    if _probe and now - _probe[0] < _PROBE_TTL_S:
        return _probe[1]
    ok = False
    try:
        r = httpx.get(f"{URL}/health", timeout=timeout)
        ok = r.status_code == 200 and bool(r.json().get("ok"))
    except Exception:
        ok = False
    _probe = (now, ok)
    return ok


def forget_probe() -> None:
    """Сбросить кэш опроса. Нужен тестам и перезапуску службы."""
    global _probe
    _probe = None


class ParakeetASR(ASRProvider):
    """Речь → текст локальной моделью."""

    def available(self) -> bool:
        return bool(URL)

    def describe(self) -> str:
        return f"parakeet (nvidia/parakeet-tdt-0.6b-v3 локально, {URL})"

    async def transcribe(self, pcm: np.ndarray, sample_rate: int, lang: str) -> Transcript:
        if pcm.size == 0:
            return Transcript(text="", final=True)
        payload = np.ascontiguousarray(pcm, dtype=np.float32).tobytes()
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                r = await client.post(
                    f"{URL}/transcribe",
                    content=payload,
                    headers={"X-Sample-Rate": str(sample_rate),
                             "Content-Type": "application/octet-stream"},
                )
                r.raise_for_status()
                text = str(r.json().get("text") or "").strip()
        except Exception:
            # Молчание вместо хода — худший исход: человек сказал, а стол не
            # ответил. Пустая расшифровка ведёт себя как «не расслышали», и
            # пайплайн уже умеет это показать.
            forget_probe()
            return Transcript(text="", final=True)
        return Transcript(text=text, final=True)
