"""live_video_probe.py — замер живой сессии LiveAvatar: числа, а не «подключилось».

Прибор гонит ПУТЬ ПРОДУКТА — адаптер `LiveVideoAvatar` и драйвер
`LiveAvatarDriver` — и подслушивает его, ничего не меняя в решениях:
каждый видеокадр сервиса (время прихода, метка WebRTC, сам кадр JPEG-ом),
каждый кусок звука, вернувшийся от сервиса, каждую отправку нашего PCM,
каждое событие сокета команд и каждое событие, ушедшее бы человеку.

Сценарий одной сессии (в секундах от подключения, ориентировочно):

1. подключение — холодный старт по этапам;
2. 3 с простоя — фон для «рот закрыт»;
3. фраза A и фраза B целиком — главный замер: от первого отправленного куска
   PCM до первого говорящего кадра, отставание кадров, липсинк;
4. фраза C при МОЛЧАЩЕМ видео (прибор перестаёт отдавать кадры адаптеру) —
   проверка сторожа молчания на настоящем потоке;
5. фраза A ещё раз, и посреди неё прибор рвёт комнату LiveKit — проверка
   возврата к портрету при обрыве; после этого адаптер закрывает сессию.

Сессия у сервиса ограничена `--max-session` секундами и останавливается
явно в конце; прибор дожидается запроса остановки и спрашивает сервис, как
сессия закончилась. Ключ читается из окружения (`NEGO_LIVE_VIDEO_KEY`) и не
пишется никуда.

    cd services/gateway && NEGO_LIVE_VIDEO=liveavatar NEGO_LIVE_VIDEO_KEY=… \\
      .venv/bin/python -m tools.live_video_probe --out /tmp/lv-probe/run1 \\
        --avatar <id> --phrases /tmp/lv-probe [--sandbox]
    .venv/bin/python -m tools.live_video_probe --analyze /tmp/lv-probe/run1
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import concurrent.futures
import dataclasses
import json
import os
import sys
import time
from pathlib import Path

import numpy as np

from app.avatar.live import config as live_config
from app.avatar.live.adapter import LiveVideoAvatar
from app.avatar.live.clock import LEAD_MS, STALE_MS
from app.avatar.live.driver import Persona
from app.avatar.live.media import encode_jpeg
from app.avatar.live.vendors import liveavatar

SR = 24000
CHUNK = 2400                # 100 мс нашего звука
FEED_GAP_S = 0.04           # синтез быстрее реального времени в 2.5 раза
SPEECH_RMS = 0.02
#: На время главного замера адаптер держит звук с запасом, чтобы ни один
#: кадр не пропал из-за нашей настройки; настройки продукта считаются потом.
CAPTURE_DELAY_MS = 2500
CAPTURE_STALL_MS = 8000


class Journal:
    def __init__(self, out: Path) -> None:
        self.out = out
        (out / "frames").mkdir(parents=True, exist_ok=True)
        self.t0 = time.monotonic()
        self.video: list[dict] = []
        self.audio_t: list[float] = []
        self.audio_n: list[int] = []
        self.audio: list[np.ndarray] = []
        self.audio_rate = 48000
        self.sends: list[dict] = []
        self.ws: list[dict] = []
        self.bus: list[dict] = []
        self.phases: list[dict] = []
        self.notes: list[str] = []
        self.pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        self.futures: list[concurrent.futures.Future] = []
        #: Кадры сохраняются на диск только в окнах речи (и немного простоя):
        #: сохранение каждого кадра само грузит цикл и портит замер.
        self.recording = True
        #: Опоздание цикла событий: (время, на сколько проспал) — отличить
        #: провал потока от собственной занятости процесса.
        self.loop_lag: list[tuple[float, float]] = []

    async def watch_loop(self) -> None:
        while True:
            before = time.monotonic()
            await asyncio.sleep(0.01)
            late = (time.monotonic() - before - 0.01) * 1000.0
            if late > 20:
                self.loop_lag.append((self.rel(), round(late, 1)))

    def rel(self, t: float | None = None) -> float:
        return round(((time.monotonic() if t is None else t) - self.t0) * 1000.0, 1)

    def note(self, text: str) -> None:
        line = f"{self.rel():9.1f} мс  {text}"
        self.notes.append(line)
        print(line, flush=True)

    def save_frame(self, idx: int, rgb: np.ndarray) -> None:
        def work():
            data = encode_jpeg(rgb, size=min(rgb.shape[0], rgb.shape[1]), quality=85)
            if data:
                (self.out / "frames" / f"{idx:05d}.jpg").write_bytes(data)
        self.futures.append(self.pool.submit(work))


class ProbeDriver(liveavatar.LiveAvatarDriver):
    """Тот же драйвер; подслушка на входах и выходах, решения не меняются."""

    journal: Journal
    #: «Видео замолчало»: кадры записываются, но адаптеру не отдаются.
    drop_video = False

    def _on_ws_event(self, event: dict) -> None:
        self.journal.ws.append({"t": self.journal.rel(), "event": event})

    def emit(self, event) -> None:
        # Кадр, которому драйвер поставил место в нашем звуке, — последний
        # подслушанный: цикл видео берёт следующий только после отправки этого.
        from app.avatar.live.driver import VideoFrame
        if isinstance(event, VideoFrame) and self.journal.video:
            self.journal.video[-1]["pts"] = round(event.pts_ms, 1)
            self.journal.video[-1]["gen"] = event.generation_id
        super().emit(event)

    async def _send(self, message: dict) -> None:
        entry = {"t": self.journal.rel(), "type": message.get("type")}
        if message.get("audio"):
            entry["samples"] = len(base64.b64decode(message["audio"])) // 2
        self.journal.sends.append(entry)
        await super()._send(message)

    async def _open(self):
        video, audio = await super()._open()
        return self._tap_video(video), self._tap_audio(audio)

    async def _tap_video(self, frames):
        async for event in frames:
            j = self.journal
            idx = len(j.video)
            j.video.append({"i": idx, "t": j.rel(), "ts": (event.timestamp_us / 1e6) if event.timestamp_us else None,
                            "w": event.frame.width, "h": event.frame.height, "dropped": self.drop_video,
                            "saved": j.recording})
            if j.recording:
                j.save_frame(idx, np.array(super()._video_rgb(event), copy=True))
            if not self.drop_video:
                yield event

    async def _tap_audio(self, frames):
        async for event in frames:
            j = self.journal
            mono, rate = self._audio_mono(event)
            j.audio_t.append(j.rel())
            j.audio_n.append(mono.size)
            j.audio.append(mono.copy())
            j.audio_rate = rate
            yield event


def _load_phrases(folder: Path) -> list[tuple[str, bytes]]:
    meta = json.loads((folder / "phrases.json").read_text(encoding="utf-8"))
    return [(m["text"], (folder / f"phrase{m['i']}.f32").read_bytes()) for m in meta]


async def _feed(avatar: LiveVideoAvatar, j: Journal, gen: str, pcm: bytes, label: str,
                on_chunk=None) -> dict:
    phase = {"label": label, "gen": gen, "feed_start": j.rel(), "seconds": len(pcm) / 4 / SR}
    await avatar.set_state("thinking")
    for k, i in enumerate(range(0, len(pcm), CHUNK * 4)):
        chunk = pcm[i:i + CHUNK * 4]
        avatar.audio_out({"type": "response.output.delta", "kind": "audio", "generation_id": gen,
                          "turn_id": 1, "audio": base64.b64encode(chunk).decode("ascii")})
        await avatar.speak(chunk, generation_id=gen)
        if on_chunk:
            await on_chunk(k)
        await asyncio.sleep(FEED_GAP_S)
    phase["feed_end"] = j.rel()
    await avatar.end_of_speech(gen)
    j.phases.append(phase)
    return phase


async def _played(avatar: LiveVideoAvatar, extra_s: float, limit_s: float = 30.0) -> None:
    deadline = time.monotonic() + limit_s
    while time.monotonic() < deadline:
        finished = avatar.clock.finished_at()
        if not avatar._held and (finished is None or time.monotonic() > finished + extra_s):
            return
        await asyncio.sleep(0.05)


async def run(args) -> int:
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    j = Journal(out)
    base_cfg = live_config.load()
    if base_cfg.vendor != "liveavatar" or not base_cfg.enabled:
        print(f"нужен NEGO_LIVE_VIDEO=liveavatar и ключ: {live_config.describe(base_cfg)}")
        return 2
    cfg = dataclasses.replace(base_cfg, avatar=args.avatar or base_cfg.avatar, sandbox=args.sandbox,
                              fps=30.0, max_failures=2, av_delay_ms=CAPTURE_DELAY_MS,
                              stall_ms=CAPTURE_STALL_MS)
    phrases = _load_phrases(Path(args.phrases))
    persona = Persona("supplier")
    drivers: list[ProbeDriver] = []

    def make():
        d = ProbeDriver(cfg, persona)
        d.journal = j
        d.max_session_s = args.max_session
        drivers.append(d)
        return d

    def publish(event: dict) -> None:
        entry = {"t": j.rel(), "type": event["type"]}
        if event["type"] == "avatar.frame":
            entry.update(gen=event["generation_id"], pts=event["pts_ms"])
        elif event.get("kind") == "audio":
            entry.update(gen=event["generation_id"], samples=len(base64.b64decode(event["audio"])) // 4)
        elif event["type"] == "avatar.state":
            entry.update(mode=event.get("lipsync_mode"), reason=event.get("reason"), detail=event.get("detail"))
            if event.get("reason"):
                j.note(f"лицо: {event.get('lipsync_mode')} ({event.get('reason')}: {event.get('detail')})")
        j.bus.append(entry)

    if args.expire or args.rotate:
        # Проверка конца сессии со стороны сервиса: без повторного подключения,
        # иначе адаптер честно открыл бы новую платную сессию. Плановая смена
        # сессии (`--rotate`) в счёт отказов не идёт и переподключается.
        cfg = dataclasses.replace(cfg, max_failures=1, av_delay_ms=1000,
                                  stall_ms=live_config.DEFAULT_STALL_MS)
    avatar = LiveVideoAvatar(persona, publish, make, cfg)
    j.note(f"старт: лицо {cfg.avatar or 'стоковое'}, песочница {cfg.sandbox}, потолок {args.max_session} с")
    watcher = asyncio.get_running_loop().create_task(j.watch_loop())
    avatar.start()
    result = 0
    try:
        deadline = time.monotonic() + 30
        while avatar.link in ("idle", "connecting") and time.monotonic() < deadline:
            await asyncio.sleep(0.02)
        j.note(f"связь: {avatar.link}")
        if avatar.link != "ready":
            return 1
        await asyncio.sleep(3.0)                        # простой: рот закрыт
        j.note(f"кадров простоя: {len(j.video)}")
        j.recording = False
        j.note(f"предел длины сессии из ответа start: {drivers[-1].session_limit_s} с")
        if args.rotate:
            n, rotated_at = 0, None
            stop_at = time.monotonic() + args.max_session + 40
            while time.monotonic() < stop_at:
                if avatar.link != "ready":
                    await asyncio.sleep(0.2)
                    if len(drivers) > 1 and rotated_at is None:
                        rotated_at = time.monotonic()
                        j.note(f"смена сессии: драйверов {len(drivers)}, связь {avatar.link}")
                    continue
                if rotated_at and time.monotonic() - rotated_at > 12:
                    break
                await avatar.set_state("listening")
                phase = await _feed(avatar, j, f"probe:rot{n}", phrases[n % len(phrases)][1],
                                    f"реплика {n}, сессия {len(drivers)}")
                await _played(avatar, 0.5)
                sent = sum(1 for b in j.bus if b["type"] == "avatar.frame" and b.get("gen") == phase["gen"])
                j.note(f"реплика {n} (сессия {len(drivers)}): кадров человеку {sent}, режим {avatar.mode}")
                n += 1
            j.note(f"итог: сессий {len(drivers)}, отказов {avatar.failures}, режим {avatar.mode}, "
                   f"связь {avatar.link}, события лица {[b.get('reason') for b in j.bus if b['type']=='avatar.state' and b.get('reason')]}")
            return 0
        if args.expire:
            n = 0
            limit = time.monotonic() + args.max_session + 20
            while avatar.link == "ready" and time.monotonic() < limit:
                phase = await _feed(avatar, j, f"probe:expire{n}", phrases[n % len(phrases)][1],
                                    f"реплика {n} до конца сессии")
                await _played(avatar, 0.5)
                n += 1
            j.note(f"сессия кончилась: связь {avatar.link}, режим {avatar.mode}, отказы {avatar.stats.degrades}")
            ws_end = [w for w in j.ws if w["event"].get("type") == "session.state_updated"]
            j.note(f"сокет команд: {[(w['t'], w['event'].get('state')) for w in ws_end]}")
            return 0

        lags0 = len(avatar.stats.frame_lag_ms)
        for n, (text, pcm) in enumerate(phrases[:2]):
            before = len(avatar.stats.frame_lag_ms)
            j.recording = True
            phase = await _feed(avatar, j, f"probe:{n}", pcm, f"фраза {n}")
            await _played(avatar, 1.5)
            j.recording = False
            phase["lags"] = avatar.stats.frame_lag_ms[before:]
            j.note(f"фраза {n}: кадров с местом в звуке {len(phase['lags'])}")
            await avatar.set_state("listening")
            await asyncio.sleep(1.0)
        _ = lags0

        # Сторож молчания на настоящем потоке: видео «замолкает», звук идёт.
        avatar._av_delay_s = liveavatar.AV_DELAY_MS / 1000.0
        avatar._cfg = dataclasses.replace(avatar._cfg, stall_ms=live_config.DEFAULT_STALL_MS)
        drivers[-1].drop_video = True
        degrades_before = len(avatar.stats.degrades)
        phase = await _feed(avatar, j, "probe:silent", phrases[2][1], "фраза 2 при молчащем видео")
        await _played(avatar, 1.0)
        phase["degraded"] = avatar.stats.degrades[degrades_before:]
        drivers[-1].drop_video = False
        await avatar.set_state("listening")                 # связь жива — видео возвращается
        phase["recovered_mode"] = avatar.mode
        j.note(f"после молчащего видео: отказы {phase['degraded']}, режим сейчас {avatar.mode}")
        await asyncio.sleep(1.0)

        # Обрыв посреди реплики: рвём комнату LiveKit.
        async def cut(k: int) -> None:
            if k == 12 and drivers[-1]._room is not None:
                j.note("рвём комнату LiveKit посреди реплики")
                await drivers[-1]._room.disconnect()
        phase = await _feed(avatar, j, "probe:cut", phrases[0][1], "обрыв посреди фразы 0", on_chunk=cut)
        await _played(avatar, 1.0)
        phase["degraded"] = avatar.stats.degrades[degrades_before:]
        phase["mode_after"] = avatar.mode
        phase["link_after"] = avatar.link
        j.note(f"после обрыва: режим {avatar.mode}, связь {avatar.link}")
    finally:
        watcher.cancel()
        await avatar.close()
        if liveavatar._STOPPING:
            await asyncio.gather(*liveavatar._STOPPING, return_exceptions=True)
        for f in j.futures:
            f.result()
        j.note("сессия закрыта")
        sessions = await _verify_sessions([d.closed_session_id or d.session_id for d in drivers], cfg.key)
        for line in sessions:
            j.note(f"сервис о сессии: {line}")
        stats = dataclasses.asdict(avatar.stats)
        audio = np.concatenate(j.audio) if j.audio else np.zeros(0, np.float32)
        np.savez_compressed(out / "returned_audio.npz", samples=audio, t=np.array(j.audio_t),
                            n=np.array(j.audio_n), rate=j.audio_rate)
        (out / "probe.json").write_text(json.dumps({
            "avatar": cfg.avatar, "sandbox": cfg.sandbox, "quality": liveavatar.QUALITY,
            "marks": [{k: j.rel(v) for k, v in d.marks.items()} for d in drivers],
            "video": j.video, "sends": j.sends, "ws": j.ws, "bus": j.bus, "phases": j.phases,
            "stats": stats, "notes": j.notes, "phrases": [p[0] for p in phrases],
            "phrases_dir": str(Path(args.phrases)), "loop_lag": j.loop_lag,
            "product_delay_ms": liveavatar.AV_DELAY_MS, "sessions": len(drivers),
        }, ensure_ascii=False, indent=1, default=str))
        print(f"журнал: {out}/probe.json; кадров сохранено: {len(j.video)}")
    return result


async def _verify_sessions(ids: list, key: str) -> list[str]:
    """Спросить сервис, как закончилась каждая сессия, и сколько кредитов осталось."""
    import httpx
    lines = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            for sid in [i for i in ids if i]:
                r = await client.get(f"{liveavatar.API}/v1/sessions/{sid}", headers={"X-API-KEY": key})
                data = (r.json() or {}).get("data") or {} if r.status_code < 400 else {}
                lines.append(f"{r.status_code} " + json.dumps({k: data.get(k) for k in
                             ("status", "start_at", "end_at", "end_reason", "duration", "credits_used")
                             if k in data}, ensure_ascii=False))
            r = await client.get(f"{liveavatar.API}/v1/users/credits", headers={"X-API-KEY": key})
            lines.append("кредитов осталось: " + str(((r.json() or {}).get("data") or {}).get("credits_left")))
    except Exception as exc:
        lines.append(f"проверка не удалась: {type(exc).__name__}")
    return lines


# ------------------------------------------------------------------ разбор

def _pct(values, q):
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, int(q * (len(ordered) - 1) + 0.5))], 1)


def _saved(video: list[dict]) -> list[dict]:
    return [v for v in video if v.get("saved", True)]


def _mouth_series(folder: Path, video: list[dict]) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """Открытость рта по кадрам: разброс яркости в области рта.

    Область рта не задаётся руками: это место кадра, где яркость меняется во
    время речи заметно сильнее, чем в простое.
    """
    from PIL import Image
    gray = []
    for v in video:
        path = folder / "frames" / f"{v['i']:05d}.jpg"
        img = Image.open(path).convert("L").resize((120, 120))
        gray.append(np.asarray(img, dtype=np.float32))
    stack = np.stack(gray)
    return stack, (0, 0, 0, 0)


def analyze(folder: Path) -> dict:
    data = json.loads((folder / "probe.json").read_text(encoding="utf-8"))
    aud = np.load(folder / "returned_audio.npz")
    all_video = data["video"]
    video = _saved(all_video)
    marks = data["marks"][0] if data["marks"] else {}
    report: dict = {"avatar": data["avatar"], "sandbox": data["sandbox"], "quality": data["quality"]}

    # 1. Холодный старт.
    t_req = marks.get("token_request")
    first_frame = video[0]["t"] if video else None
    first_frame = all_video[0]["t"] if all_video else None
    report["cold_start_ms"] = {
        stage: round(marks[stage] - t_req, 1) for stage in
        ("token", "started", "ws_open", "ws_connected", "room", "tracks") if stage in marks and t_req is not None}
    if first_frame is not None and t_req is not None:
        report["cold_start_ms"]["first_video_frame"] = round(first_frame - t_req, 1)
    if video:
        report["video_size"] = f"{video[0]['w']}x{video[0]['h']}"

    # Звук, вернувшийся от сервиса: огибающая по 10 мс на часах прихода.
    samples, t_arr, counts, rate = aud["samples"], aud["t"], aud["n"], int(aud["rate"])
    env_t, env_v = [], []
    pos = 0
    for t, n in zip(t_arr, counts):
        chunk = samples[pos:pos + n]
        pos += n
        step = max(1, rate // 100)
        for k in range(0, n, step):
            w = chunk[k:k + step]
            env_t.append(t - (n - k) / rate * 1000.0)
            env_v.append(float(np.sqrt(np.mean(w.astype(np.float64) ** 2))) if w.size else 0.0)
    env_t, env_v = np.array(env_t), np.array(env_v)

    # Рот: область, где яркость меняется в речи сильнее, чем в простое.
    stack, _ = _mouth_series(folder, video)
    vt = np.array([v["t"] for v in video])
    idle = vt < (data["phases"][0]["feed_start"] if data["phases"] else vt.max())
    speech_mask = np.zeros(len(video), bool)
    for ph in data["phases"][:2]:
        speech_mask |= (vt > ph["feed_start"]) & (vt < ph["feed_end"] + ph["seconds"] * 1000 + 3000)
    diff = np.abs(np.diff(stack, axis=0))
    act_speech = diff[speech_mask[1:]].mean(axis=0) if speech_mask[1:].any() else diff.mean(axis=0)
    act_idle = diff[idle[1:]].mean(axis=0) if idle[1:].any() else np.zeros_like(act_speech)
    gain = act_speech - act_idle
    k = 9
    pad = np.pad(gain, k // 2, mode="edge")
    smooth = np.zeros_like(gain)
    for dy in range(k):
        for dx in range(k):
            smooth += pad[dy:dy + gain.shape[0], dx:dx + gain.shape[1]]
    cy, cx = np.unravel_index(np.argmax(smooth), smooth.shape)
    y0, y1, x0, x1 = max(0, cy - 6), min(120, cy + 7), max(0, cx - 10), min(120, cx + 11)
    mouth = np.array([float(np.std(f[y0:y1, x0:x1])) for f in stack])
    # Начало речи на видео — по ДВИЖЕНИЮ рта (разница соседних кадров в
    # области рта), а не по его открытости: у части лиц простой — это улыбка
    # с зубами, и открытость в простое скачет не меньше, чем в речи.
    motion = np.concatenate([[0.0], np.abs(np.diff(stack[:, y0:y1, x0:x1], axis=0)).mean(axis=(1, 2))])
    idle_motion = motion[idle][1:] if idle.sum() > 2 else motion[:20]
    motion_thr = float(np.percentile(idle_motion, 99)) if idle_motion.size else float(np.median(motion)) * 2
    report["mouth_roi_120"] = [int(y0), int(y1), int(x0), int(x1)]
    report["mouth_idle"] = {"motion_p99": round(float(np.percentile(idle_motion, 99)), 2) if idle_motion.size else None,
                            "threshold": round(motion_thr, 2)}

    speak_started = [w["t"] for w in data["ws"] if w["event"].get("type") == "agent.speak_started"]
    phases_out = []
    for ph in data["phases"]:
        sends = [s for s in data["sends"] if s["type"] == "agent.speak" and s["t"] >= ph["feed_start"]]
        first_send = sends[0]["t"] if sends else None
        row = {"label": ph["label"], "seconds": round(ph["seconds"], 2)}
        if first_send is None:
            phases_out.append(row)
            continue
        row["first_pcm_after_feed_ms"] = round(first_send - ph["feed_start"], 1)
        ss = [t for t in speak_started if t >= first_send]
        if ss:
            row["speak_started_event_ms"] = round(ss[0] - first_send, 1)
        loud = np.flatnonzero((env_t >= first_send) & (env_v >= SPEECH_RMS))
        if loud.size:
            row["returned_audio_onset_ms"] = round(float(env_t[loud[0]]) - first_send, 1)
        after = np.flatnonzero(vt >= first_send)
        onset = None
        for a in after[:-2]:
            # Три кадра подряд с движением выше простоя — рот заговорил.
            if motion[a] > motion_thr and motion[a + 1] > motion_thr and motion[a + 2] > motion_thr:
                onset = a
                break
        if onset is not None:
            row["first_moving_mouth_frame_ms"] = round(vt[onset] - first_send, 1)
            row["first_moving_mouth_frame"] = int(video[onset]["i"])
        pub = [b["t"] for b in data["bus"] if b["type"] == "avatar.frame" and b.get("gen") == ph["gen"]]
        if pub:
            row["first_frame_to_client_ms"] = round(pub[0] - first_send, 1)
        lags = ph.get("lags") or []
        if lags:
            row["frame_lag_ms"] = {"n": len(lags), "p50": _pct(lags, .5), "p95": _pct(lags, .95),
                                   "max": round(max(lags), 1)}
            shares = {}
            for d in (0, data["product_delay_ms"], 1000, 1500, 2000):
                age = np.array(lags) - LEAD_MS - d
                shares[str(d)] = {"dropped_over_250": round(float(np.mean(age > STALE_MS)) * 100, 1),
                                  "shown_late": round(float(np.mean((age > 0) & (age <= STALE_MS))) * 100, 1),
                                  "on_time": round(float(np.mean(age <= 0)) * 100, 1)}
            row["share_by_hold_ms"] = shares
        for key in ("degraded", "recovered_mode", "mode_after", "link_after"):
            if key in ph:
                row[key] = ph[key]
        phases_out.append(row)
    report["phases"] = phases_out

    # Устойчивость потока.
    report["ws_types"] = {}
    for w in data["ws"]:
        report["ws_types"][w["event"].get("type")] = report["ws_types"].get(w["event"].get("type"), 0) + 1
    report["ws_problems"] = [w["event"] for w in data["ws"] if w["event"].get("type") in ("error", "warning")][:10]
    report["degrades"] = data["stats"]["degrades"]
    report["adapter"] = {k: data["stats"][k] for k in ("frames_in", "frames_sent", "frames_late", "frames_thinned",
                                                       "frames_foreign", "frames_invalid", "audio_held", "audio_direct")}

    # Сдвиг губ против звука: корреляция открытости рта и огибающей
    # вернувшегося звука (оба на часах прихода), по главным фразам.
    if env_t.size and len(vt) > 10:
        grid = np.arange(max(vt[0], env_t[0]), min(vt[-1], env_t[-1]), 10.0)
        m_i = np.interp(grid, vt, mouth)
        a_i = np.interp(grid, env_t, env_v)
        sel = np.zeros_like(grid, bool)
        for ph in data["phases"][:2]:
            sel |= (grid > ph["feed_start"]) & (grid < ph["feed_end"] + ph["seconds"] * 1000 + 3000)
        m_s = (m_i[sel] - m_i[sel].mean()) / (m_i[sel].std() or 1)
        a_s = (a_i[sel] - a_i[sel].mean()) / (a_i[sel].std() or 1)
        best = None
        for lag in range(-40, 41):          # ±400 мс шагом 10 мс
            if lag >= 0:
                c = float(np.mean(m_s[lag:] * a_s[:a_s.size - lag]))
            else:
                c = float(np.mean(m_s[:lag] * a_s[-lag:]))
            if best is None or c > best[1]:
                best = (lag * 10, c)
        report["mouth_vs_returned_audio"] = {"video_later_by_ms": best[0], "corr": round(best[1], 3)}
    # Сдвиг губ против НАШЕГО звука так, как его покажет клиент: кадр стоит
    # на месте, которое ему дал драйвер (pts), звук — на своём месте в фразе.
    phrases_dir = Path(data.get("phrases_dir") or "/tmp/lv-probe")
    shown = []
    for n, ph in enumerate(data["phases"][:2]):
        idx = [v for v in video if v.get("gen") == ph["gen"] and v.get("pts") is not None]
        pcm_path = phrases_dir / f"phrase{n}.f32"
        if len(idx) < 20 or not pcm_path.exists():
            continue
        ours = np.frombuffer(pcm_path.read_bytes(), dtype="<f4")
        env = np.array([float(np.sqrt(np.mean(ours[k:k + 240].astype(np.float64) ** 2)))
                        for k in range(0, ours.size, 240)])          # 10 мс
        env_ms = np.arange(env.size) * 10.0
        pos = {v["i"]: k for k, v in enumerate(video)}
        idx = [v for v in idx if v["i"] in pos]
        if len(idx) < 20:
            continue
        pts = np.array([v["pts"] for v in idx])
        mo = np.array([mouth[pos[v["i"]]] for v in idx])
        grid = np.arange(max(pts[0], 0), min(pts[-1], env_ms[-1]), 10.0)
        if grid.size < 50:
            continue
        m_i = np.interp(grid, pts, mo)
        best = None
        for lag in range(-40, 41):
            a_i = np.interp(grid + lag * 10, env_ms, env)
            c = float(np.corrcoef(m_i, a_i)[0, 1])
            if best is None or c > best[1]:
                best = (lag * 10, c)
        shown.append({"phrase": n, "frames": len(idx), "lips_lead_voice_ms": best[0], "corr": round(best[1], 3)})
    report["shown_sync_vs_our_voice"] = shown

    # Провалы видео: по часам ОТПРАВИТЕЛЯ (сервис не нарисовал) и по часам
    # прихода к нам (сеть или собственная занятость процесса).
    at = np.array([v["t"] for v in all_video])
    sts = np.array([v["ts"] if v["ts"] is not None else np.nan for v in all_video]) * 1000.0
    arr_gaps, src_gaps = np.diff(at), np.diff(sts)
    report["video_stream"] = {
        "frames": len(all_video),
        "sender_step_ms_p50": round(float(np.nanmedian(src_gaps)), 1) if src_gaps.size else None,
        "sender_gaps_over_200ms": [{"at_ms": round(float(at[a]), 1), "gap_ms": round(float(src_gaps[a]), 1)}
                                   for a in np.flatnonzero(src_gaps > 200)],
        "arrival_gaps_over_200ms": int(np.sum(arr_gaps > 200)),
        "arrival_gap_max_ms": round(float(arr_gaps.max()), 1) if arr_gaps.size else None,
    }
    lag = data.get("loop_lag") or []
    report["event_loop_stalls_over_20ms"] = {"count": len(lag), "max_ms": max([x[1] for x in lag], default=0)}
    near = 0
    for a in np.flatnonzero(arr_gaps > 200):
        if any(abs(t - at[a + 1]) < 300 and ms > 100 for t, ms in lag):
            near += 1
    report["arrival_gaps_explained_by_our_loop"] = near
    (folder / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    np.save(folder / "mouth.npy", mouth)
    return report


def contact_sheet(folder: Path, phase_index: int, seconds: float = 3.2, cols: int = 10) -> Path:
    """Кадры рта подряд с огибающей звука под каждым — посмотреть глазами."""
    from PIL import Image, ImageDraw
    data = json.loads((folder / "probe.json").read_text(encoding="utf-8"))
    report = json.loads((folder / "report.json").read_text(encoding="utf-8"))
    video = data["video"]
    ph_raw = data["phases"][phase_index]
    sends = [x["t"] for x in data["sends"] if x["type"] == "agent.speak" and x["t"] >= ph_raw["feed_start"]]
    if not sends:
        raise SystemExit("в этой фазе PCM не отправлялся")
    y0, y1, x0, x1 = report["mouth_roi_120"]
    # Отсчёт — от первого отправленного куска PCM: подпись кадра = сколько
    # прошло от него до прихода кадра к нам.
    first = {"t": sends[0]}
    picks = [v for v in _saved(video) if first["t"] + 300 <= v["t"] <= first["t"] + 300 + seconds * 1000]
    aud = np.load(folder / "returned_audio.npz")
    samples, t_arr, counts, rate = aud["samples"], aud["t"], aud["n"], int(aud["rate"])
    starts = np.array(t_arr) - np.array(counts) / rate * 1000.0
    offsets = np.concatenate([[0], np.cumsum(counts)[:-1]])
    cell_w, cell_h = 160, 150
    rows = -(-len(picks) // cols)
    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    for n, v in enumerate(picks):
        img = Image.open(folder / "frames" / f"{v['i']:05d}.jpg").convert("RGB")
        w, h = img.size
        box = (int(x0 * w / 120) - 20, int(y0 * h / 120) - 25, int(x1 * w / 120) + 20, int(y1 * h / 120) + 25)
        crop = img.crop(box).resize((cell_w, 110))
        cx, cy = (n % cols) * cell_w, (n // cols) * cell_h
        sheet.paste(crop, (cx, cy))
        # Громкость вернувшегося звука в окне этого кадра (40 мс).
        k = int(np.searchsorted(starts, v["t"]) - 1)
        level = 0.0
        if 0 <= k < len(counts):
            into = int((v["t"] - starts[k]) / 1000 * rate)
            seg = samples[offsets[k] + max(0, into - int(0.02 * rate)): offsets[k] + into + int(0.02 * rate)]
            level = float(np.sqrt(np.mean(seg.astype(np.float64) ** 2))) if seg.size else 0.0
        draw.rectangle((cx + 4, cy + 114, cx + 4 + int(min(level * 6, 1) * 150), cy + 124), fill=(220, 60, 60))
        draw.text((cx + 4, cy + 128), f"{int(v['t'] - first['t']):+5d} мс", fill=(0, 0, 0))
    path = folder / f"sheet-phase{phase_index}.png"
    sheet.save(path)
    return path


def export_video(folder: Path, phase_index: int, offset_ms: float = 0.0) -> Path:
    """MP4 «как покажет продукт»: кадр — по месту, которое ему дал драйвер,
    и по правилу клиента (последний кадр не старше 250 мс, иначе прежний);
    звук — наша фраза с нуля. Смотреть глазами и слушать."""
    import av
    from PIL import Image
    data = json.loads((folder / "probe.json").read_text(encoding="utf-8"))
    ph = data["phases"][phase_index]
    frames = sorted((v["pts"] + offset_ms, v["i"]) for v in data["video"]
                    if v.get("gen") == ph["gen"] and v.get("pts") is not None and v.get("saved", True))
    pcm = np.frombuffer((Path(data.get("phrases_dir") or "/tmp/lv-probe") / f"phrase{phase_index}.f32").read_bytes(),
                        dtype="<f4")
    out = folder / f"shown-phase{phase_index}{'' if not offset_ms else f'-offset{int(offset_ms):+d}'}.mp4"
    box = av.open(str(out), "w")
    vs = box.add_stream("libx264", rate=25)
    vs.width = vs.height = 480
    vs.pix_fmt = "yuv420p"
    aus = box.add_stream("aac", rate=SR)
    aus.layout = "mono"
    cache: dict[int, np.ndarray] = {}

    def image(i: int) -> np.ndarray:
        if i not in cache:
            cache[i] = np.asarray(Image.open(folder / "frames" / f"{i:05d}.jpg").convert("RGB").resize((480, 480)))
        return cache[i]

    shown = frames[0][1] if frames else None
    k = 0
    for n in range(int(len(pcm) / SR * 25) + 10):
        t = n * 40.0
        while k < len(frames) and frames[k][0] <= t:
            k += 1
        if k and t - frames[k - 1][0] < STALE_MS:
            shown = frames[k - 1][1]
        if shown is None:
            continue
        frame = av.VideoFrame.from_ndarray(image(shown), format="rgb24")
        frame.pts = n
        for packet in vs.encode(frame):
            box.mux(packet)
    for packet in vs.encode():
        box.mux(packet)
    step = 1024
    for n, i in enumerate(range(0, len(pcm), step)):
        chunk = pcm[i:i + step]
        if chunk.size < step:
            chunk = np.pad(chunk, (0, step - chunk.size))
        af = av.AudioFrame.from_ndarray(chunk.reshape(1, -1).astype(np.float32), format="fltp", layout="mono")
        af.sample_rate = SR
        af.pts = i
        for packet in aus.encode(af):
            box.mux(packet)
    for packet in aus.encode():
        box.mux(packet)
    box.close()
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out")
    ap.add_argument("--avatar", default="")
    ap.add_argument("--phrases", default="/tmp/lv-probe")
    ap.add_argument("--sandbox", action="store_true")
    ap.add_argument("--max-session", type=int, default=100)
    ap.add_argument("--rotate", action="store_true",
                    help="говорить через плановую смену сессии у предела --max-session")
    ap.add_argument("--expire", action="store_true",
                    help="говорить, пока сервис сам не закроет сессию по потолку --max-session")
    ap.add_argument("--analyze")
    ap.add_argument("--sheet", type=int, action="append")
    ap.add_argument("--video", type=int, action="append", help="MP4 «как покажет продукт» для фразы N")
    ap.add_argument("--offset", type=float, default=0.0, help="сдвиг кадров для --video, мс")
    parsed = ap.parse_args()
    if parsed.analyze:
        rep = analyze(Path(parsed.analyze))
        print(json.dumps(rep, ensure_ascii=False, indent=1))
        for idx in parsed.sheet or []:
            print(contact_sheet(Path(parsed.analyze), idx))
        for idx in parsed.video or []:
            print(export_video(Path(parsed.analyze), idx, parsed.offset))
        sys.exit(0)
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    sys.exit(asyncio.run(run(parsed)))
