"""Serial mutation checks for this change. Restores each file in finally.

Run only in an exclusively owned worktree with no build/test running against it.
No cloud or production access. Logs under ignored tmp/resumed-mutations/.
"""
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "tmp" / "resumed-mutations"
OUT.mkdir(parents=True, exist_ok=True)
PYTEST = [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"]
HOOK = ["node", "frontend/e2e/hook-lifecycle.mjs"]
ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "TSX_TSCONFIG_PATH": "./tsconfig.app.json"}
checks = [
    ("tts-premature-turn", "frontend/src/api/useNegotiation.ts", 'busy: msg.keepBusy ? prev.busy : false', 'busy: false', ["node", "--import", "tsx", "--test", "test/asr-selection.test.ts"]),
    ("asr-substitution", "services/gateway/app/providers/asr/__init__.py", 'return ParakeetASR()', 'return OpenRouterASR()', PYTEST + ["services/gateway/tests/test_asr_selection.py", "-k", "local_default"]),
    ("asr-wiring", "services/gateway/app/realtime/endpoint.py", 'asr=make_asr()', 'asr=__import__("app.providers.asr", fromlist=["OpenRouterASR"]).OpenRouterASR()', PYTEST + ["services/gateway/tests/test_asr_selection.py", "-k", "wire_and_health"]),
    ("asr-silent-failure", "services/gateway/app/perception/voice_pipeline.py", 'self._publish({"type": "error", "error": {', '(lambda event: None)({"type": "error", "error": {', PYTEST + ["services/gateway/tests/test_asr_selection.py", "-k", "outage"]),
    ("asr-stale-turn", "services/gateway/app/perception/voice_pipeline.py", 'self._transcript = ""\n            self._publish', 'self._transcript = "stale"\n            self._publish', PYTEST + ["services/gateway/tests/test_asr_selection.py", "-k", "outage"]),
    ("asr-microphone", "frontend/src/realtime/transport.ts", 'mic: this.voiceWanted && this.microphoneAllowed', 'mic: this.voiceWanted', ["node", "--import", "tsx", "--test", "test/asr-selection.test.ts"]),
    ("asr-label", "frontend/src/realtime/transport.ts", '+ capabilities.asr', '+ "unknown"', ["node", "--import", "tsx", "--test", "test/asr-selection.test.ts"]),
    ("signature", "services/gateway/app/attestation.py", "if not hmac.compare_digest(", "if False and not hmac.compare_digest(", PYTEST + ["services/gateway/tests/test_attestation.py", "-k", "modified_registry"]),
    ("admission", "services/gateway/app/attestation.py", 'not context.get("attestable")', 'False', PYTEST + ["services/gateway/tests/test_attestation.py", "-k", "ineligible"]),
    ("earned-score", "services/gateway/app/attestation.py", '"overall": result.overall', '"overall": 100', PYTEST + ["services/gateway/tests/test_attestation.py", "-k", "durable"]),
    ("passing-grade", "services/gateway/app/attestation.py", 'result.grade not in ("A", "B", "C")', 'False', PYTEST + ["services/gateway/tests/test_attestation.py", "-k", "active_and_failed"]),
    ("resume-mode", "services/gateway/app/realtime/endpoint.py", 'payload = payload.model_copy(update={"gameMode": original_mode})', 'payload = payload.model_copy()', PYTEST + ["services/gateway/tests/test_attestation.py", "-k", "promote"]),
    ("resume-document", "services/gateway/app/realtime/endpoint.py", 'if payload.resume and session.engine_session.state.status != "active":', 'if False:', PYTEST + ["services/gateway/tests/test_attestation.py", "-k", "recovers_same_document"]),
    ("stream-deadline", "services/gateway/app/orchestrator/negotiation.py", 'asyncio.timeout(OPPONENT_STREAM_BUDGET_S)', 'asyncio.timeout(3600)', PYTEST + ["services/gateway/tests/test_streaming.py", "-k", "total_stream_deadline"]),
    ("react-replay", "frontend/src/api/useNegotiation.ts", 'publishState(next);', 'publishState(prev => typeof change === "function" ? change(prev) : change);', HOOK),
    ("old-callbacks", "frontend/src/api/useNegotiation.ts", 'epoch === transportEpoch.current', 'true', HOOK),
    ("resume-busy", "frontend/src/api/useNegotiation.ts", 'state: msg.state,\n        busy: false,', 'state: msg.state,\n        busy: true,', HOOK),
    ("resume-history", "frontend/src/api/useNegotiation.ts", 'log: msg.resumed', 'log: false', HOOK),
    ("resume-hint", "frontend/src/api/useNegotiation.ts", 'filter(e => !(e.kind === "hint" && e.pending))', 'filter(() => true)', HOOK),
    ("disconnected-send", "frontend/src/api/useNegotiation.ts", 'prev.conn !== "online" || ', '', HOOK),
    ("voice-wait", "frontend/src/api/useNegotiation.ts", 'transcript: null, busy: true, phase: null,', 'transcript: null, busy: false, phase: null,', HOOK),
    ("resume-snapshot", "frontend/src/realtime/vendor/realtime-session.ts", '.then(created => this.onEvent(created))', '.then(() => {})', ["node", "--import", "tsx", "--test", "test/takeover.test.ts"]),
    ("unverified-ui", "frontend/src/components/ServerCertificate.tsx", 'useState<Attestation | null>(null)', 'useState<Attestation | null>(evidence ?? null)', ["node", "--import", "tsx", "--test", "test/attestation.test.ts"]),
]

failed = []
for name, relative, before, after, command in checks:
    if sys.argv[1:] and name not in sys.argv[1:]:
        continue
    path = ROOT / relative
    original = path.read_text()
    assert before in original, (name, "mutation anchor missing")
    try:
        path.write_text(original.replace(before, after))
        cwd = ROOT / "frontend" if "--import" in command else ROOT
        try:
            run = subprocess.run(command, cwd=cwd, env=ENV, text=True,
                                 stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=18)
            output = run.stdout
            caught = run.returncode != 0 and ("AssertionError" in output or "FAILED" in output)
        except subprocess.TimeoutExpired as exc:
            # Missing debrief is itself the failure; avoid hanging the mutation run.
            output = str(exc.stdout or "") + "\nMUTATION TEST TIMEOUT"
            caught = name == "resume-document"
        (OUT / (name + ".log")).write_text(output)
        print(name + ": " + ("CAUGHT" if caught else "NOT PROVEN"), flush=True)
        if not caught:
            failed.append(name)
    finally:
        path.write_text(original)
assert not failed, failed
