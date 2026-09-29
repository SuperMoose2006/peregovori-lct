"""check_live_video_mutations.py — каждая проверка живого видео краснеет на поломке.

Для каждой мутации (намеренная поломка в одну строку) прогоняются ВСЕ проверки
живого видео — не только «своя», — и записывается, какие именно покраснели.
Итог — таблица: у каждого теста должна быть хотя бы одна мутация, на которой он
красный. Тест, который не краснеет ни на одной, не доказывает ничего, и прибор
называет его поимённо.

Три набора проверок:
* питон: tests/test_live_video.py и tests/test_live_video_vendors.py;
* клиент: frontend/test/liveVideo.test.ts;
* браузер: frontend/e2e/live-video.mjs против поднятого шлюза (два режима —
  без кредов и с заглушкой, обрывающей связь посреди партии).

Запускать только в своём рабочем дереве, где никто больше не собирает и не
тестирует: исходник правится на время прогона и возвращается в `finally`.
Сети и облака нет. Журналы — tmp/live-video-mutations/ (в .gitignore).

    cd services/gateway && .venv/bin/python -m tools.check_live_video_mutations [--no-e2e] [имя …]
"""

from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "tmp" / "live-video-mutations"
GATEWAY = ROOT / "services" / "gateway"
FRONT = ROOT / "frontend"
PY = str(GATEWAY / ".venv" / "bin" / "python")
PY_TESTS = ["tests/test_live_video.py", "tests/test_live_video_vendors.py"]
ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "TSX_TSCONFIG_PATH": "./tsconfig.app.json"}
DIST = "/tmp/lv-mutation-dist"
PORT = 8047

LIVE = "services/gateway/app/avatar/live/"
V = LIVE + "vendors/"
T = "frontend/src/realtime/transport.ts"

#: (имя, файл, было, стало, наборы). Набор: py · js · e2e-off · e2e-stub.
MUTATIONS: list[tuple[str, str, str, str, tuple[str, ...]]] = [
    # --- флаг и настройки
    ("flag-no-key-enables", LIVE + "config.py", "            missing_key = True", "            missing_key = False", ("py",)),
    ("key-format-unchecked", LIVE + "config.py", "            problem = key_problem(key, spec)", "            problem = None", ("py",)),
    ("offline-ignored", LIVE + "config.py", "            if not network_enabled():", "            if False:", ("py",)),
    ("unknown-vendor-guessed", LIVE + "config.py", "    spec = VENDORS.get(vendor)\n    if spec is None:", "    spec = VENDORS.get(vendor) or VENDORS[\"stub\"]\n    if spec is None:", ("py",)),
    ("numbers-unchecked", LIVE + "config.py", "    if not (lo <= value <= hi):", "    if False:", ("py",)),
    ("rejected-key-ignored", LIVE + "config.py", "        if isinstance(exc, DriverError) and exc.fatal:", "        if False:", ("py",)),
    ("missing-modules-ignored", LIVE + "config.py", "    missing = missing_modules(spec)", "    missing = []", ("py",)),
    ("avatar-required-unchecked", LIVE + "config.py", "            if spec.needs_avatar and not (env.get(ENV_AVATAR) or \"\").strip():", "            if False:", ("py",)),
    ("no-key-is-a-warning", LIVE + "config.py", "        _log.info(\"живое видео: сервис %s назван, ключа нет — рисованный портрет\", cfg.vendor)", "        _log.warning(\"живое видео: сервис %s назван, ключа нет — рисованный портрет\", cfg.vendor)", ("py",)),
    ("explicit-provider-overridden", "services/gateway/app/avatar/factory.py", "    if voice and name in ('', 'local'):", "    if voice:", ("py",)),
    ("always-live-without-creds", "services/gateway/app/avatar/factory.py", "        live = create_live_avatar(persona, publish, lang=lang, female=female)", "        live = create_live_avatar(persona, publish, lang=lang, female=female, cfg=__import__('app.avatar.live.config', fromlist=['load']).load({'NEGO_LIVE_VIDEO': 'stub'}))", ("py", "e2e-off")),
    ("health-silent", "services/gateway/app/main.py", "        \"live_video\": _live_video_describe(),", "        \"live_video\": \"off\",", ("py",)),
    ("exam-gets-layers", "services/gateway/app/realtime/endpoint.py", "    if reproducible_run(payload.gameMode):\n        return Layers.for_exam()", "    if False:\n        return Layers.for_exam()", ("py",)),
    # --- часы клиента
    ("clock-no-jitter-buffer", LIVE + "clock.py", "            self._segments.append(_Segment(start_pts, end_pts, at + self.lead_s))", "            self._segments.append(_Segment(start_pts, end_pts, at))", ("py",)),
    ("clock-not-contiguous", LIVE + "clock.py", "        if prev_end is not None and at <= prev_end:", "        if False:", ("py",)),
    # --- кадры
    ("stale-250-ignored", LIVE + "adapter.py", "            if now > at + STALE_MS / 1000.0:", "            if now > at + 5.0:", ("py",)),
    ("frame-before-its-audio", LIVE + "adapter.py", "            at = self.clock.play_time(self._gen, frame.pts_ms)\n            if at is None:", "            at = self.clock.play_time(self._gen, frame.pts_ms) or self._now()\n            if at is None:", ("py",)),
    ("lookahead-ignored", LIVE + "adapter.py", "            if now < at - LOOKAHEAD_MS / 1000.0:", "            if False:", ("py",)),
    ("foreign-generation-accepted", LIVE + "adapter.py", "        if (self.mode != \"video\" or not frame.generation_id or frame.generation_id != self._gen", "        if (self.mode != \"video\" or not frame.generation_id", ("py",)),
    ("thinning-off", LIVE + "adapter.py", "            if pts - self._last_in_pts < self._min_gap_ms * 0.999:", "            if False:", ("py",)),
    ("pts-offset-ignored", LIVE + "adapter.py", "        pts = frame.pts_ms + self._cfg.pts_offset_ms", "        pts = frame.pts_ms", ("py",)),
    # --- звук: удержание и «голос важнее лица»
    ("no-audio-hold", LIVE + "adapter.py", "        self._held.append((self._now() + self._av_delay_s, event))", "        self._held.append((self._now(), event))", ("py",)),
    ("degrade-drops-held-voice", LIVE + "adapter.py", "            self.stats.degrades.append(reason)\n            self._flush_held()", "            self.stats.degrades.append(reason)\n            self._held.clear()", ("py",)),
    ("close-drops-held-voice", LIVE + "adapter.py", "        # Сначала звук: всё придержанное — человеку, по порядку.\n        self._flush_held()", "        # Сначала звук: всё придержанное — человеку, по порядку.\n        self._held.clear()", ("py",)),
    ("held-without-releaser", LIVE + "adapter.py", "                or self._ticker is None or self._ticker.done()):", "                or False):", ("py",)),
    # --- сторож, отказ, возврат
    ("watchdog-off", LIVE + "adapter.py", "        if playing - covered > self._cfg.stall_ms:", "        if False:", ("py",)),
    ("watchdog-hair-trigger", LIVE + "adapter.py", "        if playing - covered > self._cfg.stall_ms:", "        if playing - covered > 0:", ("py",)),
    ("closed-event-ignored", LIVE + "adapter.py", "                if closed is not None and not self._closed:\n                    self._degrade(f\"closed: {closed.reason}\", fatal=closed.fatal)", "                if closed is not None and not self._closed:\n                    pass", ("py", "e2e-stub")),
    ("no-recovery", LIVE + "adapter.py", "        if self.mode == \"amplitude\" and self._can_recover():", "        if False:", ("py",)),
    ("limit-never-gives-up", LIVE + "adapter.py", "        if fatal or self.failures >= self._cfg.max_failures:", "        if fatal:", ("py",)),
    ("dead-session-left-open", LIVE + "adapter.py", "            self._supervisor.cancel()\n        self._background(self._close_driver())", "            self._supervisor.cancel()\n        pass", ("py",)),
    ("fatal-retried", LIVE + "adapter.py", "                self._degrade(f\"connect: {exc.reason}\", fatal=exc.fatal)", "                self._degrade(f\"connect: {exc.reason}\", fatal=False)", ("py",)),
    ("no-reconnect", LIVE + "adapter.py", "            if attempt >= len(RECONNECT_BACKOFF_S):", "            if True:", ("py",)),
    ("not-connected-strike", LIVE + "adapter.py", "            self._degrade(\"not_connected\", strike=False)", "            self._degrade(\"not_connected\", strike=True)", ("py",)),
    ("interrupt-keeps-held", LIVE + "adapter.py", "        self._held.clear()\n        self._pending.clear()\n        self._gen = \"\"", "        self._pending.clear()\n        self._gen = \"\"", ("py",)),
    ("interrupt-silent-to-service", LIVE + "adapter.py", "            self._background(self._driver.interrupt())\n        self._state = \"listening\"", "            pass\n        self._state = \"listening\"", ("py",)),
    # --- проводка партии
    ("r2-not-signalled", "services/gateway/app/orchestrator/tts_manager.py", "                        if self._finished_generation == self._generation_id:\n                            await self._audio_ended(self._generation_id)", "                        if self._finished_generation == self._generation_id:\n                            pass", ("py",)),
    ("r2-not-wired", "services/gateway/app/orchestrator/negotiation.py", "            tts.on_audio_end = avatar.end_of_speech\n        self._generation_task", "        self._generation_task", ("py",)),
    ("audio-out-not-wired", "services/gateway/app/orchestrator/negotiation.py", "            tts.audio_out = avatar.audio_out\n            tts.on_audio_end = avatar.end_of_speech\n        self._generation_task", "            tts.on_audio_end = avatar.end_of_speech\n        self._generation_task", ("py",)),
    ("start-not-called", "services/gateway/app/realtime/endpoint.py", "        avatar.start()", "        pass", ("py",)),
    ("service-voice-not-used", "services/gateway/app/realtime/endpoint.py", "    return avatar.voice_for(provider) if avatar is not None else provider", "    return provider", ("py",)),
    ("grade-leaks-layer", "services/gateway/app/orchestrator/negotiation.py", "        result = engine.apply_move(engine_sess, analysis, text, judge=judgement)", "        result = engine.apply_move(engine_sess, analysis, text, judge=({'arg_score': 100, 'techniques': [], 'note': ''} if hasattr(self.avatar, 'clock') else judgement))", ("py",)),
    # --- вход text
    ("text-voice-bypassed", LIVE + "voice.py", "        utt = avatar.open_utterance(generation_id, text) if generation_id else None", "        utt = None", ("py",)),
    ("text-no-generation", "services/gateway/app/orchestrator/tts_manager.py", "                 if getattr(self._provider, \"wants_generation\", False) is True else {})", "                 if False else {})", ("py",)),
    ("text-timeout-default", "services/gateway/app/orchestrator/tts_manager.py", "        timeout = getattr(self._provider, \"synthesis_timeout_s\", None)", "        timeout = None", ("py",)),
    ("text-no-repeat", LIVE + "voice.py", "                    if item is _Utterance.FAILED:\n                        break", "                    if item is _Utterance.FAILED:\n                        return", ("py",)),
    ("text-voice-watchdog-off", LIVE + "adapter.py", "            if now - self._voice_progress_at > limit:", "            if False:", ("py",)),
    # --- драйверы сервисов
    ("anam-no-passthrough", V + "anam.py", "    return PersonaConfig(avatar_id=avatar_id, enable_audio_passthrough=True)", "    return PersonaConfig(avatar_id=avatar_id, enable_audio_passthrough=False)", ("py",)),
    ("anam-records-session", V + "anam.py", "    return SessionOptions(enable_session_replay=False)", "    return SessionOptions(enable_session_replay=True)", ("py",)),
    ("anam-wrong-rate", V + "anam.py", "encoding=\"pcm_s16le\", sample_rate=24000, channels=1)", "encoding=\"pcm_s16le\", sample_rate=16000, channels=1)", ("py",)),
    ("anam-no-end-sequence", V + "anam.py", "    async def _end(self) -> None:\n        if self._stream is not None:\n            await self._stream.end_sequence()", "    async def _end(self) -> None:\n        if self._stream is not None:\n            pass", ("py",)),
    ("anam-errors-all-retry", V + "anam.py", "reason=code or \"connect\", fatal=code in _FATAL)", "reason=code or \"connect\", fatal=False)", ("py",)),
    ("anam-own-face-as-stock", V + "anam.py", "            and a.get(\"createdByOrganizationId\") is None]", "            ]", ("py",)),
    ("anchor-ignores-our-onset", V + "_anchor.py", "                self._our_onset = self._sent_ms + at", "                self._our_onset = self._sent_ms", ("py",)),
    ("anchor-jittery", V + "_anchor.py", "            delta = (ref_arrival - self._onset_wall) + (frame_time_s - ref_time)", "            delta = arrival - self._onset_wall", ("py",)),
    ("anchor-accepts-pre-speech", V + "_anchor.py", "                if arrival < self._onset_wall:\n                    return None", "                if False:\n                    return None", ("py",)),
    ("anchor-at-send-time", V + "_anchor.py", "        self._onset_wall = arrival - duration + at / 1000.0", "        self._onset_wall = arrival - duration + at / 1000.0 - 0.15", ("py",)),
    ("simli-idle-30s", V + "simli.py", "maxSessionLength=1800, maxIdleTime=300)", "maxSessionLength=1800, maxIdleTime=30)", ("py",)),
    ("simli-24k", V + "simli.py", "        await self._client.send(f32_to_s16(pcm_f32, dst_rate=INPUT_RATE))", "        await self._client.send(f32_to_s16(pcm_f32))", ("py",)),
    ("simli-no-skip", V + "simli.py", "            await self._client.clearBuffer()", "            pass", ("py",)),
    ("la-no-short-first-chunk", V + "liveavatar.py", "        want_ms = FIRST_CHUNK_MS if self._sent_in_utterance == 0 else CHUNK_MS", "        want_ms = CHUNK_MS", ("py",)),
    ("la-no-speak-end", V + "liveavatar.py", "        await self._send({\"type\": \"agent.speak_end\"})", "        pass", ("py",)),
    ("la-no-stop", V + "liveavatar.py", "        if self.session_id:\n            # Остановить явно", "        if False:\n            # Остановить явно", ("py",)),
    ("la-sandbox-ignored", V + "liveavatar.py", "\"is_sandbox\": self._cfg.sandbox,", "\"is_sandbox\": False,", ("py",)),
    ("la-credits-ignored", V + "liveavatar.py", "float(credits) < 1", "float(credits) < 0", ("py",)),
    ("la-disconnect-ignored", V + "liveavatar.py", "                        reason = \"liveavatar: сессия отключена сервисом\"\n                        break", "                        reason = \"liveavatar: сессия отключена сервисом\"\n                        continue", ("py",)),
    ("la-image-face-as-stock", V + "liveavatar.py", "            if avatar.get(\"status\") == \"ACTIVE\" and avatar.get(\"type\") == \"VIDEO\" and avatar.get(\"id\"):", "            if avatar.get(\"id\"):", ("py",)),
    ("la-no-interrupt", V + "liveavatar.py", "        await self._send({\"type\": \"agent.interrupt\"})", "        pass", ("py",)),
    ("stream-end-silent", V + "_webrtc.py", "        if not self._closing:\n            self.emit(Closed(reason))\n\n    async def _audio_loop", "        if False:\n            self.emit(Closed(reason))\n\n    async def _audio_loop", ("py",)),
    ("http-401-retried", V + "_webrtc.py", "    if status in (401, 403):", "    if status in (403,):", ("py",)),
    ("mono-unscaled", V + "_webrtc.py", "    if fmt.startswith(\"s16\"):\n        mono = mono / 32768.0", "    if fmt.startswith(\"s16\"):\n        mono = mono", ("py",)),
    ("jpeg-not-square", LIVE + "media.py", "    if w != h:", "    if False:", ("py",)),
    ("f32-unscaled", LIVE + "media.py", "    return (np.clip(samples, -1.0, 1.0) * 32767.0).astype(\"<i2\").tobytes()", "    return (np.clip(samples, -1.0, 1.0) * 1.0).astype(\"<i2\").tobytes()", ("py",)),
    # --- добиты по таблице «ни разу не покраснели»
    ("key-check-too-strict", LIVE + "config.py", "    if len(key) < 16:", "    if len(key) < 64:", ("py",)),
    ("accepted-key-disables", LIVE + "config.py", "    STATUS.checked = f\"{cfg.vendor}: ключ принят — {verdict}\"", "    STATUS.rejected = STATUS.checked = f\"{cfg.vendor}: ключ принят — {verdict}\"", ("py",)),
    ("describe-lies-when-off", LIVE + "config.py", "    if not cfg.vendor:\n        return \"off\"", "    if not cfg.vendor:\n        return \"stub (видео)\"", ("py", "e2e-off")),
    ("describe-hides-video", LIVE + "config.py", "    return f\"{cfg.vendor} ({what}; вход {cfg.input}, {voice})\"", "    return \"off\"", ("py", "e2e-stub")),
    ("speech-denied", "services/gateway/app/realtime/endpoint.py", "        \"speech\": bool(session.layers.voice) and _speech_for(", "        \"speech\": False and _speech_for(", ("py", "e2e-off", "e2e-stub")),
    ("local-face-swallows-voice", "services/gateway/app/avatar/base.py", "    audio_out: Optional[Callable[[dict], None]] = None", "    audio_out = staticmethod(lambda event: None)", ("e2e-off",)),
    ("reply-never-done", "services/gateway/app/orchestrator/negotiation.py", "        sess.bus.publish(response_done(generation_id=generation_id, turn_id=turn_id,\n                                       text=line, reason=\"turn_end\"))\n        self._finish_generation()", "        self._finish_generation()", ("e2e-off", "e2e-stub")),
    ("frames-never-published", LIVE + "adapter.py", "            self._publish(event)\n            self.stats.frames_sent += 1", "            self.stats.frames_sent += 1", ("py", "e2e-stub")),
    ("synthetic-hidden", LIVE + "adapter.py", "synthetic=bool(self._info and self._info.synthetic))", "synthetic=False)", ("py", "e2e-stub")),
    ("degrade-at-every-reply", LIVE + "adapter.py", "        if self.mode == \"video\" and self.input == \"audio\" and self.link != \"ready\":", "        if self.mode == \"video\" and self.input == \"audio\":", ("py", "e2e-stub")),
    ("starts-as-portrait", LIVE + "adapter.py", "        self.mode = \"video\"\n        #: Связь", "        self.mode = \"amplitude\"\n        #: Связь", ("py", "e2e-stub")),
    ("voice-lost-after-failure", LIVE + "adapter.py", "            self._release_audio(event)\n            self.stats.audio_direct += 1", "            self.stats.audio_direct += 1", ("py", "e2e-stub")),
    ("turn-dies-after-failure", LIVE + "adapter.py", "        self._publish(self._state_event(reason=reason, reaction=reaction))", "        if self.mode == \"amplitude\":\n            raise RuntimeError(\"face\")\n        self._publish(self._state_event(reason=reason, reaction=reaction))", ("e2e-stub",)),
    ("anam-errors-all-fatal", V + "anam.py", "reason=code or \"connect\", fatal=code in _FATAL)", "reason=code or \"connect\", fatal=True)", ("py",)),
    ("anam-no-interrupt", V + "anam.py", "        if self._session is not None:\n            await self._session.interrupt()", "        if self._session is not None:\n            pass", ("py",)),
    ("anam-close-callback-ignored", V + "anam.py", "            if not self._closing:\n                self.emit(Closed(f\"anam: {code} {reason or ''}\".strip()))", "            if False:\n                self.emit(Closed(f\"anam: {code} {reason or ''}\".strip()))", ("py",)),
    ("http-402-retried", V + "_webrtc.py", "    if status == 402:", "    if False:", ("py",)),
    ("http-403-retried", V + "_webrtc.py", "    if status in (401, 403):", "    if status in (401,):", ("py",)),
    ("http-500-fatal", V + "_webrtc.py", "        return DriverError(f\"{vendor}: проверка ключа ответила {status} {body[:120]}\", reason=\"http\")", "        return DriverError(f\"{vendor}: проверка ключа ответила {status} {body[:120]}\", reason=\"http\", fatal=True)", ("py",)),
    ("onset-always-zero", V + "_anchor.py", "    return float(loud[0]) * WINDOW_MS", "    return 0.0", ("py",)),
    ("simli-errors-all-retry", V + "simli.py", "                              fatal=any(code in text for code in _FATAL))", "                              fatal=False)", ("py",)),
    ("la-livekit-name-drift", V + "liveavatar.py", "LK_TRACK_EVENT = \"track_subscribed\"", "LK_TRACK_EVENT = \"track_published\"", ("py",)),
    # --- клиент
    ("client-console-error", T, "          this.faceFrames.clear();\n          // `synthetic: false`", "          console.error(\"live video mutation\");\n          this.faceFrames.clear();\n          // `synthetic: false`", ("e2e-off", "e2e-stub")),
    ("client-no-video-recovery", T, "} else if (this.session && event.lipsync_mode === \"video\" && event.transport === \"jpeg\") {", "} else if (false) {", ("js",)),
    ("client-label-kept", T, "transport: \"local\", synthetic: false } };", "transport: \"local\" } };", ("js", "e2e-stub")),
    ("client-no-dedupe", T, "          if (avatar.lipsync_mode !== \"video\") {", "          if (true) {", ("js",)),
    ("client-video-without-jpeg", T, "event.lipsync_mode === \"video\" && event.transport === \"jpeg\"", "event.lipsync_mode === \"video\"", ("js",)),
    ("client-keeps-failed-frames", T, "        if (this.session && event.lipsync_mode === \"amplitude\") {\n          this.faceFrames.clear();", "        if (this.session && event.lipsync_mode === \"amplitude\") {\n", ("js",)),
    ("client-synthetic-dropped", T, "synthetic: event.synthetic === true } };", "synthetic: false } };", ("js",)),
    ("client-stale-1000", "frontend/src/lib/avatarFrames.ts", "timeMs-this.current.pts < 250", "timeMs-this.current.pts < 1000", ("js",)),
    ("client-amplitude-as-video", T, "lipsync: true, lipsync_mode: \"amplitude\", transport: \"local\", synthetic: false } };", "lipsync: true, lipsync_mode: \"video\", transport: \"jpeg\", synthetic: false } };", ("js", "e2e-off")),
]


#: Мутации, которым нужна правка в двух местах (второе — снять страховку,
#: которая иначе спрячет поломку от проверки).
EXTRA_EDITS: dict[str, list[tuple[str, str, str]]] = {
    # Лицо бросает после отказа, и оркестратор больше не ловит — ход падает.
    "turn-dies-after-failure": [(
        "services/gateway/app/orchestrator/negotiation.py",
        "            await asyncio.wait_for(self.avatar.set_state(state, reaction=reaction), timeout=0.05)\n        except asyncio.CancelledError:\n            raise\n        except Exception:",
        "            await asyncio.wait_for(self.avatar.set_state(state, reaction=reaction), timeout=0.05)\n        except asyncio.CancelledError:\n            raise\n        except KeyError:")],
}


def _pytest() -> tuple[bool, set[str], str]:
    run = subprocess.run([PY, "-m", "pytest", *PY_TESTS, "-q", "-p", "no:cacheprovider", "-rfE"],
                         cwd=GATEWAY, env=ENV, text=True, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, timeout=600)
    # Имя параметризованного теста может содержать пробел: до « - » или конца строки.
    failed = set(re.findall(r"^(?:FAILED|ERROR) (.+?)(?: - .*)?$", run.stdout, re.M))
    return run.returncode == 0, failed, run.stdout


def _pytest_ids() -> list[str]:
    run = subprocess.run([PY, "-m", "pytest", *PY_TESTS, "-q", "--collect-only", "-p", "no:cacheprovider"],
                         cwd=GATEWAY, env=ENV, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return [line.strip() for line in run.stdout.splitlines() if "::" in line]


def _node() -> tuple[bool, set[str], str]:
    run = subprocess.run(["node", "--import", "tsx", "--test", "test/liveVideo.test.ts"], cwd=FRONT,
                         env=ENV, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=300)
    failed = set()
    for line in run.stdout.splitlines():
        m = re.match(r"^✖ (.+?) \(\d", line)
        if m:
            failed.add("liveVideo.test.ts::" + m.group(1))
    return run.returncode == 0, failed, run.stdout


def _node_ids() -> list[str]:
    _, _, out = _node()
    return ["liveVideo.test.ts::" + m for m in re.findall(r"^✔ (.+?) \(\d", out, re.M)]


def _e2e(expect: str, rebuild: bool) -> tuple[bool, set[str], str]:
    if rebuild or not Path(DIST, "index.html").exists():
        subprocess.run(["npx", "vite", "build", "--outDir", DIST], cwd=FRONT, env=ENV,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=300)
    env = {**ENV, "NEGO_AI": "off", "NEGO_TTS": "testtone", "NEGO_FRONTEND_DIST": DIST,
           "NEGO_LIVE_VIDEO": "stub" if expect == "stub" else "off"}
    if expect == "stub":
        env["NEGO_LIVE_VIDEO_STUB_FAIL_AFTER_S"] = "10"
    server = subprocess.Popen([str(GATEWAY / ".venv/bin/uvicorn"), "app.main:app", "--port", str(PORT)],
                              cwd=GATEWAY, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                              start_new_session=True)
    try:
        for _ in range(100):
            try:
                import urllib.request
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/health", timeout=1)
                break
            except Exception:
                time.sleep(0.1)
        run = subprocess.run(["node", "e2e/live-video.mjs", "--url", f"http://127.0.0.1:{PORT}",
                              "--expect", expect, "--out", str(OUT / f"e2e-{expect}")],
                             cwd=FRONT, env=ENV, text=True, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, timeout=300)
    finally:
        os.killpg(server.pid, signal.SIGTERM)
        server.wait(timeout=10)
    failed = {f"e2e-{expect}::" + m.split(" ⇒ ")[0] for m in re.findall(r"^  ✗ (.+)$", run.stdout, re.M)}
    return run.returncode == 0, failed, run.stdout


def _e2e_ids(expect: str) -> list[str]:
    _, _, out = _e2e(expect, rebuild=True)
    return [f"e2e-{expect}::" + m.split(" ⇒ ")[0] for m in re.findall(r"^  ✓ (.+)$", out, re.M)
            if not m.startswith("справка")]


def run_suite(suite: str, rebuild: bool) -> tuple[bool, set[str], str]:
    if suite == "py":
        return _pytest()
    if suite == "js":
        return _node()
    return _e2e(suite.split("-", 1)[1], rebuild)


def main(argv: list[str]) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    with_e2e = "--no-e2e" not in argv
    only = [a for a in argv if not a.startswith("--")]
    suites = ["py", "js"] + (["e2e-off", "e2e-stub"] if with_e2e else [])

    # Эталон: без мутаций всё зелёное, и заодно — полный список проверок.
    tests: dict[str, list[str]] = {"py": _pytest_ids(), "js": _node_ids()}
    if with_e2e:
        tests["e2e-off"] = _e2e_ids("off")
        tests["e2e-stub"] = _e2e_ids("stub")
    for suite in suites:
        ok, failed, log = run_suite(suite, rebuild=False)
        (OUT / f"baseline-{suite}.log").write_text(log)
        if not ok:
            print(f"ЭТАЛОН НЕ ЗЕЛЁНЫЙ ({suite}): {sorted(failed)}")
            return 2
    print("эталон зелёный: " + ", ".join(f"{s} {len(tests[s])}" for s in suites), flush=True)

    killed_by: dict[str, list[str]] = {t: [] for s in suites for t in tests[s]}
    results = []
    for name, rel, before, after, where in MUTATIONS:
        if only and name not in only:
            continue
        edits = [(rel, before, after)] + EXTRA_EDITS.get(name, [])
        originals = {}
        for erel, ebefore, _ in edits:
            text = originals.setdefault(erel, (ROOT / erel).read_text(encoding="utf-8"))
            count = text.count(ebefore)
            assert count == 1, f"{name}: якорь мутации встречается {count} раз в {erel}"
        try:
            for erel, ebefore, eafter in edits:
                path = ROOT / erel
                path.write_text(path.read_text(encoding="utf-8").replace(ebefore, eafter), encoding="utf-8")
            reds: set[str] = set()
            logs = []
            for suite in suites:
                if suite.startswith("e2e") and suite not in where:
                    continue        # браузер — только для мутаций, которые он обязан ловить
                _, failed, log = run_suite(suite, rebuild=any(e.startswith("frontend/") for e in originals))
                reds |= failed
                logs.append(f"===== {suite}\n{log}")
            (OUT / f"{name}.log").write_text("\n".join(logs))
        finally:
            for erel, text in originals.items():
                (ROOT / erel).write_text(text, encoding="utf-8")
            if any(e.startswith("frontend/") for e in originals) and with_e2e:
                subprocess.run(["npx", "vite", "build", "--outDir", DIST], cwd=FRONT, env=ENV,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for test in reds:
            killed_by.setdefault(test, []).append(name)
        prefix = {"py": "tests/", "js": "liveVideo.test.ts::", "e2e-off": "e2e-off::",
                  "e2e-stub": "e2e-stub::"}
        expected_hit = all(any(t.startswith(prefix[w]) for t in reds)
                           for w in where if w in suites)
        results.append({"mutation": name, "file": rel, "red": sorted(reds), "caught": expected_hit})
        print(f"{name}: {'ПОЙМАНА' if expected_hit else 'НЕ ПОЙМАНА'} — красных {len(reds)}", flush=True)

    survivors = [r["mutation"] for r in results if not r["caught"]]
    never = sorted(t for t, by in killed_by.items() if not by and (not only))
    report = {"mutations": results, "tests_never_red": never,
              "tests": {s: len(tests[s]) for s in suites}, "survivors": survivors}
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\nмутаций: {len(results)}, поймано: {len(results) - len(survivors)}, не поймано: {survivors}")
    print(f"проверок всего: {sum(len(tests[s]) for s in suites)}; ни разу не покраснели: {len(never)}")
    for test in never:
        print("  · " + test)
    return 0 if not survivors and not never else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
