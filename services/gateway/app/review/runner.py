"""runner.py — запуск «Глубокого разбора»: агенты параллельно, с потолками.

Порядок работы:
  1. время ходов из записи партии (`tape.py`) — когда принят, как пришёл, где
     в записи речь;
  2. голос без модели (`acoustics.py`) — в отдельном потоке, чтобы numpy не
     держал цикл событий, на котором живут чужие партии;
  3. агенты: восемь по смыслу, по одному вызову на кусок речи, по одному на
     пачку кадров. Одновременно не больше `CONCURRENCY`, у каждого потолок
     `CALL_TIMEOUT_S`, у всего разбора — `DEADLINE_S`: не успевший агент
     назван в отчёте, а не ждётся вечно;
  4. сводка (`merge.py`).

Прогресс уходит по группам — восемь агентов смысла по отдельности, голос и
мимика целиком, — потому что человеку на кнопке важно «сколько осталось», а
не номер вызова.
"""

from __future__ import annotations

import asyncio
import time
from typing import Callable, Optional

import numpy as np

from app.providers.asr.openrouter import pcm_to_wav_base64
from app.providers.openrouter import chat as orchat
from app.review import acoustics, agents, merge
from app.review.tape import SAMPLE_RATE, Tape

CONCURRENCY = 6
CALL_TIMEOUT_S = 35.0
DEADLINE_S = 100.0

#: Кусков речи на агента голоса — не больше: самые длинные. Длинная партия
#: стоила бы десятков вызовов ради того же вывода.
MAX_VOICE_CLIPS = 12

#: Кадров на агента мимики и кадров в одной пачке. Пачка — несколько кадров в
#: одном вызове: модель видит соседние кадры и меньше путает моргание с
#: гримасой, а вызовов в восемь раз меньше.
MAX_FACE_FRAMES = 64
FACE_BATCH = 8

Progress = Callable[[dict], None]


def _clock(ms: int) -> str:
    s = max(0, int(ms)) // 1000
    return f"{s // 60:02d}:{s % 60:02d}"


def _pick(items: list, limit: int) -> list:
    """Равномерно выбрать не больше `limit`, сохранив края."""
    if len(items) <= limit:
        return list(items)
    step = (len(items) - 1) / (limit - 1)
    return [items[round(i * step)] for i in range(limit)]


async def run_review(facts: dict, tape: Optional[Tape], *, progress: Progress,
                     deadline_s: float = DEADLINE_S) -> dict:
    lang = facts.get("lang", "ru")
    started = time.monotonic()
    player_turns = sorted({ln["turn"] for ln in facts.get("lines") or [] if ln["role"] == "player"})
    last_turn = player_turns[-1] if player_turns else 0
    if tape is not None:
        tape.close_open()

    # ------------------------------------------------------ голос без модели
    clips = []
    if tape is not None and not tape.media_discarded:
        clips = [c for c in tape.clips if c.samples > 0 and 0 < c.turn + 1 <= last_turn]

    def measure() -> list[dict]:
        return [acoustics.analyze(c.array()) for c in clips]

    features = await asyncio.to_thread(measure) if clips else []

    # ------------------------------------------------------ время ходов
    timing: dict[int, dict] = {}
    for turn in player_turns:
        info: dict = {}
        if tape is not None:
            if turn in tape.turn_at:
                info["at_ms"] = tape.turn_at[turn]
            if turn in tape.turn_source:
                info["source"] = tape.turn_source[turn]
        spans = [(c, f) for c, f in zip(clips, features) if c.turn + 1 == turn
                 and f.get("speech_from_ms") is not None]
        if spans and info.get("source") != "text":
            info["start_ms"] = spans[0][0].at_ms + spans[0][1]["speech_from_ms"]
            info["end_ms"] = spans[-1][0].at_ms + spans[-1][1]["speech_to_ms"]
            info.setdefault("source", "voice")
        elif "at_ms" in info:
            info["start_ms"] = info["end_ms"] = info["at_ms"]
        timing[turn] = info

    # ------------------------------------------------------ агенты
    transcript = agents.render_transcript(facts, timing)
    sem = asyncio.Semaphore(CONCURRENCY)
    statuses: list[dict] = []
    groups_total = len(agents.CONTENT_AGENTS)
    voice_clips = sorted(range(len(clips)), key=lambda i: -features[i]["voiced_ms"])[:MAX_VOICE_CLIPS]
    voice_clips = [i for i in voice_clips if features[i]["voiced_ms"] >= 600]
    frames = _pick(tape.frames, MAX_FACE_FRAMES) if tape is not None else []
    groups_total += bool(voice_clips) + bool(frames)
    done = 0

    def tick(agent_id: str) -> None:
        nonlocal done
        done += 1
        progress({"type": "review.progress", "done": done, "total": groups_total,
                  "agent": agent_id})

    async def call(system: str, parts, role: str, max_tokens: int) -> Optional[str]:
        async with sem:
            left = deadline_s - (time.monotonic() - started)
            if left <= 1:
                raise asyncio.TimeoutError
            if isinstance(parts, str):
                coro = orchat.complete(system, parts, role=role, max_tokens=max_tokens,
                                       temperature=0.2, raw=True)
            else:
                coro = orchat.complete_parts(system, parts, role=role, max_tokens=max_tokens,
                                             temperature=0.2)
            return await asyncio.wait_for(coro, timeout=min(CALL_TIMEOUT_S, left))

    async def content_agent(agent: agents.ContentAgent) -> tuple[str, Optional[dict]]:
        system, user = agents.content_prompt(agent, facts, transcript)
        status = {"id": agent.id, "channel": "content", "ok": False}
        try:
            raw = await call(system, user, "reasoning", agent.max_tokens)
            data = agents.extract_json(raw)
            if data is None:
                status["reason"] = "empty" if raw is None else "unreadable"
                return agent.id, None
            status["ok"] = True
            return agent.id, agent.parse(data)
        except asyncio.TimeoutError:
            status["reason"] = "timeout"
            return agent.id, None
        except Exception:
            status["reason"] = "failed"
            return agent.id, None
        finally:
            statuses.append(status)
            tick(agent.id)

    player_text = {ln["turn"]: ln["text"] for ln in facts.get("lines") or [] if ln["role"] == "player"}

    async def voice_agent() -> dict[int, Optional[list[dict]]]:
        results: dict[int, Optional[list[dict]]] = {}

        async def one(i: int) -> None:
            clip = clips[i]
            system, user = agents.voice_prompt(lang, player_text.get(clip.turn + 1, ""))
            wav = pcm_to_wav_base64(clip.array().astype(np.float32) / 32768.0, SAMPLE_RATE)
            parts = [{"type": "text", "text": user},
                     {"type": "input_audio", "input_audio": {"data": wav, "format": "wav"}}]
            try:
                raw = await call(system, parts, "asr", 500)
                results[i] = agents.parse_voice(raw, clip.dur_ms / 1000)
            except Exception:
                results[i] = None

        await asyncio.gather(*(one(i) for i in voice_clips))
        ok = sum(1 for v in results.values() if v is not None)
        statuses.append({"id": "voice", "channel": "voice", "ok": ok > 0,
                         "calls": len(voice_clips), "calls_ok": ok,
                         **({} if ok else {"reason": "failed"})})
        tick("voice")
        return results

    async def face_agent() -> list[Optional[list[str]]]:
        cues: list[Optional[list[str]]] = [None] * len(frames)
        batches = [list(range(i, min(i + FACE_BATCH, len(frames))))
                   for i in range(0, len(frames), FACE_BATCH)]
        system = agents.face_prompt(lang)

        async def one(batch: list[int]) -> bool:
            parts: list[dict] = []
            for n, idx in enumerate(batch, 1):
                fr = frames[idx]
                label = (f"Кадр {n} — {_clock(fr.at_ms)}" if lang == "ru"
                         else f"Frame {n} — {_clock(fr.at_ms)}")
                parts.append({"type": "text", "text": label})
                parts.append({"type": "image_url",
                              "image_url": {"url": f"data:image/jpeg;base64,{fr.jpeg_b64}"}})
            try:
                raw = await call(system, parts, "vision", 60 + 40 * len(batch))
            except Exception:
                return False
            parsed = agents.parse_face(raw, len(batch))
            if parsed is None:
                return False
            for n, idx in enumerate(batch, 1):
                cues[idx] = parsed.get(n, [])
            return True

        oks = await asyncio.gather(*(one(b) for b in batches))
        statuses.append({"id": "face", "channel": "video", "ok": any(oks),
                         "calls": len(batches), "calls_ok": sum(oks),
                         **({} if any(oks) else {"reason": "failed"})})
        tick("face")
        return cues

    jobs = [content_agent(a) for a in agents.CONTENT_AGENTS]
    voice_job = voice_agent() if voice_clips else None
    face_job = face_agent() if frames else None
    results = await asyncio.gather(*jobs,
                                   *(j for j in (voice_job, face_job) if j is not None))
    content = dict(results[:len(jobs)])
    rest = list(results[len(jobs):])
    voice_results = rest.pop(0) if voice_job is not None else {}
    face_cues = rest.pop(0) if face_job is not None else []

    # ------------------------------------------------------ каналы
    voice_in: Optional[dict] = None
    if clips:
        turns: dict[int, dict] = {}
        for i, (clip, feat) in enumerate(zip(clips, features)):
            t = clip.turn + 1
            slot = turns.setdefault(t, {"clips": [], "voiced_ms": 0})
            slot["clips"].append({"at_ms": clip.at_ms, "features": feat,
                                  "events": voice_results.get(i)})
            slot["voiced_ms"] += feat["voiced_ms"]
        voice_in = {"turns": turns}
    face_in: Optional[dict] = None
    if frames:
        face_in = {"frames": [{"turn": min(fr.turn + 1, last_turn or fr.turn + 1), "at_ms": fr.at_ms,
                               "cues": c} for fr, c in zip(frames, face_cues) if c is not None]}

    sources = {timing[t].get("source") for t in timing}
    voice_status = next((s for s in statuses if s["id"] == "voice"), None)
    face_status = next((s for s in statuses if s["id"] == "face"), None)
    content_ok = sum(1 for s in statuses if s["channel"] == "content" and s["ok"])
    channels = {
        "content": {"state": ("ok" if content_ok >= len(agents.CONTENT_AGENTS) - 2
                              else "partial" if content_ok else "failed"),
                    "agents_ok": content_ok, "agents_total": len(agents.CONTENT_AGENTS)},
        "voice": (
            {"state": "absent", "reason": "discarded"} if tape is not None and tape.media_discarded
            else {"state": "absent", "reason": "chat" if "voice" not in sources else "no_speech"}
            if not clips else
            {"state": ("ok" if voice_status and voice_status["ok"]
                       else "measured" if not voice_clips else "partial"),
             "clips": len(clips), "seconds": round(sum(f["voiced_ms"] for f in features) / 1000, 1),
             "truncated": bool(tape and tape.audio_truncated), "starved": bool(tape and tape.starved)}),
        "video": (
            {"state": "absent", "reason": "camera_off"} if not frames else
            {"state": "ok" if face_status and face_status["ok"] else "failed",
             "frames": len(frames), "recorded": len(tape.frames) if tape else 0,
             "thinned": bool(tape and tape.frames_thinned), "starved": bool(tape and tape.starved)}),
    }

    report = merge.build_report(facts=facts, timing=timing, content=content, voice=voice_in,
                                face=face_in, channels=channels,
                                agents=sorted(statuses, key=lambda s: s["id"]))
    report["took_ms"] = round((time.monotonic() - started) * 1000)
    return report
