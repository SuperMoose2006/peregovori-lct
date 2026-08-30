"""Раздельное развёртывание: шлюз на своём сервере, фронтенд на своём.

ЧТО БЫЛО СЦЕПЛЕНО. Шлюз раздавал собранный SPA (`/assets` + фолбэк на
`frontend/dist`), а страница ходила к нему относительными путями — то есть
«один origin» был не настройкой, а условием работы. Развести их мешали ровно
три места, и все три проверяются здесь:

1. **CORS.** `*` без учётных данных годится для vite на соседнем порту и не
   годится для фронтенда на своём домене: билет за паролем — это учётные
   данные, а `*` вместе с ними браузер отвергает.
2. **Кука `dlg_ok` между РАЗНЫМИ доменами не едет.** Замок на сокете держался
   на ней, значит разделение он переживал не полностью. Появился билет в
   адресе сокета — короткоживущий, привязанный к паролю и не попадающий в лог.
3. **Каталог сборки может не существовать вовсе.** Тогда `/` обязан отвечать
   честно, а не пятисоткой и не выдуманной страницей.

ГЛАВНОЕ СВОЙСТВО НАБОРА: совмещённое развёртывание (шлюз раздаёт и статику, и
API) обязано работать БЕЗ ЕДИНОЙ НАСТРОЙКИ. Поэтому каждый тест ниже
проверяет обе стороны — и разведённую, и слитую.

ПОЧЕМУ КАТАЛОГ СБОРКИ ЗДЕСЬ ВСЕГДА СВОЙ (`tmp_path`), а не `frontend/dist`.
`dist` лежит вне истории: в рабочем дереве он есть, в дереве коммита
(`make test-commit`) его нет. Тест, спрашивающий про настоящий `dist`, отвечал
бы разное в двух прогонах — то есть не отвечал бы ни на что.
"""

from __future__ import annotations

import importlib
import logging
import os
import subprocess
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[3]


def _restore(before: dict[str, str | None]):
    for k, v in before.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    import app.main as main
    importlib.reload(main)


class _Env:
    """Контекст «поднять шлюз с этими переменными и вернуть всё как было»."""

    def __init__(self, **env: str):
        self.env = env
        self.before: dict[str, str | None] = {}

    def __enter__(self):
        self.before = {k: os.environ.get(k) for k in self.env}
        for k, v in self.env.items():
            os.environ[k] = v
        import app.main as main
        return importlib.reload(main)

    def __exit__(self, *_exc):
        _restore(self.before)
        return False


def _dist(tmp_path: Path) -> str:
    """Минимальная «сборка фронтенда»: index.html и один файл в assets."""
    (tmp_path / "assets").mkdir(parents=True)
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "index.html").write_text("<!doctype html><title>Диалог</title>", encoding="utf-8")
    return str(tmp_path)


def _cors(main) -> tuple[list[str], bool]:
    for mw in main.app.user_middleware:
        if mw.cls is CORSMiddleware:
            return list(mw.kwargs.get("allow_origins", [])), bool(mw.kwargs.get("allow_credentials"))
    raise AssertionError("CORS-прослойки нет вовсе")


# --------------------------------------------------------------------- CORS

def test_named_origins_come_with_credentials_and_a_star_never_does():
    """`*` и учётные данные вместе — не «пошире», а неработающая настройка.

    Браузер отвергает ответ с `Access-Control-Allow-Origin: *`, если запрос шёл
    с учётными данными. Значит разведённое развёртывание обязано называть
    origin'ы поимённо; и наоборот — пока их не назвали, учётные данные включать
    нельзя, иначе сегодняшняя `*` в разработке перестала бы работать молча.
    """
    with _Env(NEGO_ALLOWED_ORIGINS="https://dialog.example, https://www.dialog.example/") as main:
        origins, creds = _cors(main)
        assert origins == ["https://dialog.example", "https://www.dialog.example"], \
            "origin'ы не разобраны по запятой или не обрезан хвостовой слэш"
        assert creds, "названные origin'ы без учётных данных не получат билета за паролем"

    with _Env(NEGO_ALLOWED_ORIGINS="") as main:
        origins, creds = _cors(main)
        assert not creds, "учётные данные включились там, где origin'ы не названы"
        assert "*" in origins, "разработка сломана: vite на другом порту"


def test_the_split_origin_list_wins_over_the_stand_default():
    """Стенд с паролем сегодня пускает только свои localhost-origin'ы. Разведённый
    фронтенд живёт на домене, и список обязан перекрывать умолчание, а не
    складываться с ним: лишний разрешённый origin никто потом не заметит."""
    with _Env(NEGO_HTTP_PASSWORD="секрет", NEGO_ALLOWED_ORIGINS="https://dialog.example") as main:
        origins, creds = _cors(main)
        assert origins == ["https://dialog.example"]
        assert creds
        assert not any("5173" in o for o in origins), "к списку прилип умолчание стенда"


# -------------------------------------------------------------------- билет

def test_the_ticket_is_short_lived_bound_to_the_password_and_unforgeable():
    with _Env(NEGO_HTTP_PASSWORD="секрет") as main:
        ticket = main.mint_ws_ticket()
        exp, _, sig = ticket.partition(".")

        assert main._ticket_valid(ticket)
        assert 0 < int(exp) - time.time() <= main._TICKET_TTL_S <= 600, \
            "билет на предъявителя обязан жить минуты, а не часы"
        assert "секрет" not in ticket, "в билете лежит сам пароль"

        # Срок ВНУТРИ подписи: переписать его нельзя.
        assert not main._ticket_valid(f"{int(exp) + 86400}.{sig}")
        assert not main._ticket_valid(f"{int(time.time()) - 1}.{sig}")
        assert not main._ticket_valid("не-число." + sig)
        assert not main._ticket_valid(exp)
        assert not main._ticket_valid("")
        stale = ticket

    # Тот же билет при ДРУГОМ пароле — чужой.
    with _Env(NEGO_HTTP_PASSWORD="другой") as main:
        assert not main._ticket_valid(stale), "билет пережил смену пароля"


def test_the_ticket_handle_is_honest_when_there_is_no_lock():
    """Замка нет — билета нет. Выдуманная строка, которую сокет всё равно не
    спросит, — это ровно то четвёртое состояние, которого не бывает."""
    with _Env(NEGO_HTTP_PASSWORD="") as main:
        body = TestClient(main.app).get("/api/auth/ticket").json()
        assert body == {"required": False, "ticket": None, "expires_in": 0}

    with _Env(NEGO_HTTP_PASSWORD="секрет") as main:
        # TestClient приходит с адреса `testclient` — для шлюза это улица,
        # поэтому пароль он предъявляет так же, как браузер.
        client = TestClient(main.app)
        assert client.get("/api/auth/ticket").status_code == 401
        body = client.get("/api/auth/ticket", auth=("dialog", "секрет")).json()
        assert body["required"] and body["expires_in"] == main._TICKET_TTL_S
        assert main._ticket_valid(body["ticket"])


def _ws(host: str = "8.8.8.8", cookie: str = "", ticket: str = ""):
    from types import SimpleNamespace
    return SimpleNamespace(
        client=SimpleNamespace(host=host),
        cookies={"dlg_ok": cookie} if cookie else {},
        query_params={"ticket": ticket} if ticket else {},
    )


def test_the_socket_takes_the_ticket_and_still_takes_the_cookie():
    """Кука — путь совмещённого развёртывания, билет — разведённого. Убрать
    первую значило бы сломать сегодняшний стенд ради завтрашнего."""
    with _Env(NEGO_HTTP_PASSWORD="секрет") as main:
        assert main.ws_allowed(_ws(cookie=main._ws_ticket())), "один origin: кука перестала работать"
        assert main.ws_allowed(_ws(ticket=main.mint_ws_ticket())), "билет не пускает"
        assert main.ws_allowed(_ws(host="127.0.0.1")), "локальные ходы (OpenTalking) закрыты"
        assert not main.ws_allowed(_ws()), "с улицы пускают без всего"
        assert not main.ws_allowed(_ws(ticket="9999999999." + "d" * 32)), "подделка проходит"
        assert not main.ws_allowed(_ws(cookie="не тот")), "чужая кука проходит"

    with _Env(NEGO_HTTP_PASSWORD="") as main:
        assert main.ws_allowed(_ws()), "без пароля замок появился на пустом месте"


def test_a_ticket_never_reaches_the_log():
    """Адрес сокета uvicorn печатает целиком, а журнал живёт дольше билета и
    читается теми, кому пароля не называли."""
    import app.main as main

    scrubber = main._TicketScrubber()
    record = logging.LogRecord("uvicorn.error", logging.INFO, __file__, 1,
                               '%s - "WebSocket %s" [accepted]',
                               ("127.0.0.2:41975", "/v1/realtime?mode=text&ticket=1788000000.deadbeef"),
                               None)
    scrubber.filter(record)
    assert "deadbeef" not in record.getMessage()
    assert "ticket=<скрыт>" in record.getMessage()
    assert "/v1/realtime?mode=text" in record.getMessage(), "вычистили заодно и путь"

    # Фильтр обязан СТОЯТЬ, а не просто существовать.
    for name in ("uvicorn.error", "uvicorn.access"):
        assert any(type(f).__name__ == "_TicketScrubber"
                   for f in logging.getLogger(name).filters), f"{name} печатает билеты"


# ------------------------------------------------------------ жизнь без dist

def test_the_gateway_serves_the_api_with_no_build_directory_at_all():
    """Проверка «бэкенд работает без фронтенда», сделанная там, где фронтенд
    лежит рядом, не доказывает ничего. Поэтому каталог назван заведомо
    несуществующий, а не «сегодня его вроде бы нет»."""
    with _Env(NEGO_FRONTEND_DIST="/nonexistent/frontend/dist") as main:
        assert not main.SERVES_SPA
        client = TestClient(main.app)

        assert client.get("/api/health").json()["ok"] is True
        assert client.get("/api/scenarios").json()["scenarios"], "столы пропали вместе со статикой"

        root = client.get("/")
        assert root.status_code == 200, "корень без сборки отвечает ошибкой, а сервер здоров"
        assert root.json()["spa"] is False and root.json()["ok"] is True

        # SPA нет — значит и фолбэка нет: неизвестный путь честно не найден.
        assert client.get("/course").status_code == 404
        assert client.get("/%2e%2e/%2e%2e/services/gateway/.env").status_code == 404


def test_the_combined_deploy_still_serves_the_spa_without_a_single_setting(tmp_path):
    """Вторая сторона того же теста: пока каталог сборки на месте, шлюз ведёт
    себя ровно как раньше — статика, SPA-фолбэк и запертый обход каталога."""
    with _Env(NEGO_FRONTEND_DIST=_dist(tmp_path)) as main:
        assert main.SERVES_SPA
        client = TestClient(main.app)

        assert client.get("/assets/index-abc123.js").text == "console.log(1)"
        assert "<title>Диалог</title>" in client.get("/").text
        assert "<title>Диалог</title>" in client.get("/course").text, "SPA-фолбэк пропал"
        # Обход каталога закрыт по-прежнему: наружу едет index.html, а не файл.
        assert "<title>Диалог</title>" in client.get(
            "/%2e%2e/%2e%2e/services/gateway/.env").text
        assert client.get("/api/health").json()["ok"] is True


def test_a_half_built_frontend_does_not_take_the_api_down_with_it(tmp_path):
    """`StaticFiles` на отсутствующем каталоге падает ПРИ ИМПОРТЕ. Каталог
    сборки без `assets` — это недокачанный артефакт, и стоить он должен
    отсутствия статики, а не отсутствия шлюза."""
    (tmp_path / "index.html").write_text("<!doctype html>", encoding="utf-8")
    with _Env(NEGO_FRONTEND_DIST=str(tmp_path)) as main:
        assert TestClient(main.app).get("/api/health").json()["ok"] is True


# ------------------------------------------------------- артефакт бэкенда

def test_the_backend_artifact_carries_everything_it_needs_and_no_secrets(tmp_path):
    """Рецепт из docs/hosting.md — прогоном, а не пересказом.

    Артефакт обязан быть самодостаточным (шлюз, зависимости, шов) и обязан НЕ
    нести двух вещей: фронтенда (он и есть второй сервер) и секретов (ключ в
    артефакте — это тот же ключ, только теперь ещё и на второй машине).
    """
    script = ROOT / "services" / "gateway" / "tools" / "pack_backend.sh"
    assert script.exists() and os.access(script, os.X_OK), "скрипт сборки артефакта не исполняемый"

    dest = tmp_path / "artifact"
    done = subprocess.run([str(script), str(dest)], capture_output=True, text=True, cwd=str(ROOT))
    if done.returncode == 2 and "git" in done.stderr:
        pytest.skip("дерево не под git — список файлов брать неоткуда")
    assert done.returncode == 0, done.stderr

    for needed in ("services/gateway/app/main.py", "services/gateway/app/engine/engine.py",
                   "services/gateway/requirements.txt", "adapters/opentalking_negotiation.py"):
        assert (dest / needed).is_file(), f"в артефакте нет {needed}"

    assert not (dest / "frontend").exists(), "фронтенд уехал на бэкенд-сервер"
    assert not list(dest.rglob(".env")), "в артефакте файл секретов"
    assert not list(dest.rglob("*.pem")) and not list(dest.rglob("*.key")), "в артефакте ключи TLS"
    assert not (dest / "services/gateway/tests").exists(), \
        "тесты читают фронтенд — в отдельном дереве они не прогоняются, и вид, что прогоняются, вреден"


# --------------------------------------------- находка по дороге: не-ASCII

def test_a_password_with_a_russian_letter_opens_the_door_instead_of_locking_it():
    """`hmac.compare_digest` НЕ СРАВНИВАЕТ строки с не-ASCII: он бросает
    TypeError. В замке это исключение ловилось общим `except` и превращалось в
    честный на вид 401 — то есть пароль с русской буквой в `.env` не пускал
    никого, включая хозяина стенда, и выглядело это как «пароль не подошёл».

    Найдено при разведении бэкенда и фронтенда: тест ставил пароль «секрет» и
    получал 401 на правильный пароль. Чинится сравнением БАЙТОВ — заодно
    закрывается путь «прислать в куке или билете не-ASCII и уронить
    рукопожатие необработанным исключением».
    """
    with _Env(NEGO_HTTP_PASSWORD="секрет-пароль") as main:
        client = TestClient(main.app)
        assert client.get("/api/health").status_code == 401
        assert client.get("/api/health", auth=("dialog", "секрет-пароль")).status_code == 200
        assert client.get("/api/health", auth=("dialog", "секрет-парол")).status_code == 401

        # То же на сокете: чужое не-ASCII значение — отказ, а не исключение.
        assert not main.ws_allowed(_ws(cookie="кука-не-та"))
        assert not main.ws_allowed(_ws(ticket="9999999999.билет-не-тот"))
        assert main.ws_allowed(_ws(ticket=main.mint_ws_ticket()))
