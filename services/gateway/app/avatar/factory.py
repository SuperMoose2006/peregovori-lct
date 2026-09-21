"""One registration point for optional video adapters; no paid default."""
import os
from typing import Callable
from app.avatar.base import AvatarProvider
from app.avatar.amplitude import AmplitudeAvatar
from app.avatar.presence import PresenceAvatar

_PROVIDERS: dict[str, Callable[..., AvatarProvider]] = {}


def register_provider(name: str, factory: Callable[..., AvatarProvider]) -> None:
    if not name or name in ('local', 'presence') or name in _PROVIDERS:
        raise ValueError('provider name must be unique and non-reserved')
    _PROVIDERS[name] = factory


def create_avatar(persona: str, publish: Callable[[dict], None], *, voice: bool) -> AvatarProvider:
    name = os.getenv('NEGO_AVATAR_PROVIDER', 'local')
    if voice and name in _PROVIDERS:
        try:
            provider = _PROVIDERS[name](persona, publish)
            caps = provider.capabilities()
            if caps.available and caps.lipsync and caps.lipsync_mode == 'video' and caps.transport == 'jpeg':
                return provider
        except Exception:
            pass
    return (AmplitudeAvatar if voice and name != 'presence' else PresenceAvatar)(persona, publish)
