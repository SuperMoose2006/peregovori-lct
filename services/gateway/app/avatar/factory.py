"""One registration point for optional video adapters; no paid default."""
import os
from typing import Callable
from app.avatar.base import AvatarProvider
from app.avatar.amplitude import AmplitudeAvatar
from app.avatar.presence import PresenceAvatar

_PROVIDERS: dict[str, Callable[..., AvatarProvider]] = {}


#: Имена, занятые встроенными реализациями. `testcard` — синтетический стенд
#: видеоконтура: он встроен, но включается только явным
#: `NEGO_AVATAR_PROVIDER=testcard` и в продукте сам не выбирается никогда.
_RESERVED = ('local', 'presence', 'testcard')


def register_provider(name: str, factory: Callable[..., AvatarProvider]) -> None:
    if not name or name in _RESERVED or name in _PROVIDERS:
        raise ValueError('provider name must be unique and non-reserved')
    _PROVIDERS[name] = factory


def _factory_for(name: str) -> Callable[..., AvatarProvider] | None:
    if name == 'testcard':
        from app.avatar.testcard import TestcardAvatar
        return TestcardAvatar
    return _PROVIDERS.get(name)


def create_avatar(persona: str, publish: Callable[[dict], None], *, voice: bool) -> AvatarProvider:
    name = os.getenv('NEGO_AVATAR_PROVIDER', 'local')
    factory = _factory_for(name) if voice else None
    if factory is not None:
        try:
            provider = factory(persona, publish)
            caps = provider.capabilities()
            if caps.available and caps.lipsync and caps.lipsync_mode == 'video' and caps.transport == 'jpeg':
                return provider
        except Exception:
            pass
    return (AmplitudeAvatar if voice and name != 'presence' else PresenceAvatar)(persona, publish)
