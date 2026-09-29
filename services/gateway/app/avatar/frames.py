"""Muted provider JPEGs: pts_ms is relative to the first PCM sample of generation_id."""
import base64
import math


def avatar_frame(jpeg: bytes, *, generation_id: str, pts_ms: float) -> dict:
    if not generation_id or not math.isfinite(pts_ms) or pts_ms < 0:
        raise ValueError('frame needs a generation and nonnegative audio timestamp')
    if len(jpeg) > 128000 or not jpeg.startswith(b'\xff\xd8') or not jpeg.endswith(b'\xff\xd9'):
        raise ValueError('frame must be a JPEG of at most 128000 bytes')
    return {'type': 'avatar.frame', 'generation_id': generation_id, 'pts_ms': pts_ms,
            'jpeg': base64.b64encode(jpeg).decode('ascii')}


def avatar_idle_frame(jpeg: bytes) -> dict:
    """Кадр лица между репликами: без поколения и без места в звуке.

    Клиент держит последний такой кадр и показывает его, пока реплика не
    звучит; кадры речи идут прежним `avatar_frame`.
    """
    if len(jpeg) > 128000 or not jpeg.startswith(b'\xff\xd8') or not jpeg.endswith(b'\xff\xd9'):
        raise ValueError('frame must be a JPEG of at most 128000 bytes')
    return {'type': 'avatar.frame', 'idle': True, 'jpeg': base64.b64encode(jpeg).decode('ascii')}
