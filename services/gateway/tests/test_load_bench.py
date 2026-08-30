"""Прибор нагрузки: против кода, против документа и против собственной лести.

ЗАЧЕМ ЭТОТ НАБОР. В `limits.py` и в `docs/hosting.md` стояло число, полученное
неизвестно чем: «сто двадцать сокетов с одного адреса держались, и каждый имел
право звать модель зрения раз в восемь секунд». На нём построено обоснование
всех трёх пределов, а команды, которой его получают, в репозитории не было.
Правило «числа не правятся руками» держится не на дисциплине, а на том, что
рядом лежит прибор — как `tools/bench_latency.py` для задержек. Теперь он есть
(`tools/bench_load.py`), и вместе с ним появляется новый способ соврать: прибор
меряет одно, документ рассказывает другое, и расхождение молчит.

ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ — только то, о чём можно СПРОСИТЬ У КОДА:

  * прибор не держит своей копии проверяемого числа: потолок партий он берёт
    из `limits.py`, а не переписан в него руками;
  * прогон бесплатен по умолчанию — по шлюзу с живыми моделями прибор не
    стреляет без явного согласия;
  * прибор считает ДОИГРАННЫЕ ХОДЫ, а не отправленные сообщения: сокет,
    который открылся и молчит, партией не считается, и ход без `engine.state`
    не считается ходом. Это проверяется подставным сокетом, а не обещанием в
    шапке;
  * числа пределов в `docs/hosting.md` совпадают с `limits.py`;
  * измеренная ёмкость названа в обоих местах ОДНИМ числом;
  * очередь: `session.queued` / `session.queue_update` есть в протоколе и не
    отправляются ни разу — документ говорит именно это;
  * отказ по потолку не съедает место (иначе предел ел бы сам себя).

ЧЕГО ЗДЕСЬ НЕТ. Самих чисел ёмкости: они приходят прогоном и правятся только
перезамером. Тест, сверяющий «2048» с чем-то в коде, краснел бы на исправном —
а прибор, краснеющий на исправном, перестают читать.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

_BACKEND = Path(__file__).resolve().parents[1]
_TOOLS = _BACKEND / "tools"
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))

from app.main import app  # noqa: E402
from app.realtime import limits  # noqa: E402
from app.realtime.events import SERVER_EVENTS  # noqa: E402

import bench_load  # noqa: E402

DOC = _BACKEND.parents[1] / "docs" / "hosting.md"
TOOL = _TOOLS / "bench_load.py"

PAYLOAD = {"scenarioId": "supplier", "lang": "ru", "gameMode": "practice"}

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean_limits():
    limits.reset()
    yield
    limits.reset()


@pytest.fixture(scope="module")
def doc() -> str:
    assert DOC.is_file(), f"нет документа {DOC}"
    return DOC.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# 1. Прибор не подтверждает сам себя
# ---------------------------------------------------------------------------

def test_the_tool_reads_the_ceiling_from_the_code():
    """Потолок партий прибор берёт из `limits.py`.

    Прибор со своей копией проверяемого числа однажды начнёт подтверждать сам
    себя: код уедет, прибор останется на прежней константе и радостно
    отрапортует «предел держится».
    """
    source = TOOL.read_text(encoding="utf-8")
    assert "default=limits.MAX_SESSIONS_PER_HOST" in source, (
        "прибор переписал потолок партий руками вместо того, чтобы прочитать "
        "его из app/realtime/limits.py")


def test_the_run_is_free_unless_money_is_confirmed():
    """Прогон по шлюзу с живыми моделями — это счёт, а не замер.

    Тысяча партий по платному пути стоит денег, а измеряет она провайдера, а не
    наш код. Пропускную способность мерят офлайн (`NEGO_AI=off`), где игра
    полная (инвариант 5), а платных вызовов нет вовсе.
    """
    assert bench_load.refuse_paid({"cloud_ai": True}, paid=False) is True
    assert bench_load.refuse_paid({"cloud_ai": True}, paid=True) is False
    assert bench_load.refuse_paid({"cloud_ai": False}, paid=False) is False
    assert bench_load.refuse_paid({}, paid=False) is False


# ---------------------------------------------------------------------------
# 2. Прибор считает партии и ходы, а не сокеты и сообщения
# ---------------------------------------------------------------------------

class _FakeConn:
    """Сокет, отвечающий по сценарию. Кончился сценарий — молчит навсегда:
    именно так выглядит сервер, который принял ход и не ответил."""

    def __init__(self, script: list[dict]) -> None:
        self._script = list(script)
        self.sent: list[dict] = []
        self.close_code: int | None = None

    async def send(self, message: str) -> None:
        self.sent.append(json.loads(message))

    async def recv(self) -> str:
        if not self._script:
            await asyncio.sleep(3600)      # молчание, а не конец потока
        return json.dumps(self._script.pop(0))


class _FakeConnect:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeConn:
        return self._conn

    async def __aexit__(self, *exc) -> bool:
        return False


def _run(script: list[dict], monkeypatch, **kwargs) -> "bench_load._Result":
    conn = _FakeConn(script)
    monkeypatch.setattr(bench_load.websockets, "connect",
                        lambda *a, **kw: _FakeConnect(conn))
    options = {"turns": 1, "think": 0.0, "scenario": "supplier",
               "local_addr": None, "turn_timeout": 0.05,
               # Прибор ждёт рукопожатия десятками секунд — под тысячей сокетов
               # очередь на `accept` длинная. Здесь сокет подставной, и ждать
               # нечего: минута тишины на каждый тест окупает только терпение.
               "handshake_timeout": 0.2}
    options.update(kwargs)
    return asyncio.run(bench_load._play("ws://x/v1/realtime", **options))


_QUEUE = {"type": "session.queue_done"}
_CREATED = {"type": "session.created", "session_id": "s"}


def test_a_socket_that_never_reaches_session_created_is_not_a_game(monkeypatch):
    """Открытый сокет — не партия. Соединение, которое молчит, не стоит серверу
    ни движка, ни шины, ни писателя; засчитать его партией значило бы измерить
    ёмкость TCP, а не продукта."""
    result = _run([_QUEUE], monkeypatch)
    assert result.connected is True
    assert result.created is False
    assert result.turns == 0


def test_a_turn_without_the_engine_answer_is_never_counted(monkeypatch):
    """Ход — не отправленное сообщение. Сервер, который ответил чем угодно,
    кроме `engine.state`, хода не доиграл."""
    script = [_QUEUE, _CREATED,
              {"type": "turn.analysis", "turn_id": 1},
              {"type": "response.output.delta", "kind": "text"}]
    result = _run(script, monkeypatch)
    assert result.created is True
    assert result.turns == 0, "ход засчитан по чужому событию"
    assert result.failure == "ход без ответа"


def test_a_turn_counted_only_when_the_engine_moved_by_exactly_one(monkeypatch):
    """`engine.state` с чужим `turn_id` — не наш ход.

    Номер важен не из педантизма: под нагрузкой в сокет валится хвост чужого
    поколения, и «пришло что-то похожее» — ровно та лесть, ради которой прибор
    и написан.
    """
    wrong = [_QUEUE, _CREATED, {"type": "engine.state", "turn_id": 7}]
    assert _run(wrong, monkeypatch).turns == 0

    right = [_QUEUE, _CREATED, {"type": "engine.state", "turn_id": 1}]
    played = _run(right, monkeypatch)
    assert played.turns == 1
    assert len(played.turn_ms) == 1


def test_a_refusal_is_recorded_as_a_refusal_and_not_as_a_game(monkeypatch):
    """Отказ сервера — это ноль партий и названная причина, а не «сессия была»."""
    script = [_QUEUE, {"type": "error", "error": {"code": "too_many_sessions",
                                                  "type": "rate_limited"}}]
    result = _run(script, monkeypatch)
    assert result.created is False
    assert result.refused == "too_many_sessions"
    assert result.turns == 0


# ---------------------------------------------------------------------------
# 3. Очередь: она есть в протоколе и её нет в работе
# ---------------------------------------------------------------------------

def test_the_queue_exists_in_the_protocol():
    """Три события очереди перенесены из upstream и остаются в словаре: клиент
    (порт их же `realtime-session.js`) ждёт `queue_done` перед `session.init`."""
    for name in ("session.queued", "session.queue_update", "session.queue_done"):
        assert name in SERVER_EVENTS, f"{name} пропало из протокола"


def test_the_gateway_never_actually_queues_anybody():
    """`session.queue_done` уходит сразу и один; ждать в очереди негде.

    Документ теперь говорит именно это, а не «очередь держит столько-то».
    Пула воркеров у нас нет, и приёмный контроль — это потолок партий на адрес
    плюс очередь ядра на `accept`, а не наша очередь.
    """
    with client.websocket_connect("/v1/realtime") as ws:
        first = ws.receive_json()
        assert first == {"type": "session.queue_done"}
        ws.send_json({"type": "session.init", "payload": PAYLOAD})
        created = ws.receive_json()
        assert created["type"] == "session.created", (
            "между queue_done и session.created влезло событие очереди: "
            f"{created['type']}")
        ws.send_json({"type": "session.close"})


# ---------------------------------------------------------------------------
# 4. Отказ по потолку не съедает место
# ---------------------------------------------------------------------------

def test_a_refused_session_does_not_eat_a_slot(monkeypatch):
    """Предел, который тратится на собственные отказы, съедает сам себя.

    Комната за одним NAT ловит отказ ровно тогда, когда все места заняты, — и
    если каждый отказ занимал бы место, уже начатые партии доиграть бы не
    удалось: одна лишняя вкладка выбивала бы стол у соседа.
    """
    monkeypatch.setattr(limits, "MAX_SESSIONS_PER_HOST", 2)
    with client.websocket_connect("/v1/realtime") as one, \
            client.websocket_connect("/v1/realtime") as two:
        for ws in (one, two):
            ws.receive_json()
            ws.send_json({"type": "session.init", "payload": PAYLOAD})
            assert ws.receive_json()["type"] == "session.created"
        assert limits.live_sessions("testclient") == 2

        for _ in range(5):
            with client.websocket_connect("/v1/realtime") as extra:
                extra.receive_json()
                extra.send_json({"type": "session.init", "payload": PAYLOAD})
                assert extra.receive_json()["error"]["code"] == "too_many_sessions"
        # Пять отказов не сдвинули счётчик ни на единицу.
        assert limits.live_sessions("testclient") == 2

        one.send_json({"type": "session.close"})
        assert one.receive_json()["type"] == "session.closed"

    assert limits.live_sessions("testclient") == 0


# ---------------------------------------------------------------------------
# 5. Документ против кода
# ---------------------------------------------------------------------------

#: Строка таблицы пределов в документе: | что | значение | `ПЕРЕМЕННАЯ` |
_LIMIT_ROW = re.compile(r"^\|[^|]+\|\s*([0-9]+)(?:,\s*ведро\s*([0-9]+))?\s*\|\s*`([^`]+)`",
                        re.MULTILINE)


def test_the_hosting_table_matches_the_code(doc: str):
    """Числа пределов в документе — те же, что в `limits.py`.

    Документ не падает, его не запускают, и расходится он с кодом молча:
    страница выглядит одинаково правдоподобно и когда она права, и когда врёт.
    """
    expected = {
        "NEGO_MAX_SESSIONS_PER_HOST": (limits.MAX_SESSIONS_PER_HOST, None),
        "NEGO_VISION_CALLS_PER_S": (limits.VISION_CALLS_PER_S, limits.VISION_BURST),
        "NEGO_TURNS_PER_S": (limits.TURNS_PER_S, limits.TURN_BURST),
    }
    seen: dict[str, tuple] = {}
    for value, burst, names in _LIMIT_ROW.findall(doc):
        for name in re.findall(r"NEGO_[A-Z_]+", names):
            if name in expected:
                seen[name] = (float(value), float(burst) if burst else None)

    assert set(seen) == set(expected), (
        "таблица пределов в docs/hosting.md называет не те переменные: "
        f"{sorted(seen)} против {sorted(expected)}")
    for name, (value, burst) in expected.items():
        got_value, got_burst = seen[name]
        assert got_value == float(value), (
            f"{name}: документ говорит {got_value}, в коде {value}")
        if burst is not None:
            assert got_burst == float(burst), (
                f"{name}: ведро в документе {got_burst}, в коде {burst}")


#: Измеренная ёмкость: «N одновременных партий». Пишется одинаково в обоих
#: местах, потому что это ОДИН факт, полученный ОДНИМ прогоном.
_CAPACITY = re.compile(r"([0-9]{3,5})\s+одновременных\s+парти")


def test_the_measured_capacity_is_one_number_in_both_places(doc: str):
    """Ёмкость названа одним числом и в коде, и в документе.

    Именно здесь предыдущая редакция и разъехалась с реальностью: «сто двадцать
    сокетов» стояло в двух файлах, повторить его было нечем, и проверить —
    тоже. Тест не знает правильного числа (оно приходит прогоном), он знает
    только, что версий этого числа не должно быть две.
    """
    code = (_BACKEND / "app" / "realtime" / "limits.py").read_text(encoding="utf-8")
    in_code = set(_CAPACITY.findall(code))
    in_doc = set(_CAPACITY.findall(doc))
    assert in_code, "limits.py больше не называет измеренную ёмкость"
    assert in_doc, "docs/hosting.md больше не называет измеренную ёмкость"
    assert in_code == in_doc, (
        f"ёмкость разошлась: limits.py говорит {sorted(in_code)}, "
        f"docs/hosting.md — {sorted(in_doc)}")
    assert len(in_code) == 1, (
        f"у одного замера две версии числа: {sorted(in_code)}")


def test_both_places_name_the_instrument(doc: str):
    """Число без прибора гниёт молча. Прибор назван — и он существует."""
    code = (_BACKEND / "app" / "realtime" / "limits.py").read_text(encoding="utf-8")
    assert TOOL.is_file(), "прибора нагрузки нет на диске"
    for name, text in (("limits.py", code), ("docs/hosting.md", doc)):
        assert "tools/bench_load.py" in text, (
            f"{name} называет измеренную ёмкость, но не называет прибор")


def test_the_unmeasured_hundred_and_twenty_is_gone(doc: str):
    """Прежнее число ушло ОТОВСЮДУ, где оно было утверждением.

    Оно жило в трёх местах — шапка `limits.py`, комментарий у потолка партий и
    набор про пределы, — и вычистить два из трёх значило бы оставить читателю
    выбор, какой из них правда.

    ДОКУМЕНТУ РАЗРЕШЕНО НАЗВАТЬ ЕГО ОДИН РАЗ, и это не поблажка. `hosting.md`
    рассказывает, чем прежняя редакция обманулась, — а рассказать об ошибке, не
    называя её, нельзя. Ровно то же послабление и по той же причине сделано в
    `test_doc_links.py`, где команды ищутся только в блоках ```: первым, на кого
    строгий прибор наругался бы, оказался бы текст, объясняющий эту самую
    ошибку. Два упоминания — это уже не история, а факт, который где-то опять
    используют.
    """
    stale = re.compile(r"сто\s+двадцать|120\s+(?:параллельных\s+)?сокет")
    for name in ("app/realtime/limits.py", "tests/test_takeover_and_limits.py"):
        text = (_BACKEND / name).read_text(encoding="utf-8")
        assert not stale.search(text), (
            f"{name}: осталось число, полученное неизвестно чем — "
            "теперь ёмкость меряет tools/bench_load.py")

    mentions = stale.findall(doc)
    assert len(mentions) <= 1, (
        "docs/hosting.md называет прежнее число больше одного раза — это уже "
        f"не история, а утверждение: {mentions}")
