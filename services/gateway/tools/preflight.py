#!/usr/bin/env python
"""preflight.py — проверка перед показом. Одна команда, тридцать секунд.

ЗАЧЕМ. На площадке ломается не логика, а окружение: не собран фронтенд, не
подхватился ключ, не докачались картинки состояний, порт занят соседом. Всё это
видно за секунду — но только если знать, куда смотреть. Этот скрипт смотрит за
вас и говорит по-русски, что именно не так.

Ничего не чинит и ничего не меняет: только смотрит и печатает.

    make preflight                 # gateway должен быть поднят
    python tools/preflight.py --url http://127.0.0.1:8010
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GATEWAY = Path(__file__).resolve().parents[1]
OK, WARN, BAD = "  ✓", "  ⚠", "  ✗"

# Публичный стенд: имя из docs/hosting.md, переопределяется NEGO_STAND_URL.
# Пароль — только из окружения или .env, НИКОГДА из командной строки: строка
# запуска видна в `ps` любому пользователю коробки и оседает в истории оболочки.
STAND_DEFAULT = "https://185-154-194-88.nip.io"
CERT = GATEWAY / "certs" / "le-fullchain.pem"
CERT_WARN_DAYS, CERT_FAIL_DAYS = 21, 7

#: Фраза, которой прибор «говорит» в микрофон. Короткая (2.4 с) — за
#: распознавание платят по времени, — и это НАСТОЯЩИЙ ход: она обязана дойти до
#: движка, иначе проверка мерила бы распознавание в отрыве от игры.
VOICE_PROBE = "Что для вас важнее всего в этом контракте?"

#: Хвост тишины после фразы. Серверный VAD решает «человек договорил» по
#: ПРИШЕДШЕМУ звуку, а браузер микрофон не глушит никогда — оборвать поток на
#: последнем слове значит не дождаться конца хода и обвинить в этом продукт.
SILENCE_TAIL_S = 1.5

#: Кадр для модели зрения. ВЫБРАН ЗАМЕРОМ, а не наугад, и вот замер:
#:
#:     docs/screenshots/03-after-turn.png → «нет», ЛИЦО: нет
#:     mascots/karl/point.png             → «один персонаж указывает крылом»
#:     avatars/supplier/warm.webp         → «в кадре один человек, смотрит
#:                                          прямо в камеру», ЛИЦО: да
#:
#: На снимке интерфейса модель отвечает «ничего примечательного», `_look`
#: гасит пустое наблюдение и НИКАКОГО события не публикует. Проверка на таком
#: кадре измеряла бы задержку пустого ответа и краснела бы на исправном слое —
#: то есть ровно так, как уже трижды врали приборы этого репозитория. Портрет
#: оппонента даёт содержательный ответ на ОБА вопроса промпта (обстановка и
#: «покерфейс»), лежит в git и не меняется между машинами.
VISION_FRAME = ROOT / "frontend" / "public" / "avatars" / "supplier" / "warm.webp"

#: Сколько ждать наблюдения. Замер: взгляд занимает 1.2–1.7 с (docs/latency.md),
#: а сам слой обрывает вызов на `_LOOK_TIMEOUT_S` = 12 с. Ждём чуть дольше него,
#: чтобы отличить «модель молчит» от «прибор нетерпелив».
VISION_WAIT_S = 20.0

#: Сколько ждать хоть какого-нибудь события в голосовой проверке. Щедро:
#: голосовой ход — это распознавание, судья, реплика и синтез подряд.
VOICE_WAIT_S = 45.0

#: Сколько тишины на сокете считаем концом ответа ПОСЛЕ `response.done`.
#: Поколение живёт дольше текста (правило протокола 3): звук доигрывает уже
#: после того, как модель дописала, и оборвать чтение на `response.done`
#: значило бы не досчитать половину звука.
VOICE_IDLE_S = 2.0

problems: list[str] = []
warnings: list[str] = []


def fail(line: str) -> None:
    problems.append(line)
    print(f"{BAD} {line}")


def warn(line: str) -> None:
    warnings.append(line)
    print(f"{WARN} {line}")


def ok(line: str) -> None:
    print(f"{OK} {line}")


def _secret(key: str, default: str = "") -> str:
    """Значение из окружения, иначе из services/gateway/.env — как у гейтвея.

    preflight запускается без ключей в окружении (`make preflight` их не
    подставляет), а секреты по конвенции репозитория живут в .env и только там.
    """
    val = os.environ.get(key)
    if val:
        return val.strip()
    env = GATEWAY / ".env"
    if env.is_file():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith(f"{key}="):
                return line.split("=", 1)[1].strip()
    return default


def check_files() -> None:
    print("\nфайлы")
    dist = ROOT / "frontend" / "dist" / "index.html"
    if dist.is_file():
        assets = list((ROOT / "frontend" / "dist" / "assets").glob("index-*.js"))
        ok(f"фронтенд собран ({assets[0].name if assets else 'без бандла?'})")
    else:
        fail("frontend/dist не собран — `cd frontend && npm run build`")

    fonts = list((ROOT / "frontend" / "public").rglob("nunito-*.woff2"))
    ok(f"шрифт локально: {len(fonts)} файла") if fonts else warn(
        "шрифта Nunito нет локально — на площадке демо будет ждать сеть")

    avatars = ROOT / "frontend" / "public" / "avatars"
    states = sum(1 for _ in avatars.rglob("*.webp")) if avatars.is_dir() else 0
    ok(f"лица оппонентов: {states} картинок") if states >= 60 else warn(
        f"лиц оппонентов мало ({states}) — часть состояний покажет рисованный портрет")

    # СНИМКИ В ДОКУМЕНТАЦИИ СТАРЕЮТ МОЛЧА, и читает их не только человек:
    # .claude/agents/creative-director.md велит критику судить облик продукта по
    # этим PNG. Пока они показывали удалённый скин, часть визуального разбора
    # относилась к приложению, которого больше нет.
    shots = ROOT / "docs" / "screenshots"
    css = ROOT / "frontend" / "src" / "styles.css"
    if shots.is_dir() and css.is_file():
        look = css.stat().st_mtime
        stale = sorted(p.name for p in shots.glob("*.png") if p.stat().st_mtime < look)
        if stale:
            warn(f"снимков старше правки оформления: {len(stale)} "
                 f"({', '.join(stale[:3])}…) — `cd frontend && node probes/docshots.mjs`")
        else:
            ok(f"снимки в документации свежие: {len(list(shots.glob('*.png')))}")

    mascots = ROOT / "frontend" / "public" / "mascots"
    m = sum(1 for _ in mascots.rglob("*.png")) if mascots.is_dir() else 0
    ok(f"маскоты: {m} картинок") if m >= 8 else warn(f"маскотов мало ({m})")


def on_disk_build() -> dict:
    """Отпечаток кода НА ДИСКЕ — то, с чем сверяется живой процесс.

    ХЕШ КОДА ВАЖНЕЕ СЧЁТЧИКОВ, и вот почему. Первая редакция сверяла только
    число упражнений и столов, то есть СОДЕРЖИМОЕ. За день правок судьи,
    голоса, зрения и лицензионных шапок эти числа не изменились ни разу: 90 и 9.
    Проверка, поставленная ловить «шлюз отвечает вчерашним кодом», кода не
    видела вовсе и говорила «свежий».
    """
    sys.path.insert(0, str(GATEWAY))
    try:
        from app.course.bank import BANK as _BANK
        from app.engine.scenarios import SCENARIOS as _SC
        from app.main import _code_digest
    except Exception:  # noqa: BLE001
        return {}
    return {"exercises": len(_BANK), "scenarios": len(_SC), "code": _code_digest()}


def compare_build(build: dict, who: str) -> None:
    """Сверка отпечатка живого процесса с кодом на диске.

    ЗАЧЕМ ЭТО ЗДЕСЬ. Шлюз — долгоживущий процесс. Тот, что раздавал демо,
    крутился двое с половиной суток и отвечал кодом позавчерашнего дня: курс
    на диске знал упражнение, живой шлюз — нет. Перед показом это самая
    дорогая из возможных неожиданностей, и ловится она одним сравнением.
    """
    if not build:
        warn(f"{who} старый: /api/health не знает про build — перезапустите процесс")
        return
    disk = on_disk_build()
    if "code" not in build:
        warn(f"{who} старый: /api/health не знает про отпечаток кода — перезапустите процесс")
    stale = [k for k, v in disk.items() if k in build and build.get(k) != v]
    if stale:
        fail(f"{who.upper()} ОТВЕЧАЕТ СТАРЫМ КОДОМ: "
             + ", ".join(f"{k} у процесса {build.get(k)}, на диске {disk[k]}"
                         for k in stale)
             + " — перезапустите процесс")
    else:
        ok(f"{who} свежий: упражнений {build.get('exercises')}, "
           f"столов {build.get('scenarios')}, кампаний {build.get('campaigns')}, "
           f"код {build.get('code', '—')}")


def check_health(url: str) -> None:
    print("\nбэкенд")
    try:
        with urllib.request.urlopen(f"{url}/api/health", timeout=5) as r:
            data = json.loads(r.read())
    except (urllib.error.URLError, OSError, ValueError) as exc:
        fail(f"{url}/api/health не отвечает ({exc}) — поднят ли `make gateway`?")
        return

    ok(f"гейтвей отвечает: {url}")

    compare_build(data.get("build") or {}, "шлюз")
    if data.get("cloud_ai"):
        ok(f"облачный ИИ включён · оппонент: {data.get('models', {}).get('opponent', '—')}")
    else:
        warn("облачного ИИ нет — партия пойдёт на шаблонных репликах (это рабочий режим)")
    ok("судья по смыслу включён") if data.get("judge") else warn(
        "судья выключен — оценка аргумента пойдёт по ключевым словам")
    ok(f"синтез речи: {data.get('tts', '—')}")
    # Кто СЛУШАЕТ — не менее важно перед показом: запасной путь тоже работает,
    # но отвечает на три секунды дольше, и знать об этом надо заранее, а не по
    # затянувшейся паузе на сцене.
    ok(f"распознавание: {data.get('voice', '—')}")

    for path, key, name, least in (("/api/scenarios?lang=ru", "scenarios", "сценарии", 8),
                                   ("/api/campaigns?lang=ru", "campaigns", "кампании", 1)):
        try:
            with urllib.request.urlopen(f"{url}{path}", timeout=5) as r:
                payload = json.loads(r.read())
            items = payload.get(key, payload) if isinstance(payload, dict) else payload
            n = len(items)
        except Exception as exc:  # noqa: BLE001 — на площадке важна причина, а не тип
            fail(f"{name} не отдаются: {exc}")
            continue
        ok(f"{name}: {n}") if n >= least else fail(f"{name}: {n}, ожидалось хотя бы {least}")


def _plural(n: int) -> str:
    """«1 упражнение · 2 упражнения · 5 упражнений» — как и везде в продукте."""
    tens, ones = abs(n) % 100, abs(n) % 10
    if 11 <= tens <= 14:
        return "упражнений"
    return "упражнение" if ones == 1 else "упражнения" if 2 <= ones <= 4 else "упражнений"


def check_course() -> None:
    print("\nкурс")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    try:
        from app.course.bank import BANK
        from app.course.blocks import BLOCKS
        from app.course.master import MASTER
    except Exception as exc:  # noqa: BLE001
        fail(f"курс не импортируется: {exc}")
        return
    lessons = sum(len(b.lessons) for b in BLOCKS)
    ok(f"{len(BLOCKS)} блоков · {lessons} уроков · {len(BANK)} {_plural(len(BANK))} · "
       f"экзамен мастера из {len(MASTER)} партий")

    mirror = ROOT / "frontend" / "src" / "data" / "course.generated.ts"
    if not mirror.is_file():
        fail("зеркала курса для браузера нет — `python tools/sync_course.py`")
    elif f'"id": "{BANK[-1]["id"]}"' not in mirror.read_text(encoding="utf-8"):
        fail("зеркало курса устарело — `python tools/sync_course.py`")
    else:
        ok("зеркало курса синхронно")


def check_cert() -> None:
    """Сколько дней осталось у сертификата публичного стенда.

    ЗАЧЕМ. Продление РУЧНОЕ: `crontab -l` пуст, acme.sh задания себе не ставил,
    и docs/hosting.md об этом честно предупреждает — но предупреждение читает
    человек, а не прибор. День икс наступал молча: в одно утро демо просто
    перестанет открываться, и вместе с ним отвалятся микрофон и камера, потому
    что «мощные возможности» браузера живут не в HTTPS вообще, а в ДОВЕРЕННОМ
    HTTPS. Стоимость проверки — чтение локального файла, поэтому она в обычном
    прогоне, а не под флагом.

    Пороги: 21 день — предупреждение (окно продления Let's Encrypt уже открыто,
    пора), 7 дней — отказ (продление требует остановки гейтвея на 443, это
    планируемая работа, а не то, что делают за час до показа).
    """
    print("\nсертификат стенда")
    if not CERT.is_file():
        warn(f"сертификата нет: {CERT} — стенд стоит на самоподписанном, "
             "а на нём не работают ни микрофон, ни камера (docs/hosting.md)")
        return
    try:
        from cryptography import x509

        expires = x509.load_pem_x509_certificate(CERT.read_bytes()).not_valid_after_utc
    except ImportError:
        import subprocess

        try:
            out = subprocess.run(  # noqa: S603 — путь фиксирован, ввода нет
                ["openssl", "x509", "-in", str(CERT), "-noout", "-enddate"],
                capture_output=True, text=True, timeout=10, check=True).stdout
            expires = datetime.strptime(out.strip().split("=", 1)[1],
                                        "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        except Exception as exc:  # noqa: BLE001
            warn(f"срок сертификата не прочитан: {exc}")
            return
    except Exception as exc:  # noqa: BLE001
        warn(f"срок сертификата не прочитан: {exc}")
        return

    left = (expires - datetime.now(timezone.utc)).days
    when = expires.strftime("%d.%m.%Y")
    if left < CERT_FAIL_DAYS:
        fail(f"сертификат истекает через {left} дн. ({when}) — продлевать надо СЕЙЧАС: "
             "`acme.sh --renew --alpn --tlsport 443` при остановленном гейтвее "
             "(docs/hosting.md); просроченный сертификат уносит с собой голос и камеру")
    elif left < CERT_WARN_DAYS:
        warn(f"сертификату осталось {left} дн. ({when}) — продление РУЧНОЕ, "
             "cron его не сделает (docs/hosting.md)")
    else:
        ok(f"сертификат действует ещё {left} дн. (до {when})")


def check_stand() -> None:
    """Тот же отпечаток кода, но у процесса, который видит ЖЮРИ.

    ЗАЧЕМ ОТДЕЛЬНО. `preflight` сверял свежесть только с локальным :8010, а
    `probes/audit.mjs` — со своим шлюзом за :5199. Процесс на :443 не сверял
    никто, и однажды он четыре часа отдавал вчерашний курс (84 упражнения
    против 90) — нашлось это руками и случайно. Локальная зелень ничего не
    говорит о стенде: это разные процессы, поднятые в разное время.

    ПОД ФЛАГОМ, ПОТОМУ ЧТО ХОДИТ В СЕТЬ. Обычный `make preflight` обязан
    оставаться локальным и работать без сети. Запрос ровно один — /api/health.
    """
    print("\nпубличный стенд")
    url = _secret("NEGO_STAND_URL", STAND_DEFAULT).rstrip("/")
    password = _secret("NEGO_HTTP_PASSWORD")
    if not password:
        warn("NEGO_HTTP_PASSWORD не найден (окружение или services/gateway/.env) — "
             "стенд ответит 401")

    req = urllib.request.Request(f"{url}/api/health")
    if password:
        import base64

        token = base64.b64encode(f"dialog:{password}".encode()).decode()
        req.add_header("Authorization", f"Basic {token}")
    # МИМО ПРОКСИ. В песочнице разработки исходящий HTTP идёт через прокси, и он
    # отвечает 407 на публичный адрес — полдня это выглядело как «стенд просит
    # пароль и не принимает его» (см. probes/remote.mjs и его --no-proxy-server).
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=15) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as exc:
        fail(f"{url}/api/health отвечает {exc.code} "
             + ("— пароль не подошёл" if exc.code == 401 else f"({exc.reason})"))
        return
    except (urllib.error.URLError, OSError, ValueError) as exc:
        fail(f"стенд не отвечает: {url} ({exc}) — он и есть то, что увидит жюри")
        return

    ok(f"стенд отвечает: {url}")
    compare_build(data.get("build") or {}, "стенд")
    ok(f"на стенде синтез: {data.get('tts', '—')} · распознавание: {data.get('voice', '—')}")
    if not data.get("cloud_ai"):
        warn("на стенде нет облачного ИИ — партия пойдёт на шаблонных репликах")


def check_live_turn(url: str) -> None:
    """Один настоящий ход через настоящий протокол настоящей моделью.

    Всё остальное в этом файле проверяет, что части НА МЕСТЕ. Этот раздел
    проверяет, что они работают ВМЕСТЕ: сокет, ключ, модель, санитайзер,
    движок, судья. Отдельно ни одна проверка этого не покажет — а на площадке
    ломается именно связка, и узнавать об этом по молчащему экрану поздно.

    Опционален намеренно: он тратит настоящие запросы к моделям, а `make
    preflight` должен оставаться бесплатным и работать без сети.
    """
    print("\nживой ход")
    try:
        import asyncio
        import websockets
    except ImportError:
        warn("нет websockets — живой ход не проверен (pip install websockets)")
        return

    ws_url = url.replace("http://", "ws://").replace("https://", "wss://") + "/v1/realtime"

    async def play() -> tuple[str, dict]:
        async with websockets.connect(ws_url, open_timeout=10, close_timeout=5) as ws:
            await ws.send(json.dumps({"type": "session.init", "payload": {
                "mode": "text", "scenarioId": "supplier", "lang": "ru",
                "gameMode": "practice", "layers": {}}}))
            created, line, state = None, "", None
            deadline = asyncio.get_event_loop().time() + 60
            sent = False
            while asyncio.get_event_loop().time() < deadline:
                raw = await asyncio.wait_for(ws.recv(), timeout=30)
                ev = json.loads(raw)
                kind = ev.get("type")
                if kind == "session.created":
                    created = ev
                    await ws.send(json.dumps({"type": "input.append", "input": {
                        "text": "Ирина, что для вас важнее всего в этом контракте "
                                "и почему именно это?"}}))
                    await ws.send(json.dumps({"type": "input.commit"}))
                    sent = True
                elif kind == "engine.state":
                    state = ev.get("state") or ev.get("payload")
                elif kind == "response.done" and sent:
                    line = ev.get("text", "")
                    break
                elif kind == "error":
                    return "", {"error": ev}
            return line, {"created": created, "state": state}

    try:
        line, extra = asyncio.run(play())
    except Exception as exc:  # noqa: BLE001 — на площадке важна причина, а не тип
        fail(f"живой ход не прошёл: {exc}")
        return

    if extra.get("error"):
        fail(f"сервер ответил ошибкой: {extra['error']}")
        return
    if not line.strip():
        fail("оппонент не ответил — партия на площадке будет молчать")
        return

    ok(f"оппонент ответил ({len(line)} знаков): {line[:70]}…")
    st = extra.get("state") or {}
    if st:
        ok(f"движок посчитал ход: доверие {st.get('trust')}, "
           f"информация {st.get('info')}, ход {st.get('turn')}")
    else:
        warn("движок не прислал engine.state — проверьте оркестратор")


def check_full_game(url: str) -> None:
    """Партия до разбора: грейд, занавес над интересами, слово наставника.

    Разбор — это то, ради чего играют, и последнее, что видит жюри. Он собирает
    вместе всё сразу: движок посчитал счёт, судья наговорил по ходам, разборщик
    написал вердикт. Один ход этого не показывает: там ещё нет ни грейда, ни
    занавеса, ни наставника.
    """
    print("\nпартия до разбора")
    try:
        import asyncio
        import websockets
    except ImportError:
        warn("нет websockets — партия не проверена")
        return

    import time
    ws_url = url.replace("http://", "ws://").replace("https://", "wss://") + "/v1/realtime"
    # ЛИНИЯ БЕРЁТСЯ ИЗ ФИКСТУРЫ ЭТАЛОННЫХ ПАРТИЙ, А НЕ ПИШЕТСЯ ЗДЕСЬ.
    #
    # Прежде она была написана от руки «по мотивам» — и однажды перестала
    # закрывать сделку: правки лексикона и баланса до неё просто не доходили,
    # потому что её никто не проверял. Проверка ушла в красное на исправном
    # продукте, а я полдня искал дефект в движке.
    #
    # `frontend/test/fixtures/games.json` — тот самый набор, которым
    # tests/test_reference_games.py доказывает инвариант 2. Если он перестанет
    # закрывать сделку, это увидят и тесты, а не только площадка.
    fixture = (Path(__file__).resolve().parents[3]
               / "frontend" / "test" / "fixtures" / "games.json")
    try:
        lines = json.loads(fixture.read_text(encoding="utf-8"))["principled"]["supplier"]["ru"]
    except (OSError, KeyError, ValueError) as exc:
        fail(f"не читается фикстура эталонных партий: {exc}")
        return

    async def play() -> tuple[dict | None, float]:
        started = time.perf_counter()
        async with websockets.connect(ws_url, open_timeout=10, close_timeout=5) as ws:
            await ws.send(json.dumps({"type": "session.init", "payload": {
                "mode": "text", "scenarioId": "supplier", "lang": "ru",
                "gameMode": "practice", "layers": {}}}))
            queued = list(lines)
            while True:
                event = json.loads(await asyncio.wait_for(ws.recv(), timeout=120))
                kind = event.get("type")
                if kind == "debrief":
                    return event.get("debrief") or event.get("payload"), \
                           (time.perf_counter() - started) * 1000
                if kind in ("session.created", "response.done") and queued:
                    line = queued.pop(0)
                    await ws.send(json.dumps({"type": "input.append",
                                              "input": {"text": line}}))
                    await ws.send(json.dumps({"type": "input.commit"}))
                # Реплики кончились — ЖДЁМ разбор, а не выходим. Он приходит
                # ПОСЛЕ `response.done` последнего хода: сначала оппонент
                # дописывает реплику, и только потом закрывается партия. Первая
                # версия этой проверки выходила здесь же и объявляла исправную
                # партию незакрывшейся.

    try:
        debrief, ms = asyncio.run(play())
    except Exception as exc:  # noqa: BLE001
        fail(f"партия не доиграна: {exc}")
        return

    if not debrief:
        fail("разбор не пришёл — партия не закрылась пятью принципиальными ходами")
        return

    grade = debrief.get("grade")
    ok(f"разбор пришёл за {ms:.0f} мс: грейд {grade}, "
       f"экономика {debrief.get('economic')} · отношения {debrief.get('relationship')} · "
       f"техника {debrief.get('technique')}")
    found, total = debrief.get("interests_found"), debrief.get("interests_total")
    if found == total:
        ok(f"занавес: вскрыто интересов {found} из {total}")
    else:
        # ЭТО НЕ ОБЯЗАТЕЛЬНО ПОЛОМКА, но знать про это на сцене надо. Офлайн те
        # же реплики вскрывают все три (это утверждает tests/test_reference_games).
        # Вживую решает СУДЬЯ полем `interest_targeted`, и он может рассудить
        # иначе: та же линия — другой результат. Расхождение живого пути с
        # офлайновым не нарушает инвариант 8 (он про два движка, а судья — это
        # третий вход), но занавес в разборе покажет невскрытый интерес, и
        # объяснять это лучше заранее, чем на вопрос из зала.
        warn(f"занавес: вскрыто {found} из {total} — офлайн та же линия вскрывает все; "
             "вживую интерес выбирает судья, и он рассудил иначе")
    if grade in ("A", "B"):
        ok(f"инвариант 2 держится на живом пути: принципиальная игра → {grade}")
    else:
        fail(f"принципиальная игра дала {grade} — инвариант 2 обещает A или B")
    if debrief.get("ai_verdict"):
        ok("наставник высказался")
    else:
        warn("наставника нет — разбор покажет только детерминированные подсказки "
             "(это рабочий режим, но на сцене про него лучше знать)")


def check_custom_scenario(url: str) -> None:
    """«Своя сделка» — режим, который ломается тише всех.

    Он один раз ходит в модель за целым сценарием: позиции, ZOPA, персона, три
    скрытых интереса. Модель ответила не-JSON или думала слишком долго — режим
    просто не открывается, и узнать об этом на сцене хуже всего. Именно так
    однажды и было: «тяжёлая» модель тратила 142 секунды на две попытки и не
    давала ни одного валидного ответа.

    ЧЕРЕЗ СОКЕТ, А НЕ В ЭТОМ ПРОЦЕССЕ. Ключи лежат в services/gateway/.env, и
    гейтвей поднимается с ними; preflight запускается без них и в своём
    процессе получил бы честный `None` — то есть соврал бы про рабочий режим.
    Заодно так проверяется ровно тот путь, которым идёт человек.
    """
    print("\nсвоя сделка")
    try:
        import asyncio
        import websockets
    except ImportError:
        warn("нет websockets — «своя сделка» не проверена")
        return

    import time
    ws_url = url.replace("http://", "ws://").replace("https://", "wss://") + "/v1/realtime"

    async def generate() -> tuple[dict | None, float]:
        started = time.perf_counter()
        async with websockets.connect(ws_url, open_timeout=10, close_timeout=5) as ws:
            await ws.send(json.dumps({"type": "session.init", "payload": {
                "mode": "text", "scenarioId": "", "lang": "ru", "gameMode": "custom",
                "situation": "Я арендатор, хочу снизить ставку за офис, не съезжая.",
                "layers": {}}}))
            while True:
                event = json.loads(await asyncio.wait_for(ws.recv(), timeout=180))
                if event.get("type") == "session.created":
                    return event.get("scenario"), (time.perf_counter() - started) * 1000
                if event.get("type") == "error":
                    return None, (time.perf_counter() - started) * 1000

    try:
        scenario, ms = asyncio.run(generate())
    except Exception as exc:  # noqa: BLE001 — на площадке важна причина, а не тип
        fail(f"генерация не прошла: {exc}")
        return

    if not scenario:
        fail(f"сценарий не сгенерирован за {ms:.0f} мс — режим «своя сделка» не откроется")
        return
    ok(f"сценарий сгенерирован за {ms:.0f} мс: «{scenario.get('title', '—')}», "
       f"цель {scenario.get('target')} · красная линия {scenario.get('reservation')}")


# ---------------------------------------------------------------------------
# Живой голос и живое зрение
# ---------------------------------------------------------------------------
#
# ЗАЧЕМ ЭТО ВООБЩЕ ЗДЕСЬ. Тесты репозитория ВСЕГДА офлайн (`conftest.py`
# принудительно ставит `NEGO_AI=off`), и это правильно. Следствие неприятное:
# состояние «работает» у голоса и зрения не проверяет ничто, кроме моков.
# Мок доказывает, что мы правильно разобрали ОЖИДАЕМЫЙ ответ; он ничего не
# говорит про ключ, про сеть, про модель и про то, что слой вообще поднялся.
# Для судьи и партии дыру закрывает `--live`; эти две проверки закрывают её
# для двух слоёв, которые на площадке ломаются чаще всего.
#
# ЧТО ИМЕННО ДОКАЗЫВАЕТ НАБЛЮДАЕМЫЙ ПРИЗНАК — вопрос, который в этом
# репозитории приходится задавать каждому прибору: они врали шесть раз, и
# каждый раз ошибка ЛЬСТИЛА (чип камеры горел от кадра, который никто не
# смотрел; «одно обращение на 200 кадров» мерил тест, не сдвигавший часы).
# Поэтому здесь не годится ни «сессия открылась», ни «событие пришло»:
#
#   * голос: признак — ТЕКСТ ХОДА В `turn.analysis`. Он приходит из движка и
#     содержит ровно то, что движок получил. Мёртвое распознавание такого
#     признака не даёт: молчащая realtime-сессия оставляет ход неотправленным.
#     Сверх того слова сверяются со сказанными — постоянная строка от заглушки
#     совпадения не даст;
#   * синтез: признак — не «чанк пришёл», а АМПЛИТУДА и длительность звука.
#     Провайдер, вернувший тишину, отдал бы те же чанки;
#   * зрение: признак — ТЕКСТ НАБЛЮДЕНИЯ. `vision.observation` публикуется
#     только после успешного ответа модели, а пустой ответ («нет») события не
#     порождает вовсе — поэтому и кадр выбран замером, см. `VISION_FRAME`.


def _probe_speech(text: str) -> tuple[object, str]:
    """Синтезировать фразу для микрофона. Возвращает (int16 16 кГц, кем сказано).

    ЗАПИСИ ЧЕЛОВЕЧЕСКОЙ РЕЧИ В РЕПОЗИТОРИИ НЕТ, и заводить её ради этой
    проверки не стоит: браузерные приборы обходятся поддельным устройством
    (`--use-file-for-fake-audio-capture`), а wav в git — это мегабайты, которые
    никто не переслушает. Поэтому фраза синтезируется нашим же синтезом.

    ЧЕМ ЗА ЭТО ПЛАТИМ, И ЭТО НАДО ГОВОРИТЬ ВСЛУХ: проверка меряет ОБА конца
    сразу, и в красном состоянии виноватым может оказаться любой из двух.
    Поэтому генератор берётся ОТДЕЛЬНЫЙ от продуктового: сначала edge-tts
    (бесплатный, без ключа), а платный `gpt-4o-mini-tts` — только если edge не
    поднялся. Тогда голос, который слышит зритель, проверяется звуком,
    ПРИШЕДШИМ ОБРАТНО, а не тем, которым прибор говорил.
    """
    import asyncio

    sys.path.insert(0, str(GATEWAY))
    try:
        import numpy as np

        from app.providers.tts.base import Voice
        from app.providers.tts.edge import EdgeTTS
        from app.providers.tts.openai_speech import OpenAISpeechTTS
    except ImportError as exc:
        return None, f"нет зависимости: {exc}"

    # Ключ читается ИЗ .env В СВОЙ ПРОЦЕСС — так же, как его читает гейтвей.
    # В командную строку он не попадает: `ps` видна всей коробке.
    key = _secret("OPENAI_REALTIME_KEY")
    if key:
        os.environ.setdefault("OPENAI_REALTIME_KEY", key)

    async def synth(provider) -> object:
        raw = b""
        async for chunk in provider.stream(text, Voice(id="", lang="ru", female=False)):
            raw += chunk
        samples = np.frombuffer(raw, dtype=np.float32)
        if samples.size == 0:
            return None
        # 24 кГц float32 → 16 кГц int16: ровно тот формат, который ждёт
        # `input.append {audio}`. Так же приводит звук `tools/bench_latency.py`.
        resampled = np.interp(np.arange(0, samples.size, 24000 / 16000),
                              np.arange(samples.size), samples)
        return (np.clip(resampled, -1, 1) * 32767).astype(np.int16)

    problems_here: list[str] = []
    for provider, name in ((EdgeTTS(), "edge-tts"), (OpenAISpeechTTS(), "openai")):
        if not provider.available():
            problems_here.append(f"{name}: недоступен")
            continue
        try:
            pcm = asyncio.run(synth(provider))
        except Exception as exc:  # noqa: BLE001 — важна причина, а не тип
            problems_here.append(f"{name}: {exc}")
            continue
        if pcm is not None and pcm.size:
            return pcm, name
        problems_here.append(f"{name}: вернул ноль сэмплов")
    return None, "; ".join(problems_here)


def _why_exc(exc: BaseException) -> str:
    """Человекочитаемая причина. У `TimeoutError` пустой `str` — и отказ,
    собранный из одного `{exc}`, выходил НЕМЫМ: «кадр до модели зрения не
    дошёл: ». Проверка, которая не называет причину, на площадке бесполезна.
    """
    text = str(exc).strip()
    return text or type(exc).__name__


def _words(text: str) -> set[str]:
    """Слова длиннее трёх букв — по ним сверяется сказанное и услышанное.

    Короткие («что», «для», «в») выкинуты намеренно: они совпадают в любых двух
    русских фразах, и сверка по ним показывала бы сходство там, где его нет.
    """
    import re

    return {w for w in re.findall(r"\w+", (text or "").lower()) if len(w) > 3}


def check_live_voice(url: str) -> None:
    """Голос от края до края: наша фраза в микрофон → ход движка → звук ответа.

    ЧТО ПРОВЕРЯЕТСЯ ОДНИМ ПРОГОНОМ:
      1. сервер поднял микрофон (`capabilities.microphone`), а не нарисовал его;
      2. VAD услышал речь;
      3. распознавание вернуло СЛОВА, и это те слова, которые были сказаны;
      4. ход дошёл до движка — то есть инвариант 7 («голос и клавиатура дают
         один и тот же ход») держится на живом пути, а не только в тестах;
      5. синтез вернул НЕ ТИШИНУ.

    ПОД ФЛАГОМ, ПОТОМУ ЧТО ПЛАТНО: realtime-сессия распознавания, судья,
    реплика оппонента и синтез — четыре обращения к моделям за прогон.
    """
    print("\nживой голос")
    try:
        import asyncio
        import base64
        import time

        import numpy as np  # noqa: F401 — нужен _probe_speech и разбору звука
        import websockets
    except ImportError as exc:
        warn(f"нет зависимости ({exc}) — голос не проверен "
             "(`pip install -r requirements.txt`)")
        return

    pcm, generator = _probe_speech(VOICE_PROBE)
    if pcm is None:
        # Это отказ ПРИБОРА, а не продукта, и путать их нельзя: сказать «голос
        # сломан» там, где сломался генератор сигнала, — ровно то враньё, за
        # которым идут чинить исправное.
        warn(f"прибору нечем говорить в микрофон ({generator}) — голос НЕ ПРОВЕРЕН. "
             "Это отказ прибора, а не продукта: нужен либо выход в edge-tts, "
             "либо OPENAI_REALTIME_KEY в services/gateway/.env")
        return
    seconds = pcm.size / 16000
    ok(f"фраза для микрофона синтезирована ({generator}, {seconds:.1f} с): «{VOICE_PROBE}» — "
       "это ИНСТРУМЕНТ; продуктовый синтез проверяется звуком, пришедшим обратно")

    silence = np.zeros(int(16000 * SILENCE_TAIL_S), dtype=np.int16)
    signal = np.concatenate([pcm, silence])

    ws_url = url.replace("http://", "ws://").replace("https://", "wss://") + "/v1/realtime"
    seen: dict = {"caps": {}, "vad": False, "transcripts": [], "engine_text": "",
                  "state": None, "line": "", "audio": b"", "errors": [],
                  "turn_ms": None, "audio_ms": None}

    async def play() -> None:
        created = asyncio.Event()
        said_at = [0.0]

        async with websockets.connect(ws_url + "?mode=voice", open_timeout=10,
                                      close_timeout=5, max_size=16 * 1024 * 1024) as ws:
            await ws.send(json.dumps({"type": "session.init", "payload": {
                "mode": "voice", "scenarioId": "supplier", "lang": "ru",
                "gameMode": "practice", "layers": {"voice": True}}}))

            async def reader() -> None:
                while True:
                    # ЧАСЫ СНИМАЮТСЯ ПОСЛЕ `recv()`, а не в одном выражении с
                    # ним: `(perf_counter(), await ws.recv())` вычисляется слева
                    # направо, и каждое событие получало бы время ПРЕДЫДУЩЕГО.
                    # Так уже родился невозможный «VAD 0 мс» (docs/latency.md).
                    raw = await asyncio.wait_for(ws.recv(),
                                                 timeout=(VOICE_IDLE_S if seen["line"]
                                                          else VOICE_WAIT_S))
                    now = time.perf_counter()
                    ev = json.loads(raw)
                    kind = ev.get("type")
                    if kind == "session.created":
                        seen["caps"] = ev.get("capabilities") or {}
                        created.set()
                    elif kind == "user.speech.started":
                        seen["vad"] = True
                    elif kind == "user.transcript" and ev.get("text"):
                        seen["transcripts"].append(ev["text"])
                    elif kind == "turn.analysis":
                        seen["engine_text"] = ev.get("text") or ""
                        if seen["turn_ms"] is None and said_at[0]:
                            seen["turn_ms"] = (now - said_at[0]) * 1000
                    elif kind == "engine.state":
                        seen["state"] = ev.get("state") or ev.get("payload")
                    elif kind == "response.output.delta" and ev.get("kind") == "audio":
                        seen["audio"] += base64.b64decode(ev.get("audio") or "")
                        if seen["audio_ms"] is None and said_at[0]:
                            seen["audio_ms"] = (now - said_at[0]) * 1000
                    elif kind == "response.done":
                        seen["line"] = ev.get("text") or ""
                    elif kind == "error":
                        seen["errors"].append(ev.get("error") or ev)

            async def talk() -> None:
                # С ПОТОЛКОМ, а не «сколько угодно»: не ответивший на
                # `session.init` шлюз подвесил бы отправителя навсегда, и
                # проверка перед показом молчала бы две с половиной минуты.
                await asyncio.wait_for(created.wait(), timeout=VOICE_WAIT_S)
                if not seen["caps"].get("microphone"):
                    return
                step = 16000 * 120 // 1000
                for i in range(0, signal.size, step):
                    await ws.send(json.dumps({"type": "input.append", "input": {
                        "audio": base64.b64encode(signal[i:i + step].tobytes()).decode()}}))
                    # Темп реального времени: серверный VAD рассчитан на живой
                    # поток, и залп «всей фразой сразу» мерил бы не тот путь,
                    # которым идёт человек.
                    await asyncio.sleep(0.12)
                # Момент, когда прибор ЗАМОЛЧАЛ (без хвоста тишины): всё после
                # него — задержка системы, а не длина реплики. Он
                # РАССЧИТЫВАЕТСЯ, а не снимается таймером: пауза между
                # кусками (0.12 с) чуть длиннее самого куска, поэтому вычтенный
                # хвост тишины даёт отметку НЕМНОГО РАНЬШЕ настоящей — то есть
                # ошибка прибора здесь работает против него, а не льстит.
                said_at[0] = time.perf_counter() - SILENCE_TAIL_S

            pump = asyncio.create_task(reader())
            try:
                await talk()
                if not seen["caps"].get("microphone"):
                    # Микрофона нет — ждать нечего и незачем: без него ни одно
                    # из остальных событий не придёт, а прогон перед показом
                    # обязан отвечать быстро.
                    return
                # Реплика дописана и звук перестал идти — читатель выйдет по
                # своему короткому таймауту. Общий потолок держит `wait_for`.
                await pump
            except asyncio.TimeoutError:
                pass
            finally:
                pump.cancel()
                # CancelledError — это BaseException, и `suppress(Exception)`
                # его НЕ ловит: отказ «микрофона нет» вылетал наружу отменой
                # читателя и печатался как «голосовая партия не прошла» — то
                # есть прибор врал про причину, которую сам же знал.
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await pump
            with contextlib.suppress(Exception):
                await ws.send(json.dumps({"type": "session.close", "reason": "preflight"}))

    try:
        _run(play(), 150)
    except Exception as exc:  # noqa: BLE001 — на площадке важна причина, а не тип
        fail(f"голосовая партия не прошла: {_why_exc(exc)} — в голосовом режиме на площадке "
             "показывать нечего, играйте текстом и скажите об этом вслух")
        return

    caps = seen["caps"]
    if not caps:
        # Пустые возможности и «микрофона нет» — РАЗНЫЕ новости: во втором
        # случае шлюз ответил, в первом молчит вся партия, а не слой.
        detail = f" (ошибки: {seen['errors'][:1]})" if seen["errors"] else ""
        fail(f"шлюз не ответил на session.init{detail} — сокет открылся, а партия "
             "не началась; смотрите журнал гейтвея, это отказ не слоя, а сервера")
        return
    if not caps.get("microphone"):
        fail("сервер НЕ поднял микрофон (`capabilities.microphone` = false) — "
             "переключатель голоса в интерфейсе честно скажет «недоступно», но "
             "голосового показа не будет. Нужен OPENAI_REALTIME_KEY (быстрый путь) "
             "или OPENAI_API_KEY (запасной ASR через OpenRouter) в "
             "services/gateway/.env, и перезапуск гейтвея")
        return

    ok("сервер услышал речь (VAD)") if seen["vad"] else warn(
        "VAD не сказал «игрок заговорил» — звук до детектора дошёл, но речью "
        "не признан; проверьте громкость сигнала и NEGO_TURN_DETECT")

    heard = seen["engine_text"]
    if not heard:
        if seen["transcripts"]:
            fail(f"распознавание слышало «{seen['transcripts'][-1][:60]}», но ход до движка "
                 "НЕ ДОШЁЛ — микрофон будет печатать текст и не делать ходов. Смотрите "
                 "окно тишины NEGO_REALTIME_QUIET_MS и ожидание расшифровки "
                 "NEGO_REALTIME_ASR_GRACE_MS")
        else:
            detail = f" (ошибки сессии: {seen['errors'][:1]})" if seen["errors"] else ""
            fail("распознавание не вернуло НИ ОДНОГО слова — голосом сходить нельзя, "
                 f"партию придётся играть текстом{detail}. Проверьте OPENAI_REALTIME_KEY "
                 "в services/gateway/.env и сеть до api.openai.com")
        return

    said, got = _words(VOICE_PROBE), _words(heard)
    hit = len(said & got) / max(len(said), 1)
    if hit >= 0.5:
        ok(f"ход дошёл до движка ГОЛОСОМ: «{heard[:70]}» "
           f"(совпало {len(said & got)} из {len(said)} слов"
           + (f", ≈{seen['turn_ms']:.0f} мс от конца речи)" if seen["turn_ms"] else ")"))
    elif said & got:
        warn(f"распознано неточно: сказано «{VOICE_PROBE}», услышано «{heard[:70]}» — "
             f"совпало {len(said & got)} из {len(said)} слов. Ход движок получил, но "
             "на площадке говорите медленнее и ближе к микрофону")
    else:
        fail(f"распознано НЕ ТО: сказано «{VOICE_PROBE}», в движок ушло «{heard[:70]}» — "
             "голосовой ход будет случайным. Проверьте язык сессии и "
             "NEGO_REALTIME_ASR_MODEL")

    # `turn.analysis` доказывает, что до движка доехал ТЕКСТ; `engine.state` —
    # что ход ещё и ПОСЧИТАН. Разница не формальная: между ними стоит судья, и
    # партия, вставшая на нём, выглядит как разобранная реплика без хода.
    state = seen["state"] or {}
    if state:
        ok(f"движок посчитал голосовой ход: доверие {state.get('trust')}, "
           f"информация {state.get('info')}, ход {state.get('turn')}")
    else:
        warn("движок не прислал engine.state — реплику он разобрал, а ход не "
             "посчитал; смотрите судью и оркестратор")

    # ЗВУК: «чанк пришёл» ничего не доказывает — тишину провайдер отдал бы теми
    # же чанками. Смотрим на амплитуду и длину.
    audio = np.frombuffer(seen["audio"], dtype=np.float32) if seen["audio"] else np.array([])
    if audio.size == 0:
        fail("оппонент ответил текстом, но НЕ ЗАЗВУЧАЛ — в голосовом режиме зритель "
             "услышит тишину. Синтез: см. строку «синтез речи» выше; нет ключа — "
             "должен был подхватиться edge-tts, значит упал и он")
        return
    peak, dur = float(np.abs(audio).max()), audio.size / 24000
    if peak < 0.01:
        fail(f"синтез вернул ТИШИНУ ({dur:.1f} с звука, амплитуда {peak:.4f}) — "
             "чанки идут, слышно ничего не будет. Переключите синтез: "
             "NEGO_VOICE=classic (edge) или проверьте OPENAI_REALTIME_KEY")
    else:
        ok(f"оппонент прозвучал: {dur:.1f} с звука, амплитуда {peak:.2f}"
           + (f", первый звук ≈{seen['audio_ms']:.0f} мс от конца речи"
              if seen["audio_ms"] else "")
           + (f" · «{seen['line'][:50]}…»" if seen["line"] else ""))


def _probe_frame() -> tuple[str, str]:
    """Кадр из репозитория → base64 JPEG. Возвращает (кадр, чем он хорош).

    JPEG обязателен: `vision.py` подставляет кадр в `data:image/jpeg;base64,…`,
    и webp с этим ярлыком модель не примет. Уменьшение до 640 px — не экономия
    на качестве, а честность к каналу: столько же отдаёт браузер.
    """
    import base64
    import io

    try:
        from PIL import Image
    except ImportError:
        return "", "нет Pillow"
    if not VISION_FRAME.is_file():
        return "", f"нет файла {VISION_FRAME}"
    image = Image.open(VISION_FRAME).convert("RGB")
    image.thumbnail((640, 640))
    buf = io.BytesIO()
    image.save(buf, "JPEG", quality=82)
    return (base64.b64encode(buf.getvalue()).decode(),
            f"{VISION_FRAME.relative_to(ROOT)} — портрет: один человек лицом в камеру")


def check_live_vision(url: str) -> None:
    """Один кадр в модель зрения через настоящий сокет — и наблюдение обратно.

    ПОЧЕМУ ЧЕРЕЗ СОКЕТ, А НЕ ВЫЗОВОМ `VisionSampler` В СВОЁМ ПРОЦЕССЕ. Ключи
    живут в services/gateway/.env, и с ними поднимается ГЕЙТВЕЙ; preflight
    запускается без них. Вызов в своём процессе проверил бы чужое окружение —
    тот же довод, что у «своей сделки». Заодно так проверяется и то, что слой
    вообще поднялся: `capabilities.camera` приходит из `_wire`.

    ЧТО ЭТО ЛОВИТ. Камера — слой, у которого признак работы виден на экране
    (чип «камера»), а признак этот однажды горел от кадра, который никто не
    смотрел. Здесь наблюдаемый признак — ТЕКСТ, сказанный моделью про НАШ кадр.
    """
    print("\nживое зрение")
    try:
        import asyncio

        import websockets
    except ImportError as exc:
        warn(f"нет зависимости ({exc}) — зрение не проверено")
        return

    frame, about = _probe_frame()
    if not frame:
        warn(f"прибору нечего показать модели ({about}) — зрение НЕ ПРОВЕРЕНО. "
             "Это отказ прибора, а не продукта")
        return
    ok(f"кадр: {about}")

    ws_url = url.replace("http://", "ws://").replace("https://", "wss://") + "/v1/realtime"
    seen: dict = {"caps": {}, "observation": None, "tell": None, "errors": [],
                  "latency": None}

    async def look() -> None:
        async with websockets.connect(ws_url, open_timeout=10, close_timeout=5,
                                      max_size=16 * 1024 * 1024) as ws:
            await ws.send(json.dumps({"type": "session.init", "payload": {
                "mode": "text", "scenarioId": "supplier", "lang": "ru",
                "gameMode": "practice",
                # «Покерфейс» просят вместе с камерой намеренно: это ВТОРАЯ
                # строка того же ответа, лишнего вызова она не стоит, а на
                # показе чип «держит лицо» обещан вслух (docs/demo.md).
                "layers": {"camera": True, "pokerface": True}}}))
            deadline = asyncio.get_event_loop().time() + VISION_WAIT_S + 30
            while asyncio.get_event_loop().time() < deadline:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=VISION_WAIT_S)
                except asyncio.TimeoutError:
                    # МОЛЧАНИЕ — ЭТО ОТВЕТ, и разбирать его будет вызывающий.
                    # Раньше таймаут улетал наружу и печатался как «кадр до
                    # модели не дошёл», хотя кадр дошёл, а промолчала модель:
                    # прибор называл не ту причину и посылал чинить не то.
                    break
                ev = json.loads(raw)
                kind = ev.get("type")
                if kind == "session.created":
                    seen["caps"] = ev.get("capabilities") or {}
                    if not seen["caps"].get("camera"):
                        return
                    await ws.send(json.dumps({"type": "input.append", "input": {
                        "video_frames": [frame],
                        # Доля изменившихся проб. Первый кадр партии смотрится
                        # безусловно, но поле шлём как настоящий клиент.
                        "frame_change": 1.0}}))
                elif kind == "vision.observation":
                    seen["observation"] = ev.get("text") or ""
                    seen["latency"] = ev.get("latency_ms")
                    if not seen["caps"].get("pokerface") or seen["tell"] is not None:
                        break
                elif kind == "vision.tell":
                    seen["tell"] = bool(ev.get("expressive"))
                    if seen["observation"] is not None:
                        break
                elif kind == "error":
                    seen["errors"].append(ev.get("error") or ev)
            with contextlib.suppress(Exception):
                await ws.send(json.dumps({"type": "session.close", "reason": "preflight"}))

    try:
        _run(look(), 90)
    except Exception as exc:  # noqa: BLE001 — на площадке важна причина, а не тип
        fail(f"кадр до модели зрения не дошёл: {_why_exc(exc)}")
        return

    if not seen["caps"]:
        detail = f" (ошибки: {seen['errors'][:1]})" if seen["errors"] else ""
        fail(f"шлюз не ответил на session.init{detail} — сокет открылся, а партия "
             "не началась; это отказ не слоя, а сервера")
        return
    if not seen["caps"].get("camera"):
        fail("сервер НЕ поднял слой камеры (`capabilities.camera` = false) — "
             "переключатель в интерфейсе покажет «недоступно», кадры наружу не "
             "поедут вовсе. Нужен OPENAI_API_KEY (ключ OpenRouter) в "
             "services/gateway/.env и перезапуск гейтвея")
        return

    if seen["observation"]:
        ok(f"модель зрения посмотрела на кадр и сказала: «{seen['observation'][:90]}»"
           + (f" ({seen['latency']} мс)" if seen["latency"] else ""))
    elif seen["tell"] is not None:
        # Модель ОТВЕТИЛА (вторая строка про лицо пришла), но про обстановку
        # сказала «нет». Это другой диагноз: слой жив, а кадр перестал быть
        # содержательным — чинить надо прибор, а не сервер.
        fail("модель ответила про лицо, но про обстановку сказала «ничего "
             f"примечательного» — на кадре {VISION_FRAME.name} она отвечала "
             "содержательно, значит сменилась модель или промпт. Наблюдений в "
             "разборе не будет; проверьте NEGO_MODEL_VISION и выбор кадра "
             "(VISION_FRAME в этом файле)")
        return
    else:
        detail = f" (ошибки: {seen['errors'][:1]})" if seen["errors"] else ""
        fail("наблюдения НЕТ — слой камеры на площадке будет молчать, а молчащий "
             f"слой неотличим от сломанной камеры{detail}. Проверьте NEGO_MODEL_VISION "
             "и доступность OpenRouter; кадр заведомо содержательный "
             "(на нём модель отвечает про человека в кадре)")
        return

    if not seen["caps"].get("pokerface"):
        warn("«покерфейс» не поднялся — счётчик выдержки рядом с грейдом не появится")
    elif seen["tell"] is None:
        warn("модель не ответила на второй вопрос («ЛИЦО: да/нет») — счётчик "
             "«покерфейса» останется пустым. Это не «нет»: молчание модели и "
             "спокойное лицо — разные вещи (см. split_tell)")
    else:
        ok(f"«покерфейс» ответил: выражение на лице {'видно' if seen['tell'] else 'не видно'}")


def _run(coro, timeout: float):
    """Запустить корутину с общим потолком — чтобы прогон не завис на площадке."""
    import asyncio

    async def guarded():
        return await asyncio.wait_for(coro, timeout=timeout)

    return asyncio.run(guarded())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8010")
    parser.add_argument("--live", action="store_true",
                        help="сыграть один настоящий ход настоящей моделью "
                             "(тратит запросы, требует сеть)")
    parser.add_argument("--stand", action="store_true",
                        help="сверить ещё и публичный стенд (адрес NEGO_STAND_URL, "
                             "пароль NEGO_HTTP_PASSWORD — из окружения или .env)")
    parser.add_argument("--voice", action="store_true",
                        help="сказать фразу в микрофон и дослушать ответ вслух "
                             "(тратит запросы, требует сеть)")
    parser.add_argument("--vision", action="store_true",
                        help="показать модели зрения кадр и дождаться наблюдения "
                             "(тратит один запрос, требует сеть)")
    args = parser.parse_args()

    print("«Диалог» — проверка перед показом")
    check_files()
    check_health(args.url.rstrip("/"))
    check_course()
    check_cert()
    if args.stand:
        check_stand()
    if args.live:
        check_live_turn(args.url.rstrip("/"))
        check_custom_scenario(args.url.rstrip("/"))
        check_full_game(args.url.rstrip("/"))
    if args.voice:
        check_live_voice(args.url.rstrip("/"))
    if args.vision:
        check_live_vision(args.url.rstrip("/"))

    print()
    if problems:
        print(f"НЕ ГОТОВО: {len(problems)} проблем(ы). Показывать нельзя, пока не починено.")
        return 1
    if warnings:
        print(f"Готово с оговорками: {len(warnings)}. Демо пойдёт, но знайте про это.")
        return 0
    print("Готово. Можно показывать.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
