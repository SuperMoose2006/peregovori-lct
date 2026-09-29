# AUDIT-DEBT paid-video: provider contract exists; paid stream is not integrated/accepted. Requires owner account, key and budget. See docs/deep-audit-12206/CLEANUP.md.
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


def _accepted(provider: AvatarProvider) -> bool:
    caps = provider.capabilities()
    return caps.available and caps.lipsync and caps.lipsync_mode == 'video' and caps.transport == 'jpeg'


def create_avatar(persona: str, publish: Callable[[dict], None], *, voice: bool,
                  lang: str = 'ru', female: bool = True) -> AvatarProvider:
    name = os.getenv('NEGO_AVATAR_PROVIDER', 'local')
    factory = _factory_for(name) if voice else None
    if factory is not None:
        try:
            provider = factory(persona, publish)
            if _accepted(provider):
                return provider
        except Exception:
            pass
    # ЖИВОЕ ВИДЕО ВКЛЮЧАЮТ КРЕДЫ (`avatar/live/config.py`): названный сервис и
    # его ключ в окружении. Явное имя провайдера выше важнее — стенд и
    # зарегистрированные адаптеры остаются тем, что просили. Без голоса лицу
    # не на чем держаться, как и стенду. Без кредов `create_live_avatar`
    # возвращает None, не трогая ни сети, ни шины, — и ниже всё как было.
    if voice and name in ('', 'local'):
        from app.avatar.live import create_live_avatar
        live = create_live_avatar(persona, publish, lang=lang, female=female)
        if live is not None and _accepted(live):
            return live
    return (AmplitudeAvatar if voice and name != 'presence' else PresenceAvatar)(persona, publish)
