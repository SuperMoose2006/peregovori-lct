"""config.py — настройки живого видео: схема, проверка и флаг включения.

ФЛАГ — ЭТО КРЕДЫ. Видео включается, только если назван сервис
(`NEGO_LIVE_VIDEO`) и для него лежит ключ (`NEGO_LIVE_VIDEO_KEY`). Нет ключа —
продукт ведёт себя ровно как без этого пакета: рисованный портрет с ртом по
громкости, ни одного нового события, ни одной строки в консоли браузера. Это
требование сдачи, а не удобство: промежуточная сдача идёт без ключа.

ПОЧЕМУ ДВЕ СТРОКИ, А НЕ ОДНА. Ключ сам по себе не говорит, чей он: форматы
ключей у сервисов не опубликованы и не различимы. Угадывать сервис по
посторонней переменной (`ANAM_API_KEY` в оболочке разработчика) опасно в
худшую сторону — видео включилось бы и тратило минуты без спроса. Поэтому имя
сервиса пишется явно, один раз, тем, кто сервис выбрал; ключ — тем, кто платил.

БИТЫЙ КЛЮЧ ГОВОРИТСЯ СЛОВАМИ. Проверка в два шага: без сети — формат (пробел
посередине, кавычки, кириллица, заглушка вида `...`, ключ OpenRouter не в той
строке), и при старте — один бесплатный запрос к сервису (`check_key`
драйвера), если сервис такой даёт. Отказ любого шага выключает видео для
процесса и пишет в лог, ЧТО не так и что сделать; партии идут с портретом.

`NEGO_AI=off` выключает и видео: это сетевой сервис, а офлайн-режим обязан быть
офлайн целиком. Заглушка (`stub`) сети не требует и работает всегда, но только
по явному имени — сама не выбирается никогда.
"""

from __future__ import annotations

import importlib
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Callable, Mapping, Optional

_log = logging.getLogger("dialog.live_video")

ENV_VENDOR = "NEGO_LIVE_VIDEO"
ENV_KEY = "NEGO_LIVE_VIDEO_KEY"
ENV_AVATAR = "NEGO_LIVE_VIDEO_AVATAR"
ENV_INPUT = "NEGO_LIVE_VIDEO_INPUT"
ENV_AV_DELAY = "NEGO_LIVE_VIDEO_AV_DELAY_MS"
ENV_STALL = "NEGO_LIVE_VIDEO_STALL_MS"
ENV_PTS_OFFSET = "NEGO_LIVE_VIDEO_PTS_OFFSET_MS"
ENV_FPS = "NEGO_LIVE_VIDEO_FPS"
ENV_SIZE = "NEGO_LIVE_VIDEO_SIZE"
ENV_CONNECT_TIMEOUT = "NEGO_LIVE_VIDEO_CONNECT_TIMEOUT_S"
ENV_MAX_FAILURES = "NEGO_LIVE_VIDEO_MAX_FAILURES"
ENV_SANDBOX = "NEGO_LIVE_VIDEO_SANDBOX"
ENV_STUB_FAIL = "NEGO_LIVE_VIDEO_STUB_FAIL_AFTER_S"
ENV_STUB_LATENCY = "NEGO_LIVE_VIDEO_STUB_LATENCY_MS"

#: Значения `NEGO_LIVE_VIDEO`, которые значат «выключено».
_OFF = {"", "off", "0", "no", "none", "false", "local"}

#: Порог молчания сервиса по умолчанию: лицо отстало от звучащего голоса на
#: полторы секунды речи — значит, кадров под эту речь уже не будет, и
#: человеку честнее показать рисованный рот, чем застывшую фотографию.
DEFAULT_STALL_MS = 1500
#: Кадров в секунду на провод. Сервисы отдают 25–40, но каждый кадр — это
#: 20–40 КБ base64 по сокету партии: 15 к/с держат губы читаемыми и
#: вдвое-втрое дешевле по трафику.
DEFAULT_FPS = 15.0
#: Сторона кадра, px. Лицо на сцене встречи — 280 px, в рельсе меньше.
DEFAULT_SIZE = 320
DEFAULT_CONNECT_TIMEOUT_S = 12.0
#: Сколько отказов за партию терпим, прежде чем вернуть портрет насовсем.
DEFAULT_MAX_FAILURES = 3


@dataclass(frozen=True)
class VendorSpec:
    """Запись реестра сервисов. Имя сервиса живёт ТОЛЬКО здесь и в драйвере."""

    name: str
    #: `module:Class` драйвера. Импорт ленивый: зависимости сервиса (WebRTC,
    #: SDK) ставятся только тем, кто этот сервис включил.
    target: str
    needs_key: bool = True
    inputs: tuple[str, ...] = ("audio",)
    #: Что сказать человеку про ключ этого сервиса, если формат не сошёлся.
    key_hint: str = ""
    #: Регулярка формата ключа, если сервис его публикует. Пусто — проверяется
    #: только общий формат (`_generic_key_problem`).
    key_pattern: str = ""
    #: Модули, без которых драйвер не поднимется, — для внятной ошибки при старте.
    requires: tuple[str, ...] = ()
    #: Без id лица сервис не работает, а стокового каталога у него нет.
    needs_avatar: bool = False


#: Реестр. Добавить сервис = одна запись здесь + файл драйвера.
VENDORS: dict[str, VendorSpec] = {
    "stub": VendorSpec(
        name="stub", target="app.avatar.live.stub:StubDriver", needs_key=False,
        inputs=("audio", "text")),
    "anam": VendorSpec(
        name="anam", target="app.avatar.live.vendors.anam:AnamDriver",
        inputs=("audio",), requires=("anam", "aiortc"),
        key_hint="ключ из lab.anam.ai → API keys"),
    "simli": VendorSpec(
        name="simli", target="app.avatar.live.vendors.simli:SimliDriver",
        inputs=("audio",), requires=("simli", "aiortc"), needs_avatar=True,
        key_hint="ключ из app.simli.com → API"),
    "liveavatar": VendorSpec(
        name="liveavatar", target="app.avatar.live.vendors.liveavatar:LiveAvatarDriver",
        inputs=("audio",), requires=("livekit", "websockets"),
        key_hint="ключ из app.liveavatar.com → API key"),
}


@dataclass(frozen=True)
class LiveVideoConfig:
    vendor: str = ""
    key: str = ""
    avatar: str = ""
    input: str = "audio"
    #: None — берётся заявленное драйвером (`DriverInfo.av_delay_ms`).
    av_delay_ms: Optional[int] = None
    stall_ms: int = DEFAULT_STALL_MS
    pts_offset_ms: int = 0
    fps: float = DEFAULT_FPS
    size: int = DEFAULT_SIZE
    connect_timeout_s: float = DEFAULT_CONNECT_TIMEOUT_S
    max_failures: int = DEFAULT_MAX_FAILURES
    stub_fail_after_s: Optional[float] = None
    stub_latency_ms: int = 0
    #: Бесплатная песочница сервиса, если он её даёт (LiveAvatar: сессия
    #: около минуты, своё тестовое лицо, кредиты не списываются).
    sandbox: bool = False
    #: Почему видео выключено при названном сервисе. Пусто — всё сошлось.
    errors: tuple[str, ...] = ()
    #: Что не так, но не мешает: неверное число заменено умолчанием.
    warnings: tuple[str, ...] = ()
    #: Ключа нет — это не ошибка, а выключенное состояние (сдача идёт без него).
    missing_key: bool = False

    @property
    def spec(self) -> Optional[VendorSpec]:
        return VENDORS.get(self.vendor)

    @property
    def enabled(self) -> bool:
        return bool(self.vendor) and not self.errors and not self.missing_key


# -------------------------------------------------------------- проверка ключа

_PLACEHOLDER = re.compile(
    r"^(?:\.{2,}|x{3,}|<.*>|\{.*\}|your[-_ ]?.*|changeme|todo|test|key|none|null)$",
    re.IGNORECASE)


def _generic_key_problem(key: str) -> Optional[str]:
    """Формат, общий для любых API-ключей. Возвращает фразу для человека."""
    if key != key.strip():
        return "в начале или в конце ключа пробел — скопируйте его заново без пробелов"
    if key[:1] in "\"'" or key[-1:] in "\"'":
        return "ключ в кавычках — уберите кавычки, `.env` их не требует"
    if any(ch.isspace() for ch in key):
        return "внутри ключа пробел или перенос строки — ключ вставлен не целиком или склеен"
    if _PLACEHOLDER.match(key) or "..." in key:
        return "вместо ключа стоит заглушка — впишите настоящий ключ сервиса"
    if not key.isascii() or not key.isprintable():
        return "в ключе не-ASCII символы (кириллица вместо латиницы?) — скопируйте ключ заново"
    if key.startswith(("sk-or-", "sk-proj-")):
        return ("это ключ OpenRouter/OpenAI, а не сервиса видео — "
                "им место в OPENAI_API_KEY / OPENAI_REALTIME_KEY")
    if len(key) < 16:
        return f"ключ слишком короткий ({len(key)} символов) — похоже, скопирован не целиком"
    if len(key) > 1024:
        return "ключ длиннее 1024 символов — похоже, вставлен лишний текст"
    return None


def key_problem(key: str, spec: Optional[VendorSpec]) -> Optional[str]:
    problem = _generic_key_problem(key)
    if problem:
        return problem
    if spec and spec.key_pattern and not re.fullmatch(spec.key_pattern, key):
        return f"формат ключа не похож на ключ {spec.name}" + (f" ({spec.key_hint})" if spec.key_hint else "")
    return None


# ------------------------------------------------------------------- загрузка

def _number(env: Mapping[str, str], name: str, default, lo, hi, warnings: list[str], cast=int):
    raw = (env.get(name) or "").strip()
    if not raw:
        return default
    try:
        value = cast(raw)
    except ValueError:
        warnings.append(f"{name}={raw!r} — не число, взято {default}")
        return default
    if not (lo <= value <= hi):
        warnings.append(f"{name}={raw} вне [{lo}, {hi}], взято {default}")
        return default
    return value


def load(env: Optional[Mapping[str, str]] = None) -> LiveVideoConfig:
    """Прочитать настройки. Никогда не бросает: ошибка — это поле `errors`."""
    env = os.environ if env is None else env
    vendor = (env.get(ENV_VENDOR) or "").strip().lower()
    key = env.get(ENV_KEY) or ""
    errors: list[str] = []
    warnings: list[str] = []

    if vendor in _OFF:
        if key.strip():
            warnings.append(f"{ENV_KEY} задан, а сервис не назван ({ENV_VENDOR}) — видео выключено")
        return LiveVideoConfig(warnings=tuple(warnings))

    spec = VENDORS.get(vendor)
    if spec is None:
        errors.append(f"{ENV_VENDOR}={vendor!r} — такого сервиса нет; известны: "
                      + ", ".join(sorted(VENDORS)))
        return LiveVideoConfig(vendor=vendor, errors=tuple(errors))

    missing_key = False
    if spec.needs_key:
        if not key.strip():
            # Нет ключа — выключено тихо: так идёт сдача, это не ошибка.
            missing_key = True
        else:
            problem = key_problem(key, spec)
            if problem:
                errors.append(f"{ENV_KEY}: {problem}")
            from app.providers import network_enabled
            if not network_enabled():
                errors.append("NEGO_AI=off — офлайн-режим, сетевой сервис видео не поднимается")
            if spec.needs_avatar and not (env.get(ENV_AVATAR) or "").strip():
                errors.append(f"{ENV_AVATAR} пуст — у {vendor} нет стокового каталога, "
                              "впишите id лица из кабинета сервиса")

    wanted = (env.get(ENV_INPUT) or "").strip().lower() or spec.inputs[0]
    if wanted not in ("audio", "text"):
        errors.append(f"{ENV_INPUT}={wanted!r} — бывает только audio или text")
    elif wanted not in spec.inputs:
        errors.append(f"{ENV_INPUT}={wanted}: {vendor} принимает только "
                      + " / ".join(spec.inputs))

    delay_raw = (env.get(ENV_AV_DELAY) or "").strip()
    av_delay = None
    if delay_raw:
        av_delay = _number(env, ENV_AV_DELAY, None, 0, 5000, warnings)

    fail_raw = (env.get(ENV_STUB_FAIL) or "").strip()
    stub_fail = _number(env, ENV_STUB_FAIL, None, 0.0, 3600.0, warnings, cast=float) if fail_raw else None

    return LiveVideoConfig(
        vendor=vendor,
        key=key.strip() if not errors else key,
        avatar=(env.get(ENV_AVATAR) or "").strip(),
        input=wanted,
        av_delay_ms=av_delay,
        stall_ms=_number(env, ENV_STALL, DEFAULT_STALL_MS, 200, 20000, warnings),
        pts_offset_ms=_number(env, ENV_PTS_OFFSET, 0, -2000, 2000, warnings),
        fps=_number(env, ENV_FPS, DEFAULT_FPS, 1.0, 60.0, warnings, cast=float),
        size=_number(env, ENV_SIZE, DEFAULT_SIZE, 64, 1024, warnings),
        connect_timeout_s=_number(env, ENV_CONNECT_TIMEOUT, DEFAULT_CONNECT_TIMEOUT_S,
                                  1.0, 120.0, warnings, cast=float),
        max_failures=_number(env, ENV_MAX_FAILURES, DEFAULT_MAX_FAILURES, 1, 100, warnings),
        stub_fail_after_s=stub_fail,
        stub_latency_ms=_number(env, ENV_STUB_LATENCY, 0, 0, 5000, warnings),
        sandbox=(env.get(ENV_SANDBOX) or "").strip().lower() in ("1", "on", "true", "yes"),
        errors=tuple(errors),
        warnings=tuple(warnings),
        missing_key=missing_key,
    )


# ------------------------------------------------------ состояние процесса

@dataclass
class _Status:
    """Что узнали о ключе при старте. Один на процесс."""

    #: Сервис отверг ключ — видео выключено до перезапуска с другим ключом.
    rejected: Optional[str] = None
    #: Итог проверки словами — для health и прибора.
    checked: Optional[str] = None
    extra: dict = field(default_factory=dict)


STATUS = _Status()


def active(cfg: Optional[LiveVideoConfig] = None) -> Optional[LiveVideoConfig]:
    """Настройки, если видео сейчас включено, иначе None. Единственный флаг."""
    cfg = cfg or load()
    if not cfg.enabled or STATUS.rejected:
        return None
    return cfg


def driver_class(spec: VendorSpec) -> Callable:
    module, _, name = spec.target.partition(":")
    return getattr(importlib.import_module(module), name)


def missing_modules(spec: VendorSpec) -> list[str]:
    missing = []
    for mod in spec.requires:
        try:
            importlib.import_module(mod)
        except Exception:
            missing.append(mod)
    return missing


def describe(cfg: Optional[LiveVideoConfig] = None) -> str:
    """Одна строка для `/api/health`: включено ли видео и почему нет."""
    cfg = cfg or load()
    if not cfg.vendor:
        return "off"
    if cfg.errors:
        return f"off: {cfg.errors[0]}"
    if cfg.missing_key:
        return f"off: нет ключа {ENV_KEY} ({cfg.vendor})"
    if STATUS.rejected:
        return f"off: {STATUS.rejected}"
    what = "синтетические кадры, не видео собеседника" if cfg.vendor == "stub" else "видео собеседника"
    voice = "голос наш" if cfg.input == "audio" else "голос сервиса"
    return f"{cfg.vendor} ({what}; вход {cfg.input}, {voice})"


async def startup_check(cfg: Optional[LiveVideoConfig] = None, *, timeout_s: float = 8.0) -> str:
    """Проверка при старте шлюза. Никогда не роняет процесс.

    Порядок: ошибки формата → недостающие модули → бесплатный запрос к сервису.
    Каждый отказ — одна строка в лог на русском: что сломано и что сделать.
    """
    import asyncio
    cfg = cfg or load()
    for warning in cfg.warnings:
        _log.warning("живое видео: %s", warning)
    if not cfg.vendor:
        STATUS.checked = "off"
        return STATUS.checked
    if cfg.errors:
        for problem in cfg.errors:
            _log.error("живое видео выключено: %s. До исправления — рисованный портрет.", problem)
        STATUS.checked = f"off: {cfg.errors[0]}"
        return STATUS.checked
    if cfg.missing_key:
        # Не ошибка: так идёт сдача. Одна спокойная строка, чтобы на стенде
        # было видно, что сервис назван и ждёт ключа.
        _log.info("живое видео: сервис %s назван, ключа нет — рисованный портрет", cfg.vendor)
        STATUS.checked = f"off: нет ключа ({cfg.vendor})"
        return STATUS.checked
    spec = cfg.spec
    assert spec is not None
    if not spec.needs_key:
        STATUS.checked = f"{cfg.vendor}: ключ не нужен — синтетические кадры без сети"
        _log.info("живое видео: %s", STATUS.checked)
        return STATUS.checked
    missing = missing_modules(spec)
    if missing:
        STATUS.rejected = (f"для {cfg.vendor} не установлены модули: {', '.join(missing)} — "
                           "pip install -r services/gateway/requirements-live-video.txt")
        _log.error("живое видео выключено: %s", STATUS.rejected)
        STATUS.checked = f"off: {STATUS.rejected}"
        return STATUS.checked
    try:
        check = getattr(driver_class(spec), "check_key", None)
    except Exception as exc:  # драйвер не импортируется — это тоже ответ
        STATUS.rejected = f"драйвер {cfg.vendor} не загрузился: {type(exc).__name__}: {exc}"
        _log.error("живое видео выключено: %s", STATUS.rejected)
        STATUS.checked = f"off: {STATUS.rejected}"
        return STATUS.checked
    if check is None:
        STATUS.checked = f"{cfg.vendor}: формат ключа в порядке; сервис проверки ключа не даёт"
        _log.info("живое видео: %s", STATUS.checked)
        return STATUS.checked
    try:
        verdict = await asyncio.wait_for(check(cfg), timeout=timeout_s)
    except asyncio.TimeoutError:
        # Сеть не ответила — ключ не отвергнут. Видео остаётся включённым:
        # партия сама вернёт портрет, если сервис так и не поднимется.
        STATUS.checked = f"{cfg.vendor}: проверка ключа не ответила за {timeout_s:g} с — видео включено, откат на портрет при отказе"
        _log.warning("живое видео: %s", STATUS.checked)
        return STATUS.checked
    except Exception as exc:
        from app.avatar.live.driver import DriverError
        if isinstance(exc, DriverError) and exc.fatal:
            STATUS.rejected = f"{cfg.vendor} отверг ключ: {exc}"
            _log.error("живое видео выключено: %s. Проверьте %s; до исправления — рисованный портрет.",
                       STATUS.rejected, ENV_KEY)
            STATUS.checked = f"off: {STATUS.rejected}"
            return STATUS.checked
        STATUS.checked = f"{cfg.vendor}: проверка ключа не удалась ({type(exc).__name__}: {exc}) — видео включено, откат на портрет при отказе"
        _log.warning("живое видео: %s", STATUS.checked)
        return STATUS.checked
    STATUS.checked = f"{cfg.vendor}: ключ принят — {verdict}"
    _log.info("живое видео: %s", STATUS.checked)
    return STATUS.checked
