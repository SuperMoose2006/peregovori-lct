"""Живое видео собеседника от внешнего сервиса — адаптер, заглушка, настройки.

Карта пакета:

* `driver.py`  — узкий интерфейс одного сервиса (подключиться, звук или текст,
  кадры, замолчать, закрыться, обрыв событием);
* `adapter.py` — всё, что от сервиса не зависит: буфер звука и кадров, сторож,
  откат к рисованному портрету и возврат, переподключение;
* `voice.py`   — режим, где сервис говорит своим голосом, а наш синтез в запасе;
* `config.py`  — переменные окружения, проверка ключа, флаг включения;
* `stub.py`    — синтетический сервис без сети: весь путь в тестах и на демо;
* `vendors/`   — драйверы конкретных сервисов, по одному файлу на сервис.

Включение и выключение — docs/INTEGRATION_LIVE_VIDEO.md.
"""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional

from app.avatar.live import config as _config
from app.avatar.live.config import LiveVideoConfig


def _portrait(scenario_id: str) -> Optional[Path]:
    from app.avatar.testcard import _portrait_path
    return _portrait_path(scenario_id)


def create_live_avatar(scenario_id: str, publish: Callable[[dict], None], *,
                       cfg: Optional[LiveVideoConfig] = None, lang: str = "ru",
                       female: bool = True):
    """Лицо от внешнего сервиса, если он включён кредами. Иначе None.

    Никогда не бросает: любая ошибка сборки значит «видео нет, портрет как
    раньше». Сеть здесь не трогается — подключение начинается в `start()`.
    """
    cfg = _config.active(cfg)
    if cfg is None:
        return None
    try:
        from app.avatar.live.adapter import LiveVideoAvatar
        from app.avatar.live.driver import Persona

        spec = cfg.spec
        if spec is None:
            return None
        cls = _config.driver_class(spec)
        persona = Persona(scenario_id=scenario_id, lang=lang, female=female,
                          portrait=_portrait(scenario_id))
        # Лицо — по персонажу (`casting.py`), а не одно на всех.
        from dataclasses import replace
        from app.avatar.live.casting import face_for
        cfg = replace(cfg, avatar=face_for(cfg.vendor, scenario_id, female, explicit=cfg.avatar,
                                           path=cfg.casting))
        return LiveVideoAvatar(persona, publish, lambda: cls.from_env(cfg, persona), cfg)
    except Exception:
        import logging
        logging.getLogger("dialog.live_video").exception(
            "живое видео: драйвер не собрался — рисованный портрет")
        return None
