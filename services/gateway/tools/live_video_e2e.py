"""live_video_e2e.py — совпадают ли губы с голосом у ЧЕЛОВЕКА, путь продукта целиком.

Клиент `/v1/realtime`, как браузер: открывает тренировку со слоями голоса и
лица, делает несколько ходов текстом и записывает всё, что приходит, со
временем прихода. Ходы проходят настоящий оркестратор, синтез и живое видео —
ничего не подменено. По записи прибор повторяет расписание проигрывателя
браузера (`AudioPlayer`: джиттер-буфер 160 мс, встык, `holdOnEnd` у живого
видео) и отвечает на два вопроса:

1. **Сколько кадров речи пришло раньше своего звука** — такой кадр клиент
   покажет ровно тогда, когда его звук зазвучит («в такт»). Пришёл позже, но в
   пределах порога — показан с губами позади голоса; позже порога — не показан.
2. **Что видит человек, пока звучит реплика** — каждые 10 мс звука: кадр речи
   не дальше одного шага кадра от звучащего звука («губы в такт»), кадр
   постарше (губы запаздывают) или кадра речи нет вовсе (лицо в простое).

    cd services/gateway && .venv/bin/python -m tools.live_video_e2e --url http://127.0.0.1:8010 \\
        --turns 8 --out /tmp/lv-e2e/run.json

Шлюз поднимается отдельно, с ключом в окружении (не в командной строке этого
прибора: он ключа не знает вовсе).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

import numpy as np

LEAD_S = 0.160
SR = 24000
TURNS = [
    "Добрый день! Что для вас важнее всего в этой поставке, кроме цены?",
    "Понимаю. Расскажите, пожалуйста, как устроены ваши сроки поставки.",
    "По рыночным данным медиана независимых прайсов — восемьдесят семь.",
    "Если мы подпишем годовой контракт, сможете ли вы снизить цену?",
    "Давайте обсудим объёмы: сколько вам удобно отгружать в месяц?",
    "Что для вас значит надёжный партнёр? Приведите пример.",
    "Предлагаю восемьдесят пять при предоплате тридцать процентов.",
    "Хорошо, какие условия оплаты вам подходят больше всего?",
    "Спасибо за открытость. Что ещё важно учесть в договоре?",
    "Если сроки сдвинутся, как вы предлагаете это компенсировать?",
]


def _samples(b64: str) -> int:
    return (len(b64) * 3 // 4 - (2 if b64.endswith("==") else 1 if b64.endswith("=") else 0)) // 4


def _loud_mask(b64: str) -> str:
    """Окна по 10 мс: «1» — голос слышен (порог речи драйвера), «0» — тишина."""
    import base64
    from app.avatar.live.vendors._anchor import SPEECH_RMS
    raw = base64.b64decode(b64)
    x = np.frombuffer(raw[: len(raw) - len(raw) % 4], dtype="<f4").astype(np.float64)
    step = SR // 100
    n = x.size // step
    if n == 0:
        return ""
    rms = np.sqrt((x[: n * step].reshape(n, step) ** 2).mean(axis=1))
    return "".join("1" if v >= SPEECH_RMS else "0" for v in rms)


def _play_end(chunks: list) -> float:
    """Когда у клиента доиграет звук: в тишину — через 160 мс, дальше встык."""
    end = None
    for t, e in chunks:
        dur = (e["samples"] if "samples" in e else _samples(e["audio"])) / SR
        end = end + dur if end is not None and t <= end else t + LEAD_S + dur
    return end or 0.0


async def run(url: str, turns: int, scenario: str) -> dict:
    import websockets
    log: list[tuple[float, dict]] = []
    t0 = time.monotonic()
    ws_url = url.replace("http://", "ws://").replace("https://", "wss://") + "/v1/realtime"
    async with websockets.connect(ws_url, open_timeout=15, max_size=2 ** 24) as ws:
        await ws.send(json.dumps({"type": "session.init", "payload": {
            "mode": "text", "scenarioId": scenario, "lang": "ru", "gameMode": "practice",
            "layers": {"voice": True, "avatar": True}}}))

        async def recv(until, timeout):
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=max(0.05, deadline - time.monotonic()))
                except asyncio.TimeoutError:
                    return False
                event = json.loads(raw)
                log.append((time.monotonic() - t0, event))
                if until(event):
                    return True
            return False

        created = await recv(lambda e: e.get("type") == "session.created", 30)
        if not created:
            raise SystemExit("session.created не пришёл")
        caps = next(e for _, e in log if e.get("type") == "session.created")["capabilities"]
        # Лицо сервиса подключается в фоне: ждём первый кадр простоя.
        await recv(lambda e: e.get("type") == "avatar.frame" and e.get("idle"), 25)
        await recv(lambda e: False, 1.5)
        for n in range(turns):
            await ws.send(json.dumps({"type": "input.append", "input": {"text": TURNS[n % len(TURNS)]}}))
            await ws.send(json.dumps({"type": "input.commit"}))
            await recv(lambda e: e.get("type") == "response.done", 40)
            done = next(e for _, e in reversed(log) if e.get("type") == "response.done")
            gen = done.get("generation_id")

            def audio(e):
                return e.get("type") == "response.output.delta" and e.get("kind") == "audio" \
                    and e.get("generation_id") == gen
            # Синтез начинает звучать секунды спустя после `done` (edge — медиана
            # 2.3 с до первого звука, плюс удержание): новый ход раньше погасил
            # бы реплику. Ждём первый звук, а потом — пока он ДОИГРАЕТ у
            # клиента: звук приходит пачкой быстрее, чем звучит, и тишина в
            # сокете ещё не значит тишину в динамике. Человек отвечает, дослушав.
            if not any(audio(e) for _, e in log):
                await recv(audio, 20)
            while True:
                ends = _play_end([(t, e) for t, e in log if audio(e)])
                wait = ends + 1.0 - (time.monotonic() - t0)
                if wait <= 0:
                    break
                await recv(audio, wait)
            if any(e.get("type") == "debrief" for _, e in log):
                break
        await ws.send(json.dumps({"type": "session.close"}))
        await recv(lambda e: e.get("type") == "session.closed", 5)
    return {"caps": caps, "log": log}


def analyze(caps: dict, log: list) -> dict:
    avatar = caps.get("avatar") or {}
    stale = (avatar.get("stale_ms") or 250) / 1000.0
    hold_on_end = isinstance(avatar.get("stale_ms"), (int, float))
    replies: dict[str, dict] = {}
    for t, e in log:
        kind = e.get("type")
        gen = e.get("generation_id") or ""
        if kind == "response.output.delta" and e.get("kind") == "audio":
            n = e["samples"] if "samples" in e else _samples(e["audio"])
            # Записи до маски громкости хранят только длину — там всё «слышно».
            mask = e.get("loud") if "audio" not in e else _loud_mask(e["audio"])
            replies.setdefault(gen, {"audio": [], "frames": [], "done": None})["audio"].append((t, n, mask))
        elif kind == "avatar.frame" and not e.get("idle") and gen:
            replies.setdefault(gen, {"audio": [], "frames": [], "done": None})["frames"].append((t, float(e["pts_ms"])))
        elif kind == "response.done" and gen:
            replies.setdefault(gen, {"audio": [], "frames": [], "done": None})["done"] = t
    rows = []
    totals = {"frames": 0, "in_sync": 0, "shown_late": 0, "hidden": 0, "no_audio": 0,
              "ticks": 0, "lips_in_step": 0, "lips_behind": 0, "no_speech_frame": 0}
    step = None
    margins: list[float] = []
    all_gaps: list[float] = []
    for gen, r in replies.items():
        if not r["audio"]:
            continue
        # Расписание проигрывателя: в тишину — через 160 мс, встык — за предыдущим.
        segs, pts0, end = [], 0.0, None
        masks = []
        for t, n, mask in r["audio"]:
            masks.append((pts0, mask))
            dur = n / SR
            if end is not None and t <= end:
                segs.append((pts0, pts0 + dur * 1000, end)); end += dur
            else:
                start = t + LEAD_S
                if not hold_on_end and r["done"] is not None and t <= r["done"] < start:
                    start = r["done"]            # досрочный старт по концу реплики
                segs.append((pts0, pts0 + dur * 1000, start)); end = start + dur
            pts0 += dur * 1000

        def play_time(pts):
            for a, b, s in segs:
                if a <= pts < b:
                    return s + (pts - a) / 1000.0
            return None

        frames = sorted(r["frames"], key=lambda x: x[1])
        if len(frames) > 1:
            gaps = [b[1] - a[1] for a, b in zip(frames, frames[1:]) if b[1] > a[1]]
            if gaps:
                step = min(step or 1e9, sorted(gaps)[len(gaps) // 2])
                all_gaps.extend(gaps)
        row = {"gen": gen[-6:], "audio_s": round(pts0 / 1000, 2), "frames": len(frames),
               "in_sync": 0, "shown_late": 0, "hidden": 0, "no_audio": 0}
        for arrival, pts in frames:
            at = play_time(pts)
            if at is None:
                row["no_audio"] += 1
                continue
            # Запас: насколько раньше своего звука пришёл кадр (минус — опоздал).
            margins.append((at - arrival) * 1000.0)
            if arrival <= at:
                row["in_sync"] += 1
            elif arrival - at <= stale:
                row["shown_late"] += 1
            else:
                row["hidden"] += 1
        # Что видит человек: каждые 10 мс, пока голос СЛЫШЕН. В тишине перед
        # фразой и после неё лицо в простое — это правильно, не провал губ.
        frame_step = (step or 40.0) / 1000.0

        def loud(p):
            if any(mask is None for _, mask in masks):
                return True
            for a0, mask in reversed(masks):
                if p >= a0:
                    i = int((p - a0) // 10)
                    return i < len(mask) and mask[i] == "1"
            return False
        for a, b, s in segs:
            p = a - 10.0
            while True:
                p += 10.0
                if p >= b:
                    break
                if not loud(p):
                    continue
                wall = s + (p - a) / 1000.0
                shown = [pts for arr, pts in frames if arr <= wall and pts <= p]
                totals["ticks"] += 1
                if not shown or (p - max(shown)) / 1000.0 >= stale:
                    totals["no_speech_frame"] += 1
                elif (p - max(shown)) / 1000.0 <= frame_step + 1e-6:
                    totals["lips_in_step"] += 1
                else:
                    totals["lips_behind"] += 1
        for k in ("frames", "in_sync", "shown_late", "hidden", "no_audio"):
            totals[k] += row[k] if k != "frames" else len(frames)
        rows.append(row)
    counted = totals["in_sync"] + totals["shown_late"] + totals["hidden"]
    ticks = max(1, totals["ticks"])
    ordered = sorted(margins)

    def q(p):
        return round(ordered[min(len(ordered) - 1, int(p * (len(ordered) - 1) + 0.5))]) if ordered else None
    return {
        "stale_ms": round(stale * 1000), "hold_on_end": hold_on_end,
        "frame_step_ms": step, "replies": rows, "totals": totals,
        "share_frames_in_sync": round(totals["in_sync"] / max(1, counted) * 100, 1),
        "share_time_lips_within_one_frame": round(totals["lips_in_step"] / ticks * 100, 1),
        "share_time_lips_behind": round(totals["lips_behind"] / ticks * 100, 1),
        "share_time_no_speech_frame": round(totals["no_speech_frame"] / ticks * 100, 1),
        # Худшие запасы: удержание, увеличенное на -min, ставит в такт все кадры.
        "margin_ms": {"min": q(0.0), "p01": q(0.01), "p05": q(0.05), "p50": q(0.5), "max": q(1.0)},
        # Промежутки между соседними кадрами речи: ≈1 шаг — поток цел, ≈2 — кадр пропал.
        "frame_gaps": {"one_step": sum(1 for g in all_gaps if g < 1.5 * (step or 40.0)),
                       "two_steps": sum(1 for g in all_gaps if 1.5 * (step or 40.0) <= g < 2.5 * (step or 40.0)),
                       "longer": sum(1 for g in all_gaps if g >= 2.5 * (step or 40.0))},
        "replies_cancelled": sum(1 for _, e in log if e.get("type") == "generation.cancelled"),
        "idle_frames": sum(1 for _, e in log if e.get("type") == "avatar.frame" and e.get("idle")),
        "face_events": [(round(t, 2), e.get("lipsync_mode"), e.get("reason"), e.get("detail"))
                        for t, e in log if e.get("type") == "avatar.state" and e.get("reason")],
    }


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--url", default="http://127.0.0.1:8010")
    ap.add_argument("--turns", type=int, default=8)
    ap.add_argument("--scenario", default="supplier")
    ap.add_argument("--out", required=True)
    ap.add_argument("--analyze", action="store_true", help="только разобрать сохранённую запись")
    args = ap.parse_args(argv)
    out = Path(args.out)
    if args.analyze:
        data = json.loads(out.read_text(encoding="utf-8"))
    else:
        data = asyncio.run(run(args.url, args.turns, args.scenario))
        out.parent.mkdir(parents=True, exist_ok=True)
        # Картинки и звук в запись не идут — только их размер и длина.
        slim = []
        for t, e in data["log"]:
            e = dict(e)
            if "audio" in e:
                e["loud"] = _loud_mask(e["audio"])
                e["samples"] = _samples(e.pop("audio"))
            if "jpeg" in e:
                e["jpeg_bytes"] = len(e.pop("jpeg")) * 3 // 4
            slim.append((t, e))
        data = {"caps": data["caps"], "log": slim}
        out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    report = analyze(data["caps"], data["log"])
    print(json.dumps(report, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
