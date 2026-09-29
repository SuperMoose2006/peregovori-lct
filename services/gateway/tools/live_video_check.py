"""live_video_check.py — «заработало ли живое видео», одной командой.

Без флагов — БЕСПЛАТНО: читает настройки, называет ошибки словами, проверяет,
что SDK сервиса установлен, и делает один бесплатный запрос проверки ключа
(каталог лиц), если сервис его даёт. Ни одной сессии у сервиса не открывает.

`--session` — ОДНА КОРОТКАЯ НАСТОЯЩАЯ СЕССИЯ (у платного сервиса это
~0.5 минуты тарифа): тот же адаптер, что в партии, получает три секунды
синтетической речи, как реплику оппонента, и печатает, что вышло: за сколько
подключился, сколько кадров пришло и сколько опоздало, на сколько кадр отстаёт
от своего звука (p50/p95) и какое удержание звука (`NEGO_LIVE_VIDEO_AV_DELAY_MS`)
из этого следует. `--save DIR` кладёт несколько кадров JPEG — посмотреть глазами,
что это лицо, а не чёрный квадрат.

С заглушкой (`NEGO_LIVE_VIDEO=stub`) `--session` бесплатен и работает без сети:
так прибор проверен сам.

    cd services/gateway && .venv/bin/python -m tools.live_video_check
    cd services/gateway && .venv/bin/python -m tools.live_video_check --session --save /tmp/lv

Код выхода: 0 — всё сошлось; 1 — видео выключено или сессия не дала кадров.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import os
import sys
import time
from pathlib import Path


from app.avatar.live import config as live_config
from app.avatar.live.clock import LEAD_MS


def _say(line: str) -> None:
    print(line, flush=True)


def _pct(values: list[float], q: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(q * (len(ordered) - 1) + 0.5))]


def _speech(seconds: float) -> list[bytes]:
    """Синтетическая «речь»: слоги с паузами, 24 кГц, куски по 100 мс."""
    from app.providers.tts.testtone import _phrase
    words = " ".join(["переговоры"] * int(seconds * 2.2))
    audio = _phrase(words, True)[: int(24000 * seconds)]
    step = 2400
    return [audio[i:i + step].astype("<f4").tobytes() for i in range(0, len(audio), step)]


async def _session(cfg: live_config.LiveVideoConfig, save: str | None) -> int:
    from app.avatar.live.adapter import LiveVideoAvatar
    from app.avatar.live.driver import Persona, finish_stops

    events: list[tuple[float, dict]] = []
    persona = Persona("supplier")
    cls = live_config.driver_class(cfg.spec)
    avatar = LiveVideoAvatar(persona, lambda e: events.append((time.monotonic(), e)),
                             lambda: cls.from_env(cfg, persona), cfg)
    try:
        return await _drive(avatar, cfg, save, events)
    finally:
        await avatar.close()
        # Остановка сессии у сервиса — фоновая задача, рассчитанная на живой
        # шлюз. Прибор выходит сразу, и без ожидания запрос отменялся вместе с
        # циклом событий: 29.09 две такие сессии сервис закрыл сам через 194 и
        # 210 с, и эти минуты списаны.
        if await finish_stops():
            _say("  ✗ остановка сессии у сервиса не подтвердилась за 5 с — проверьте кабинет сервиса")


async def _drive(avatar, cfg: live_config.LiveVideoConfig, save: str | None,
                 events: list[tuple[float, dict]]) -> int:
    started = time.monotonic()
    avatar.start()
    while avatar.link in ("idle", "connecting") and time.monotonic() - started < cfg.connect_timeout_s + 2:
        await asyncio.sleep(0.05)
    if avatar.link != "ready":
        _say(f"✗ подключение не удалось: связь «{avatar.link}», отказы {avatar.stats.degrades}")
        return 1
    _say(f"✓ подключились за {time.monotonic() - started:.2f} с")

    await avatar.set_state("thinking")
    gen = "check:1"
    chunks = _speech(3.0)
    for chunk in chunks:
        event = {"type": "response.output.delta", "kind": "audio", "generation_id": gen, "turn_id": 1,
                 "audio": base64.b64encode(chunk).decode("ascii")}
        avatar.audio_out(event)
        await avatar.speak(chunk, generation_id=gen)
        await asyncio.sleep(0.03)          # синтез быстрее реального времени, как в партии
    await avatar.end_of_speech(gen)
    deadline = time.monotonic() + 3.0 + cfg.stall_ms / 1000 + 2
    while time.monotonic() < deadline:
        finished = avatar.clock.finished_at()
        if finished and time.monotonic() > finished + 0.5 and not avatar._held:
            break
        await asyncio.sleep(0.05)
    stats = avatar.stats

    frames = [e for _, e in events if e["type"] == "avatar.frame"]
    audio = [e for _, e in events if e.get("kind") == "audio"]
    _say(f"  звук: {len(audio)}/{len(chunks)} кусков ушло человеку "
         f"(придержано {stats.audio_held}, сразу {stats.audio_direct})")
    _say(f"  кадры: пришло {stats.frames_in}, отдано {stats.frames_sent}, опоздало {stats.frames_late}, "
         f"прорежено {stats.frames_thinned}, чужих {stats.frames_foreign}, битых {stats.frames_invalid}")
    if stats.degrades:
        _say(f"  ✗ лицо возвращалось к портрету: {stats.degrades}")
    if stats.frame_lag_ms:
        p50, p95 = _pct(stats.frame_lag_ms, 0.5), _pct(stats.frame_lag_ms, 0.95)
        # Кадр ОБЯЗАН прийти раньше своего звука: опоздавший в пределах
        # порога (`stale_ms`, 100 мс при 25 к/с) ещё показывается, но губы
        # тогда отстают от голоса, и это видно. Звук у клиента и так ждёт
        # джиттер-буфер; удержание добирает остальное с запасом 50 мс.
        need = max(0, int(p95 - LEAD_MS + 50))
        delay = cfg.av_delay_ms if cfg.av_delay_ms is not None else avatar._info.av_delay_ms
        _say(f"  отставание кадра от своего звука: p50 {p50:.0f} мс, p95 {p95:.0f} мс")
        # Одна фраза в одной сессии — не основание снижать удержание:
        # отставание сервиса гуляет от сессии к сессии (замер 29.09 через
        # продукт — 0.57–1.31 с по репликам), и число выбрано прогонами
        # через продукт. Поднимать — да, если сервис стабильно медленнее.
        if need > delay:
            _say(f"  удержание звука {delay} мс, этой сессии нужно ≈ {need} мс: первый звук реплик "
                 f"будет ждать губы (до потолка ожидания). Если так в каждой проверке — "
                 f"NEGO_LIVE_VIDEO_AV_DELAY_MS={need}")
        else:
            _say(f"  удержание звука {delay} мс — хватает с запасом {delay - need} мс. Снижать по одной "
                 f"сессии не надо: число выбирается прогонами через продукт (tools/live_video_e2e.py)")
    if stats.first_frame_lag_ms:
        _say(f"  первый кадр ушёл человеку через {stats.first_frame_lag_ms[0]:.0f} мс от первого звука")
    if save and frames:
        out = Path(save)
        out.mkdir(parents=True, exist_ok=True)
        picks = frames[:: max(1, len(frames) // 6)][:6]
        for i, frame in enumerate(picks):
            (out / f"frame-{i}-{int(frame['pts_ms']):05d}ms.jpg").write_bytes(base64.b64decode(frame["jpeg"]))
        _say(f"  кадры для глаза: {out} ({len(picks)} шт.)")
    ok = bool(frames) and not stats.degrades and len(audio) == len(chunks)
    _say("✓ живое видео работает" if ok else "✗ живое видео не прошло проверку — см. строки выше")
    return 0 if ok else 1


async def main(args: argparse.Namespace) -> int:
    cfg = live_config.load()
    if cfg.vendor:
        # Лицо — то же, что партия дала бы первому столу (раскладка по персонажам).
        from dataclasses import replace
        from app.avatar.live.casting import face_for
        cfg = replace(cfg, avatar=face_for(cfg.vendor, "supplier", True, explicit=cfg.avatar, path=cfg.casting))
    _say(f"сервис: {cfg.vendor or '—'}; вход: {cfg.input}; лицо: {cfg.avatar or 'по умолчанию сервиса'}")
    _say(f"порог сторожа {cfg.stall_ms} мс; кадров/с {cfg.fps:g}; сторона кадра {cfg.size} px")
    for warning in cfg.warnings:
        _say(f"  ! {warning}")
    verdict = await live_config.startup_check(cfg)
    _say(f"итог настроек: {verdict}")
    _say(f"/api/health скажет: live_video = {live_config.describe(cfg)!r}")
    if live_config.active(cfg) is None:
        return 1
    if not args.session:
        _say("сессию не открывали (бесплатный режим). Живая проверка: --session")
        return 0
    if cfg.vendor != "stub":
        _say("! --session открывает настоящую сессию у сервиса: это ~0.5 минуты тарифа")
    return await _session(cfg, args.save)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--session", action="store_true", help="одна короткая настоящая сессия")
    ap.add_argument("--save", help="каталог для нескольких кадров JPEG")
    parsed = ap.parse_args()
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    from app.main import _load_dotenv  # noqa: F401  — тот же .env, что у шлюза
    sys.exit(asyncio.run(main(parsed)))
