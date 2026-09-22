"""Isolated loopback fault fixture. Never imported by production or deployed.

Real HTTP/WS/engine; model calls are deterministic offline fixtures. Registry
key exists only in this child process; data is temporary and is deleted on exit.
"""
import asyncio
import os
import secrets
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["NEGO_AI"] = "off"
os.environ["NEGO_JUDGE"] = "0"
os.environ["NEGO_HTTP_PASSWORD"] = ""
os.environ["NEGO_VOICE"] = "classic"
os.environ["NEGO_TURN_DETECT"] = "0"
from app.main import app
from app.providers.openrouter import chat
from app.session import store
from fastapi import Body
import uvicorn
from app.realtime import endpoint
from app.providers.asr.base import Transcript


class RecordedSpeechASR:
    def available(self): return True
    def describe(self): return "controlled test transcript, not live recognition"
    async def transcribe(self, pcm, sample_rate, lang):
        assert len(pcm) > 100 and sample_rate == 16000
        return Transcript("Что для вас важнее всего в этом контракте?")


endpoint.make_asr = RecordedSpeechASR
endpoint.EdgeTTS.available = lambda self: False
endpoint.OpenAISpeechTTS.available = lambda self: False

fault = {"hang": False}
chat.available = lambda: True


async def complete(*args, **kwargs):
    return None


async def stream(*args, **kwargs):
    if fault["hang"]:
        await asyncio.sleep(3600)
    raise RuntimeError("controlled offline model failure")
    yield ""


chat.complete = complete
chat.stream = stream


@app.post("/__test/fault")
def configure(hang: bool = Body(embed=True)):
    fault["hang"] = hang
    return fault


@app.get("/__test/state")
def state():
    return [{"turn": s.turn, "status": s.state.status} for s in store._sessions.values()]


if __name__ == "__main__":
    # main mounts its SPA fallback before this fixture adds its control routes.
    app.router.routes[:] = app.router.routes[-2:] + app.router.routes[:-2]
    with tempfile.TemporaryDirectory(prefix="dialog-attestation-rehearsal-") as directory:
        os.environ["NEGO_ATTESTATION_KEY"] = secrets.token_hex(32)
        os.environ["NEGO_ATTESTATION_DB"] = str(Path(directory) / "registry.sqlite")
        uvicorn.run(app, host="127.0.0.1", port=18212, access_log=False, log_level="warning")
