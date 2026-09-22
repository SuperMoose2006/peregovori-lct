"""Client of dialog-asr. No model weights or cloud fallback in the gateway."""
import os

import httpx
import numpy as np

from .base import ASRProvider, Transcript


class ParakeetASR(ASRProvider):
    def __init__(self):
        self.url = os.getenv("NEGO_ASR_URL", "http://127.0.0.1:8020").rstrip("/")
        self.timeout = float(os.getenv("NEGO_ASR_TIMEOUT_S", "20"))

    def available(self) -> bool:
        # Configured, not a health probe: retain the same provider on outages.
        # A subsequent utterance can retry it without restarting the session.
        return bool(self.url)

    def describe(self) -> str:
        return "parakeet (nvidia/parakeet-tdt-0.6b-v3, local)"

    async def transcribe(self, pcm: np.ndarray, sample_rate: int, lang: str) -> Transcript:
        if not pcm.size:
            return Transcript("")
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.url}/transcribe",
                content=np.ascontiguousarray(pcm, dtype="<f4").tobytes(),
                headers={"X-Sample-Rate": str(sample_rate),
                         "Content-Type": "application/octet-stream"},
            )
            response.raise_for_status()
            text = response.json()["text"]
            if not isinstance(text, str):
                raise ValueError("Invalid local ASR response")
            return Transcript(text.strip())
