#!/usr/bin/env python
"""bench_load.py — сколько ОДНОВРЕМЕННЫХ ПАРТИЙ держит шлюз и что ломается первым.

Прибор для числа, которого не было. `limits.py` и `docs/hosting.md` утверждали,
что «сто двадцать сокетов с одного адреса держатся ровно», и повторить это было
нечем: команды, которой оно получено, в репозитории не существовало. Правило
«числа не правятся руками» держится не на дисциплине, а на том, что рядом лежит
прибор — как `tools/bench_latency.py` для задержек.

ЧЕМ ЭТОТ ПРИБОР ЛЕГЧЕ ВСЕГО ОБМАНУТЬСЯ (и как здесь этому мешают):

* **Открытый сокет — не партия.** Соединение, которое молчит, не стоит серверу
  почти ничего: ни движка, ни шины, ни писателя. Поэтому в счёт идут только
  сессии, дошедшие до `session.created`, — а главное число прогона это не
  сокеты, а ДОИГРАННЫЕ ХОДЫ.
* **Ход — не отправленное сообщение.** Считается только тот ход, на который
  пришёл `engine.state` с ОЖИДАЕМЫМ `turn_id`: движок сдвинулся, а не «сервер
  что-то ответил». Ход, оставшийся без ответа за `--turn-timeout`, засчитан не
  будет никогда — он попадает в потери.
* **«Держит 500» на петле не значит ничего**, если каждая сессия ничего не
  делает. Здесь каждая играет: `input.append` → `input.commit` → ожидание
  движка, и так `--turns` раз подряд.
* **Ломается не то, что мы смотрим.** Поэтому рядом с задержкой снимаются
  память шлюза (VmRSS), число его дескрипторов и потоков, его же потолок
  дескрипторов и свободная память МАШИНЫ. Вывод «что упёрлось первым» строится
  по этим числам, а не по ощущению.

БЕСПЛАТНО ПО УМОЛЧАНИЮ. `NEGO_AI=off` даёт полностью играбельную партию без
единого обращения к модели (инвариант 5), и пропускную способность СВОЕГО кода
мерить нужно именно так. Прибор проверяет это по `/api/health` и отказывается
стрелять по шлюзу с живыми моделями без `--paid`: залп в тысячу партий по
платному пути — это счёт, а не замер.

Запуск (шлюз уже поднят, офлайн):
    python tools/bench_load.py                        # лестница до 2048 партий
    python tools/bench_load.py --ramp 8,32,96 --turns 4
    python tools/bench_load.py --mode limits          # потолок партий — по проводу
    python tools/bench_load.py --mode pace            # темп ходов с адреса
    python tools/bench_load.py --mode room --room 20  # комната жюри за одним NAT
    python tools/bench_load.py --json > /tmp/load.json

ПРИБОР И ШЛЮЗ ДЕЛЯТ ОДНУ КОРОБКУ, и это не мелочь. На двух ядрах измеренная
задержка хода на верхних ступенях — это уже и планировщик клиента тоже. Ошибка
при этом ЗАВЫШАЕТ задержку, то есть не льстит; но чтобы её было видно, рядом с
долей ядра шлюза печатается доля ядра самого прибора (столбец «прибор»). Стали
близки к единице обе — верхним ступеням верить нельзя, разносите по машинам.

ПОЧЕМУ ПРЕДЕЛЫ ПРОВЕРЯЮТСЯ С 127.0.0.2, А НЕ С 127.0.0.1. `limits.LOCAL_HOSTS`
это ровно `{127.0.0.1, ::1, localhost}` — с петли пределов нет вовсе, и прогон
оттуда доказал бы только то, что исключение работает. 127.0.0.2 — такой же
локальный адрес для ядра (весь 127/8 наш), но для шлюза это уже «улица»:
`websocket.client.host` приходит из источника соединения. Так предел проверяется
НА ПРОВОДЕ, ничего не открывая наружу.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import statistics
import sys
import time
from pathlib import Path
from typing import Callable, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import websockets  # noqa: E402
from urllib.request import urlopen  # noqa: E402

from app.realtime import limits  # noqa: E402

#: Реплики хода. Разные — чтобы движок не считал повтор и партия шла как живая.
LINES = [
    "Здравствуйте. Скажите, что для вас важнее всего в этой сделке?",
    "Понимаю. А если мы возьмём часть работ на себя, вы сможете подвинуться?",
    "По рыночным данным медиана независимых прайсов ниже — давайте опираться на неё.",
    "Хорошо, тогда зафиксируем объём и вернёмся к цене.",
    "Мне важно закрыть это сегодня. Что мешает?",
    "Давайте так: цена ваша, сроки наши. Идёт?",
]

#: Тиков в секунде — из них считается процессорное время шлюза в /proc/pid/stat.
_TICKS = os.sysconf("SC_CLK_TCK")

#: Ниже этого свободной памяти на МАШИНЕ лестница обрывается сама. Уронить
#: машину прибором нагрузки — самый обидный способ ничего не измерить.
_MEM_FLOOR_MB = 250


# ---------------------------------------------------------------------------
# Наблюдение за шлюзом: /proc вместо psutil
# ---------------------------------------------------------------------------
#
# Зависимости ради трёх чисел не заводим: RSS, дескрипторы и потоки лежат в
# /proc, и читаются они дешевле, чем стоит новая строка в requirements.

def _find_gateway_pid(port: int) -> Optional[int]:
    """PID процесса, слушающего этот порт. None — не нашли (не Linux, не наш)."""
    inodes: set[str] = set()
    for name in ("tcp", "tcp6"):
        try:
            lines = Path(f"/proc/net/{name}").read_text().splitlines()[1:]
        except OSError:
            continue
        for line in lines:
            parts = line.split()
            if len(parts) < 10 or parts[3] != "0A":       # 0A = LISTEN
                continue
            try:
                if int(parts[1].split(":")[1], 16) == port:
                    inodes.add(parts[9])
            except (IndexError, ValueError):
                continue
    if not inodes:
        return None
    wanted = {f"socket:[{i}]" for i in inodes}
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            for fd in (entry / "fd").iterdir():
                if os.readlink(fd) in wanted:
                    return int(entry.name)
        except OSError:
            continue
    return None


class _Watch:
    """Снимок здоровья шлюза и машины. Всё, что можно спросить, не спрашивая."""

    def __init__(self, pid: Optional[int]) -> None:
        self.pid = pid
        self.fd_limit = self._fd_limit()

    def _fd_limit(self) -> Optional[int]:
        if self.pid is None:
            return None
        try:
            for line in Path(f"/proc/{self.pid}/limits").read_text().splitlines():
                if line.startswith("Max open files"):
                    value = line.split()[3]
                    return None if value == "unlimited" else int(value)
        except (OSError, IndexError, ValueError):
            return None
        return None

    def sample(self) -> dict:
        out: dict = {"rss_mb": None, "fds": None, "threads": None,
                     "cpu_s": None, "mem_available_mb": _mem_available_mb()}
        if self.pid is None:
            return out
        try:
            status = Path(f"/proc/{self.pid}/status").read_text()
            for line in status.splitlines():
                if line.startswith("VmRSS:"):
                    out["rss_mb"] = round(int(line.split()[1]) / 1024, 1)
                elif line.startswith("Threads:"):
                    out["threads"] = int(line.split()[1])
            out["fds"] = len(list(Path(f"/proc/{self.pid}/fd").iterdir()))
            # Процессорное время шлюза. Оно и отвечает на главный вопрос
            # прибора: цикл событий ОДИН, и когда его доля приближается к
            # единице целого ядра, растёт уже не память и не число сокетов, а
            # очередь на этом цикле — то есть задержка хода.
            stat = Path(f"/proc/{self.pid}/stat").read_text()
            fields = stat[stat.rfind(") ") + 2:].split()
            out["cpu_s"] = round((int(fields[11]) + int(fields[12])) / _TICKS, 2)
        except (OSError, IndexError, ValueError):
            pass
        return out


def _self_cpu_s() -> Optional[float]:
    """Процессорное время САМОГО ПРИБОРА.

    Прибор и шлюз делят одну машину и одно ядро. Когда клиент сам упирается в
    ядро, измеренная задержка хода — это уже и его планировщик тоже, и молчать
    об этом нельзя: это ровно тот случай, когда прибор начинает мерить себя и
    выдаёт результат за свойство сервера. Ошибка при этом ЗАВЫШАЕТ задержку —
    то есть в кои-то веки не льстит, — но знать её всё равно надо.
    """
    try:
        stat = Path("/proc/self/stat").read_text()
        fields = stat[stat.rfind(") ") + 2:].split()
        return (int(fields[11]) + int(fields[12])) / _TICKS
    except (OSError, IndexError, ValueError):
        return None


def _mem_available_mb() -> Optional[int]:
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) // 1024
    except (OSError, IndexError, ValueError):
        return None
    return None


# ---------------------------------------------------------------------------
# Одна партия
# ---------------------------------------------------------------------------

class _Result:
    """Что случилось с одной партией. Ни одно поле не подразумевается по
    умолчанию: не дошло до `session.created` — значит партии не было."""

    __slots__ = ("connected", "created", "turns", "turn_ms", "refused",
                 "failure", "connect_ms", "created_ms", "queue_events",
                 "close_code")

    def __init__(self) -> None:
        self.connected = False
        self.created = False
        self.turns = 0                     # ДОИГРАННЫХ ходов (движок сдвинулся)
        self.turn_ms: list[float] = []
        self.refused: Optional[str] = None  # код отказа сервера, если отказал
        self.failure: Optional[str] = None  # исключение/таймаут, если сорвалось
        self.connect_ms: Optional[float] = None
        self.created_ms: Optional[float] = None
        self.queue_events: list[str] = []
        self.close_code: Optional[int] = None


def ws_ticket(password: str) -> str:
    """Кука `dlg_ok` — та же, что ставит `main.py` после успешного пароля.

    Веб-сокет пароля в заголовке не получает (браузер его туда не шлёт), поэтому
    вход за паролем открывает именно она. Без этого прибор, наведённый на стенд,
    получал бы 403 ещё до рукопожатия — и честно рапортовал бы «ноль партий»,
    ничего не измерив.
    """
    import hashlib
    return hashlib.sha256(("dlg|" + password).encode()).hexdigest()[:32]


#: Заголовки соединения: пусто без пароля, кука с ним. Живёт модульно, потому
#: что через `_play` их пришлось бы тащить семью вызовами.
_HEADERS: dict[str, str] = {}


async def _play(url: str, *, turns: int, think: float, scenario: str,
                local_addr: Optional[tuple[str, int]], turn_timeout: float,
                #: Сколько ждать рукопожатия и `session.created`. Отдельно от
                #: `turn_timeout`: под нагрузкой в тысячу сокетов очередь на
                #: `accept` длинная, а ход после этого считается мгновенно.
                handshake_timeout: float = 60.0,
                start_barrier: Optional[asyncio.Event] = None,
                settled: Optional[Callable[[], None]] = None,
                hold: Optional[asyncio.Event] = None) -> _Result:
    """Сыграть партию по настоящему протоколу и рассказать, что дошло.

    Порядок ровно тот, что в ARCHITECTURE.md: `queue_done` → `session.init` →
    `session.created` → `input.append` → `input.commit` → `engine.state`.
    """
    res = _Result()
    started = time.perf_counter()
    kwargs: dict = {"max_size": 8 * 1024 * 1024, "open_timeout": 30,
                    "ping_interval": None, "close_timeout": 5}
    if _HEADERS:
        kwargs["additional_headers"] = dict(_HEADERS)
    if local_addr is not None:
        kwargs["local_addr"] = local_addr
    try:
        async with websockets.connect(url + "?mode=text", **kwargs) as ws:
            res.connected = True
            res.connect_ms = (time.perf_counter() - started) * 1000

            # Очередь. У шлюза её нет — `queue_done` уходит сразу; прибор всё
            # равно записывает ВСЕ события очереди, потому что «очереди нет»
            # это тоже результат замера, а не допущение.
            while True:
                event = json.loads(
                    await asyncio.wait_for(ws.recv(), timeout=handshake_timeout))
                kind = event.get("type", "")
                if kind.startswith("session.queue"):
                    res.queue_events.append(kind)
                if kind == "session.queue_done":
                    break
                if kind == "error":
                    res.refused = (event.get("error") or {}).get("code") or "error"
                    return res

            if start_barrier is not None:
                # Все партии начинают ход ОДНОВРЕМЕННО: рукопожатия ста сессий
                # растянуты по времени, и без общего старта первые успели бы
                # доиграть раньше, чем последние сядут за стол.
                await start_barrier.wait()

            await ws.send(json.dumps({"type": "session.init", "payload": {
                "scenarioId": scenario, "lang": "ru", "gameMode": "practice"}}))
            while True:
                event = json.loads(
                    await asyncio.wait_for(ws.recv(), timeout=handshake_timeout))
                kind = event.get("type")
                if kind == "session.created":
                    res.created = True
                    res.created_ms = (time.perf_counter() - started) * 1000
                    break
                if kind == "error":
                    res.refused = (event.get("error") or {}).get("code") or "error"
                    # ОТКАЗ ОБЯЗАН НАЗВАТЬСЯ КОДОМ ЗАКРЫТИЯ, а не оборвать связь
                    # молча: молчаливый разрыв клиент принимает за сеть и идёт
                    # переподключаться, превращая один отказ в поток. Дочитываем
                    # до закрытия, чтобы записать код, а не додумать его.
                    with contextlib.suppress(Exception):
                        await asyncio.wait_for(
                            ws.recv(), timeout=min(5.0, handshake_timeout))
                    res.close_code = ws.close_code
                    if settled is not None:
                        settled()
                    return res

            # ПРОВЕРКА ПОТОЛКА ТРЕБУЕТ, ЧТОБЫ ПАРТИИ БЫЛИ ЖИВЫ ОДНОВРЕМЕННО.
            # Без этой задержки партия успевала доиграть и отпустить место
            # раньше, чем следующая его попросит, — и предел «на одновременные»
            # проверялся бы на последовательных. Ровно та лесть, ради которой
            # прибор и написан.
            if settled is not None:
                settled()
            if hold is not None:
                await hold.wait()

            for i in range(turns):
                if think:
                    await asyncio.sleep(think)
                expected = res.turns + 1
                sent = time.perf_counter()
                await ws.send(json.dumps({"type": "input.append",
                                          "input": {"text": LINES[i % len(LINES)]}}))
                await ws.send(json.dumps({"type": "input.commit"}))
                closed = False
                while True:
                    try:
                        event = json.loads(
                            await asyncio.wait_for(ws.recv(), timeout=turn_timeout))
                    except asyncio.TimeoutError:
                        res.failure = res.failure or "ход без ответа"
                        break
                    kind = event.get("type")
                    if kind == "engine.state" and event.get("turn_id") == expected:
                        # ВОТ ЭТО и есть доигранный ход: движок сдвинулся ровно
                        # на один и сказал об этом своим событием.
                        res.turns += 1
                        res.turn_ms.append((time.perf_counter() - sent) * 1000)
                        closed = bool(event.get("closed"))
                        break
                    if kind == "error":
                        res.failure = (event.get("error") or {}).get("code") or "error"
                        break
                    if kind == "session.closed":
                        res.failure = "сервер закрыл партию"
                        break
                if res.failure or closed:
                    break

            await ws.send(json.dumps({"type": "session.close", "reason": "bench"}))
    except asyncio.TimeoutError:
        res.failure = res.failure or "таймаут"
    except OSError as exc:
        res.failure = f"сеть: {type(exc).__name__}"
    except Exception as exc:                      # noqa: BLE001 — прибор не падает
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status == 403:
            # Уник uvicorn: приложение закрыло сокет ДО `accept`, и рукопожатие
            # отвечает 403. У нас это ровно одно — пароль (`ws_allowed`).
            res.failure = "403: сокет закрыт до рукопожатия (пароль? --password)"
            return res
        code = getattr(exc, "code", None)
        if code is not None:
            res.close_code = int(code)
            res.failure = res.failure or f"закрыт кодом {code}"
        else:
            res.failure = res.failure or f"{type(exc).__name__}"
    return res


# ---------------------------------------------------------------------------
# Ступень лестницы
# ---------------------------------------------------------------------------

def _pct(values: list[float]) -> dict:
    if not values:
        return {}
    ordered = sorted(values)
    return {
        "n": len(ordered),
        "median": round(statistics.median(ordered)),
        "p95": round(ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))]),
        "max": round(ordered[-1]),
    }


async def _rung(url: str, n: int, *, turns: int, think: float, scenario: str,
                local_addr: Optional[tuple[str, int]], watch: _Watch,
                turn_timeout: float, mem_floor: int = _MEM_FLOOR_MB) -> dict:
    """Одна ступень: n партий одновременно, каждая играет `turns` ходов."""
    before = watch.sample()
    # Пик набирается ПО ХОДУ прогона, а не по снимкам «до» и «после». Замер по
    # краям систематически льстит: и память, и дескрипторы возвращаются к норме
    # раньше, чем последняя партия договорит.
    peak = dict(before)

    def _absorb(now: dict) -> None:
        for key in ("rss_mb", "fds", "threads", "cpu_s"):
            if now[key] is not None and (peak.get(key) is None or now[key] > peak[key]):
                peak[key] = now[key]
        if now["mem_available_mb"] is not None:
            known = peak.get("mem_available_mb")
            peak["mem_available_mb"] = min(known, now["mem_available_mb"]) \
                if known is not None else now["mem_available_mb"]

    aborted: list[str] = []

    async def _sample_forever() -> None:
        """Заодно СТОРОЖ МАШИНЫ: уронить её прибором нагрузки — самый обидный
        способ ничего не измерить, и заметить это надо посреди ступени, а не
        перед следующей."""
        while True:
            now = watch.sample()
            _absorb(now)
            free = now["mem_available_mb"]
            if free is not None and free < mem_floor:
                aborted.append(f"свободной памяти {free} МБ < порога {mem_floor}")
                for task in tasks:
                    task.cancel()
                return
            await asyncio.sleep(0.3)

    barrier = asyncio.Event()
    tasks = [asyncio.create_task(_play(url, turns=turns, think=think,
                                       scenario=scenario, local_addr=local_addr,
                                       turn_timeout=turn_timeout,
                                       start_barrier=barrier))
             for _ in range(n)]
    sampler = asyncio.create_task(_sample_forever())
    # Даём всем дойти до `queue_done`, потом отпускаем разом.
    await asyncio.sleep(min(3.0, 0.02 * n + 0.3))
    barrier.set()

    # Окно процессорного времени открывается ЗДЕСЬ, а не в начале ступени:
    # рукопожатия пятисот сокетов тоже стоят процессору, но идут до старта, и
    # приписывать их игре значило бы завысить долю ядра на коротких ступенях.
    cpu_before = watch.sample()
    self_cpu_before = _self_cpu_s()
    started = time.perf_counter()
    gathered = await asyncio.gather(*tasks, return_exceptions=True)
    results: list[_Result] = [r for r in gathered if isinstance(r, _Result)]
    wall = time.perf_counter() - started
    sampler.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await sampler
    after = watch.sample()
    _absorb(after)

    latencies = [ms for r in results for ms in r.turn_ms]
    refusals: dict[str, int] = {}
    failures: dict[str, int] = {}
    for r in results:
        if r.refused:
            refusals[r.refused] = refusals.get(r.refused, 0) + 1
        if r.failure:
            failures[r.failure] = failures.get(r.failure, 0) + 1
    return {
        "sessions_asked": n,
        "connected": sum(r.connected for r in results),
        "created": sum(r.created for r in results),
        "turns_asked": n * turns,
        "turns_played": sum(r.turns for r in results),
        "refusals": refusals,
        "failures": failures,
        "queue_events": sorted({e for r in results for e in r.queue_events}),
        "aborted": aborted[0] if aborted else None,
        "handshake_ms": _pct([r.connect_ms for r in results if r.connect_ms]),
        "created_ms": _pct([r.created_ms for r in results if r.created_ms]),
        "turn_ms": _pct(latencies),
        "wall_s": round(wall, 2),
        # Доля ядра, которую шлюз сжёг за прогон. Единица — цикл событий занят
        # целиком, и дальше растёт только очередь к нему.
        # Доля ядра считается только на ступени длиннее секунды: тик
        # процессорного времени грубый, и на прогоне в двадцать миллисекунд
        # частное «тик / окно» даёт красивое, но бессмысленное число — а
        # бессмысленное число прибор потом честно называет пределом.
        "bench_cpu_share": (
            round((_self_cpu_s() - self_cpu_before) / wall, 2)
            if wall >= 1.0 and self_cpu_before is not None and _self_cpu_s() is not None
            else None),
        "gateway_cpu_share": (
            round((after["cpu_s"] - cpu_before["cpu_s"]) / wall, 2)
            if wall >= 1.0 and cpu_before.get("cpu_s") is not None
            and after.get("cpu_s") is not None
            else None),
        "turns_per_s": round(sum(r.turns for r in results) / wall, 1) if wall else None,
        "gateway": {"before": before, "peak": peak, "after": after},
    }


# ---------------------------------------------------------------------------
# Режимы прогона
# ---------------------------------------------------------------------------

async def run_ramp(args, watch: _Watch) -> dict:
    """Лестница: сколько партий шлюз держит, не отказывая и не роняя."""
    rungs: list[dict] = []
    local = (args.source, 0) if args.source else None
    for n in args.ramp:
        free = _mem_available_mb()
        if free is not None and free < args.mem_floor:
            print(f"  ступень {n}: пропущена — свободной памяти {free} МБ "
                  f"< порога {args.mem_floor}", flush=True)
            break
        print(f"  ступень {n:>4} партий × {args.turns} ходов…", end=" ", flush=True)
        rung = await _rung(args.url, n, turns=args.turns, think=args.think,
                           scenario=args.scenario, local_addr=local, watch=watch,
                           turn_timeout=args.turn_timeout, mem_floor=args.mem_floor)
        rungs.append(rung)
        print(f"создано {rung['created']}/{n}, ходов {rung['turns_played']}"
              f"/{rung['turns_asked']}, медиана хода "
              f"{rung['turn_ms'].get('median', '—')} мс, RSS "
              f"{rung['gateway']['peak']['rss_mb']} МБ", flush=True)
        # Сокеты закрываются асинхронно; следующей ступени нужен чистый старт,
        # иначе она померит хвост предыдущей.
        await asyncio.sleep(args.settle)
        if rung["aborted"]:
            print(f"  лестница оборвана сторожем: {rung['aborted']}", flush=True)
            break
        if rung["created"] < n or rung["turns_played"] < rung["turns_asked"]:
            print("  дальше не идём: на этой ступени уже есть потери", flush=True)
            break
    return {"rungs": rungs, "verdict": _verdict(rungs, watch)}


def _verdict(rungs: list[dict], watch: _Watch) -> dict:
    """Что упёрлось ПЕРВЫМ. Не мнение, а разбор чисел ступеней."""
    if not rungs:
        return {"held": 0, "first_limit": "прогона не было"}
    held = 0
    for rung in rungs:
        if (rung["created"] == rung["sessions_asked"]
                and rung["turns_played"] == rung["turns_asked"]):
            held = max(held, rung["sessions_asked"])
    broken = next((r for r in rungs
                   if r["created"] < r["sessions_asked"]
                   or r["turns_played"] < r["turns_asked"]), None)
    # «Верх» — последняя ступень, которая ИГРАЛА. Оборванная сторожем ступень
    # ничего не измерила, и брать её задержку (её нет) значило бы печатать
    # прочерк там, где читатель ждёт число.
    top = next((r for r in reversed(rungs) if r["turns_played"]), rungs[-1])
    peak = top["gateway"]["peak"]
    reasons: list[str] = []
    if broken:
        if broken["refusals"]:
            reasons.append("предел на адрес: " + ", ".join(
                f"{k}×{v}" for k, v in broken["refusals"].items()))
        if broken["failures"]:
            reasons.append("потери: " + ", ".join(
                f"{k}×{v}" for k, v in broken["failures"].items()))
    # ЦИКЛ СОБЫТИЙ ОДИН. Пока он не занят целиком, «предел» — это чья-то
    # догадка; когда занят, дальше растёт очередь к нему, то есть задержка
    # хода, и никакие дескрипторы с памятью тут ни при чём.
    share = top.get("gateway_cpu_share")
    if share is not None and share >= 0.75:
        reasons.append(f"цикл событий: шлюз сжёг {share} ядра при "
                       f"{top['sessions_asked']} партиях, медиана хода "
                       f"{top['turn_ms'].get('median')} мс")
    if watch.fd_limit and peak["fds"] and peak["fds"] > watch.fd_limit * 0.8:
        reasons.append(f"дескрипторы: {peak['fds']} из {watch.fd_limit}")
    aborted = next((r["aborted"] for r in rungs if r.get("aborted")), None)
    if aborted:
        # Память МАШИНЫ, а не шлюза: прибор и шлюз делят одну коробку, и на
        # четырёх гигабайтах первым кончается именно она. Приписать это шлюзу
        # значило бы обвинить его в аппетите прибора.
        reasons.append(f"память машины (прибор и шлюз на одной коробке): {aborted}")
    return {
        "held": held,
        "first_limit": reasons[0] if reasons else "ничего не сломалось на этой лестнице",
        "all_signals": reasons,
        "cpu_share_at_top": share,
        "rss_mb_at_top": peak["rss_mb"],
        "fds_at_top": peak["fds"],
        "fd_limit": watch.fd_limit,
        "sessions_at_top": top["sessions_asked"],
        "turn_median_ms_at_top": top["turn_ms"].get("median"),
        "sessions_at_bottom": rungs[0]["sessions_asked"],
        "turn_median_ms_at_bottom": rungs[0]["turn_ms"].get("median"),
        #: Цена одной лишней одновременной партии в миллисекундах хода. Наклон,
        #: а не пара точек: по нему видно, что задержка растёт ЛИНЕЙНО — один
        #: цикл событий обслуживает партии по очереди.
        "ms_per_session": round(
            (top["turn_ms"].get("median", 0) - rungs[0]["turn_ms"].get("median", 0))
            / max(1, top["sessions_asked"] - rungs[0]["sessions_asked"]), 2),
    }


async def run_limits(args, watch: _Watch) -> dict:
    """Пределы `limits.py` — по проводу, а не вызовом функции из тестов.

    Четыре вопроса, и все — про поведение сервера, а не про содержимое модуля:

    1. срабатывает ли потолок партий на адрес и называет ли отказ причину;
    2. НЕ СЪЕДАЕТ ли отказанная попытка место — иначе предел ел бы сам себя, и
       комната, поймавшая отказ, не смогла бы доиграть уже начатое;
    3. нельзя ли обойти потолок переоткрытием соединения (вёдра живут в модуле
       и ключуются адресом, но проверять это надо на проводе);
    4. возвращается ли место после честного `session.close`.

    Пятое — темп ходов — меряется отдельно (`--mode pace`): в офлайне
    `turn_delay` выключен по построению, и молча выдавать его молчание за
    «предел работает» нельзя.
    """
    source = args.source or "127.0.0.2"
    local = (source, 0)
    cap, extra = args.cap, 4
    print(f"  адрес {source}: {cap + extra} партий одновременно при потолке {cap}…",
          flush=True)

    # 1–2. Потолок. Все партии живут ОДНОВРЕМЕННО: `hold` не даёт первой
    # доиграть и отпустить место раньше, чем последняя его попросит.
    barrier, hold = asyncio.Event(), asyncio.Event()
    arrived = 0

    def _settled() -> None:
        nonlocal arrived
        arrived += 1

    holders = [asyncio.create_task(
        _play(args.url, turns=1, think=0.0, scenario=args.scenario,
              local_addr=local, turn_timeout=args.turn_timeout,
              start_barrier=barrier, settled=_settled, hold=hold))
        for _ in range(cap + extra)]
    await asyncio.sleep(1.0)
    barrier.set()
    deadline = time.perf_counter() + 30
    while arrived < cap + extra and time.perf_counter() < deadline:
        await asyncio.sleep(0.05)

    # 3. Пока потолок выбран, ещё одно СВЕЖЕЕ соединение с того же адреса —
    #    именно то, чем «обходят» пределы, привязанные к сокету.
    reopened = [await _play(args.url, turns=1, think=0.0, scenario=args.scenario,
                            local_addr=local, turn_timeout=args.turn_timeout)
                for _ in range(3)]
    hold.set()
    results: list[_Result] = await asyncio.gather(*holders)

    created = sum(r.created for r in results)
    refused = [r.refused for r in results if r.refused]
    codes = sorted({r.close_code for r in results if r.close_code})
    # ПОТЕРИ НАЗЫВАЮТСЯ ОТДЕЛЬНО. Без этой строки прибор один раз уже соврал в
    # обратную сторону: сокет не открывался вовсе (пароль стенда, 403), а
    # приговор гласил «предел не держится». Обвинить исправный предел в чужой
    # беде — та же ошибка прибора, только с другим знаком.
    failures: dict[str, int] = {}
    for r in results:
        if r.failure:
            failures[r.failure] = failures.get(r.failure, 0) + 1
    await asyncio.sleep(args.settle)

    # 4. Место возвращается закрытием партии, а не временем: предел на
    #    ОДНОВРЕМЕННЫЕ партии, а не квота на весь показ.
    again = await _play(args.url, turns=1, think=0.0, scenario=args.scenario,
                        local_addr=local, turn_timeout=args.turn_timeout)

    return {
        "source": source,
        "cap": cap,
        "asked": cap + extra,
        "created_at_once": created,
        "refused": len(refused),
        "refusal_codes": sorted(set(refused)),
        "close_codes": codes,
        "reopen_bought_a_slot": sum(r.created for r in reopened),
        "turns_played_by_refused": sum(r.turns for r in results if r.refused),
        "slot_returned_after_close": again.created,
        "failures": failures,
        "verdict": _limits_verdict(cap, created, refused, codes, reopened, again,
                                   failures),
    }


def _limits_verdict(cap, created, refused, codes, reopened, again,
                    failures: dict) -> str:
    if failures and not created and not refused:
        # Ни одной партии и ни одного отказа: до предела дело не дошло вовсе.
        return ("замер не состоялся, предел ни при чём: "
                + ", ".join(f"{k}×{v}" for k, v in failures.items()))
    problems = []
    if failures:
        problems.append("потери: " + ", ".join(f"{k}×{v}" for k, v in failures.items()))
    if created != cap:
        problems.append(f"одновременно создано {created}, а потолок {cap}")
    if not refused:
        problems.append("лишние партии не получили отказа")
    elif set(refused) != {"too_many_sessions"}:
        problems.append(f"отказ назван не тем кодом: {sorted(set(refused))}")
    if codes and codes != [4429]:
        problems.append(f"закрытие не тем кодом: {codes}")
    if sum(r.created for r in reopened):
        problems.append("переоткрытие соединения обошло потолок")
    if not again.created:
        problems.append("место не вернулось после закрытия партии")
    return "предел держится" if not problems else "; ".join(problems)


async def run_pace(args, watch: _Watch) -> dict:
    """Темп ходов с одного адреса: сколько их сервер пропускает в секунду.

    ПОЧЕМУ НЕ ОДНОЙ ПАРТИЕЙ. Ведро ключуется АДРЕСОМ, а партия кончается на
    двенадцатом ходу (`engine.max_turns`), и сорока ходов подряд из неё не
    выжать. Поэтому давление создаётся несколькими партиями с одного адреса —
    ровно так, как его создавал бы скрипт.

    ЧЕСТНАЯ ОГОВОРКА. `limits.turn_delay` в офлайне (`NEGO_AI=off`) возвращает
    ноль по построению: предел существует ради ПЛАТНЫХ вызовов, и придерживать
    в офлайне нечего. Поэтому прибор не решает за читателя, «работает» ли
    предел, — он печатает достигнутый темп и предел из кода рядом. Темп много
    выше предела значит ровно одно: шлюз поднят офлайн, придержки нет.

    Как померить придержку по-настоящему и бесплатно: поднять шлюз БЕЗ
    `NEGO_AI=off`, но и без ключей провайдера. Тогда `turn_delay` работает, а
    платных вызовов всё равно нет — реплику оппонента даёт шаблонный фолбэк.
    """
    _limits = limits          # локальное имя: ниже он поминается семь раз
    source = args.source or "127.0.0.2"
    games = max(1, args.pace_games)
    turns = args.turns
    print(f"  адрес {source}: {games} партий × {turns} ходов без пауз…", flush=True)
    barrier = asyncio.Event()
    tasks = [asyncio.create_task(
        _play(args.url, turns=turns, think=0.0, scenario=args.scenario,
              local_addr=(source, 0), turn_timeout=args.turn_timeout,
              start_barrier=barrier)) for _ in range(games)]
    await asyncio.sleep(1.0)
    barrier.set()
    started = time.perf_counter()
    results: list[_Result] = await asyncio.gather(*tasks)
    elapsed = time.perf_counter() - started
    played = sum(r.turns for r in results)
    rate = round(played / elapsed, 2) if elapsed else None
    #: Установившийся темп: первые `TURN_BURST` ходов проходят из полного ведра
    #: и о пределе не говорят ничего.
    steady = None
    if played > _limits.TURN_BURST and elapsed:
        steady = round((played - _limits.TURN_BURST) / elapsed, 2)

    # ПЕРЕОТКРЫТИЕ СОКЕТА — НЕ СПОСОБ ОБНУЛИТЬ БЮДЖЕТ. Ведро живёт в модуле и
    # ключуется адресом; сокет о нём не знает ничего. Проверяем это тем
    # единственным, что видно снаружи: свежая партия с ТОГО ЖЕ адреса ждёт, а с
    # соседнего — нет. Контроль обязателен: без него медленный первый ход можно
    # списать на что угодно.
    fresh = await _play(args.url, turns=1, think=0.0, scenario=args.scenario,
                        local_addr=(source, 0), turn_timeout=args.turn_timeout)
    control_host = "127.0.0.3" if source != "127.0.0.3" else "127.0.0.4"
    control = await _play(args.url, turns=1, think=0.0, scenario=args.scenario,
                          local_addr=(control_host, 0),
                          turn_timeout=args.turn_timeout)
    fresh_ms = round(fresh.turn_ms[0]) if fresh.turn_ms else None
    control_ms = round(control.turn_ms[0]) if control.turn_ms else None
    return {
        "source": source,
        "games": games,
        "turns_asked": games * turns,
        "turns_played": played,
        "seconds": round(elapsed, 2),
        "rate_turns_per_s": rate,
        "steady_rate_turns_per_s": steady,
        "limit_turns_per_s": _limits.TURNS_PER_S,
        "limit_burst": _limits.TURN_BURST,
        "pacing_visible": bool(steady is not None
                               and steady <= _limits.TURNS_PER_S * 1.5),
        "fresh_socket_first_turn_ms": fresh_ms,
        "other_address_first_turn_ms": control_ms,
        "reopen_resets_the_budget": bool(
            fresh_ms is not None and control_ms is not None
            and fresh_ms < max(50, control_ms * 3)),
        "note": ("придержки не видно — так и должно быть при NEGO_AI=off"
                 if (steady or 0) > _limits.TURNS_PER_S * 1.5
                 else "придержка видна: темп прижат к пределу"),
    }


async def run_room(args, watch: _Watch) -> dict:
    """Комната жюри: десяток-другой партий за ОДНИМ адресом (NAT площадки).

    Это главный практический вопрос показа, и отвечать на него надо тем же
    способом, каким комната играет: все за одним адресом, все играют по-своему,
    темп — человеческий (`--think`), а не машинный.
    """
    source = args.source or "127.0.0.2"
    print(f"  комната: {args.room} партий с адреса {source}, "
          f"по {args.turns} ходов, пауза между ходами {args.think} с…", flush=True)
    rung = await _rung(args.url, args.room, turns=args.turns, think=args.think,
                       scenario=args.scenario, local_addr=(source, 0),
                       watch=watch, turn_timeout=args.turn_timeout,
                       mem_floor=args.mem_floor)
    rung["source"] = source
    rung["fits"] = (rung["created"] == args.room
                    and rung["turns_played"] == rung["turns_asked"])
    return rung


# ---------------------------------------------------------------------------

def refuse_paid(health: dict, paid: bool) -> bool:
    """Стрелять ли по шлюзу с ЖИВЫМИ моделями. Отдельной функцией — чтобы это
    обещание можно было проверить тестом, а не перечитать глазами.

    Залп в тысячу партий по платному пути — это счёт от провайдера, а не замер
    пропускной способности своего кода. Пропускную способность мерят офлайн
    (`NEGO_AI=off`): игра там полная (инвариант 5), а платных вызовов нет.
    """
    return bool(health.get("cloud_ai")) and not paid


def _health(url: str) -> dict:
    http = url.replace("ws://", "http://").replace("wss://", "https://")
    http = http.split("/v1/realtime")[0] + "/api/health"
    with urlopen(http, timeout=10) as response:      # noqa: S310 — свой же шлюз
        return json.loads(response.read().decode())


def _parse_ramp(text: str) -> list[int]:
    return [int(x) for x in text.replace(" ", "").split(",") if x]


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--url", default="ws://127.0.0.1:8010/v1/realtime")
    parser.add_argument("--mode", choices=("ramp", "limits", "room", "pace"),
                        default="ramp")
    parser.add_argument("--ramp", default="1,12,32,128,512,1024,2048",
                        help="ступени лестницы через запятую")
    parser.add_argument("--sessions", type=int, default=None,
                        help="одна ступень вместо лестницы")
    parser.add_argument("--turns", type=int, default=3)
    parser.add_argument("--think", type=float, default=0.0,
                        help="пауза между ходами, с (0 — машинный худший случай)")
    parser.add_argument("--room", type=int, default=20)
    parser.add_argument("--pace-games", type=int, default=6,
                        help="сколько партий с одного адреса давят в режиме pace")
    # Потолок берётся ИЗ КОДА, а не переписывается в прибор руками: прибор,
    # у которого своя копия проверяемого числа, однажды начнёт подтверждать
    # сам себя.
    parser.add_argument("--cap", type=int, default=limits.MAX_SESSIONS_PER_HOST,
                        help="ожидаемый NEGO_MAX_SESSIONS_PER_HOST")
    parser.add_argument("--source", default=None,
                        help="исходный адрес соединения; для пределов — не 127.0.0.1")
    parser.add_argument("--scenario", default="supplier")
    parser.add_argument("--turn-timeout", type=float, default=30.0)
    parser.add_argument("--settle", type=float, default=1.5)
    parser.add_argument("--mem-floor", type=int, default=_MEM_FLOOR_MB)
    parser.add_argument("--port", type=int, default=None,
                        help="порт шлюза для чтения /proc (по умолчанию из --url)")
    parser.add_argument("--pid", type=int, default=None)
    parser.add_argument("--password", default=os.getenv("NEGO_HTTP_PASSWORD", ""),
                        help="пароль стенда; сокет за паролем открывается кукой")
    parser.add_argument("--paid", action="store_true",
                        help="разрешить прогон по шлюзу с ЖИВЫМИ моделями (это деньги)")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    args.ramp = _parse_ramp(args.ramp) if args.sessions is None else [args.sessions]

    if args.password:
        _HEADERS["Cookie"] = f"dlg_ok={ws_ticket(args.password)}"
    health = _health(args.url)
    if refuse_paid(health, args.paid):
        print("шлюз поднят с живыми моделями (cloud_ai: true). Пропускную "
              "способность мерят офлайн: перезапустите шлюз с NEGO_AI=off "
              "или подтвердите расход флагом --paid.", file=sys.stderr)
        raise SystemExit(2)

    port = args.port or int(args.url.split("://")[1].split("/")[0].split(":")[1])
    pid = args.pid or _find_gateway_pid(port)
    watch = _Watch(pid)
    print(f"шлюз: pid {pid or '—'}, потолок дескрипторов "
          f"{watch.fd_limit or '—'}, cloud_ai={health.get('cloud_ai')}, "
          f"сборка {health.get('build', {}).get('code')}", flush=True)

    if args.mode == "ramp":
        payload = await run_ramp(args, watch)
    elif args.mode == "limits":
        payload = await run_limits(args, watch)
    elif args.mode == "pace":
        payload = await run_pace(args, watch)
    else:
        payload = await run_room(args, watch)

    result = {"mode": args.mode, "url": args.url, "turns": args.turns,
              "think_s": args.think, "gateway_pid": pid,
              "fd_limit": watch.fd_limit, "cloud_ai": health.get("cloud_ai"),
              "build": health.get("build", {}).get("code"), "result": payload}
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    if args.mode == "ramp":
        print("\n─── лестница ───")
        print(f"  {'партий':>7} {'создано':>8} {'ходов':>12} {'медиана':>9} "
              f"{'p95':>7} {'макс':>7} {'RSS МБ':>8} {'fd':>6} {'ядра':>6} {'прибор':>7}")
        for rung in payload["rungs"]:
            turn = rung["turn_ms"]
            print(f"  {rung['sessions_asked']:>7} {rung['created']:>8} "
                  f"{str(rung['turns_played']) + '/' + str(rung['turns_asked']):>12} "
                  f"{turn.get('median', '—'):>9} {turn.get('p95', '—'):>7} "
                  f"{turn.get('max', '—'):>7} "
                  f"{rung['gateway']['peak']['rss_mb'] or '—':>8} "
                  f"{rung['gateway']['peak']['fds'] or '—':>6} "
                  f"{rung['gateway_cpu_share'] if rung['gateway_cpu_share'] is not None else '—':>6} "
                  f"{rung['bench_cpu_share'] if rung['bench_cpu_share'] is not None else '—':>7}")
        verdict = payload["verdict"]
        print(f"\n  держит без единой потери: {verdict['held']} одновременных партий")
        print(f"  упирается первым:          {verdict['first_limit']}")
        for signal in verdict["all_signals"][1:]:
            print(f"                             + {signal}")
        print(f"  задержка хода:             {verdict['turn_median_ms_at_bottom']} мс "
              f"при {verdict['sessions_at_bottom']} → {verdict['turn_median_ms_at_top']} мс "
              f"при {verdict['sessions_at_top']} партиях "
              f"({verdict['ms_per_session']} мс на партию)")
        queue = sorted({e for r in payload["rungs"] for e in r["queue_events"]})
        print(f"  очередь:                   {', '.join(queue) or 'нет событий'}")
    elif args.mode in ("limits", "pace"):
        print("\n─── пределы на адрес ───" if args.mode == "limits"
              else "\n─── темп ходов с адреса ───")
        for key, value in payload.items():
            print(f"  {key:28s} {value}")
    else:
        print("\n─── комната жюри ───")
        print(f"  адрес                      {payload['source']}")
        print(f"  партий создано             {payload['created']}/{payload['sessions_asked']}")
        print(f"  ходов доиграно             {payload['turns_played']}/{payload['turns_asked']}")
        print(f"  задержка хода              медиана {payload['turn_ms'].get('median')} мс, "
              f"p95 {payload['turn_ms'].get('p95')}, макс {payload['turn_ms'].get('max')}")
        print(f"  RSS шлюза                  {payload['gateway']['peak']['rss_mb']} МБ")
        print(f"  отказы                     {payload['refusals'] or 'нет'}")
        print(f"  потери                     {payload['failures'] or 'нет'}")
        print(f"  комната помещается         {'да' if payload['fits'] else 'НЕТ'}")


if __name__ == "__main__":
    asyncio.run(main())
