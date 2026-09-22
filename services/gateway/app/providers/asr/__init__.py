"""Explicit ASR selection. An outage must never change the audio recipient."""
import os

from .base import ASRProvider, Transcript
from .openrouter import OpenRouterASR
from .parakeet import ParakeetASR


class DisabledASR(ASRProvider):
    def available(self):
        return False

    def describe(self):
        return "disabled (check NEGO_ASR; fallback: text)"

    async def transcribe(self, pcm, sample_rate, lang):
        raise RuntimeError("ASR disabled")


def voice_mode() -> str:
    # Mere presence of a cloud key is not consent to send microphone audio.
    return os.getenv("NEGO_VOICE", "classic").strip().lower() or "classic"


def make_asr() -> ASRProvider:
    choice = os.getenv("NEGO_ASR", "parakeet").strip().lower() or "parakeet"
    if choice in {"parakeet", "auto"}:  # legacy auto now means local only
        return ParakeetASR()
    if choice == "openrouter":
        return OpenRouterASR()
    return DisabledASR()


def describe_voice() -> str:
    mode = voice_mode()
    if mode == "classic":
        return f"classic: {make_asr().describe()}; fallback: text (no automatic cloud ASR)"
    if mode == "realtime":
        return "openai-realtime (explicit); fallback: text"
    return "disabled (check NEGO_VOICE); fallback: text"
