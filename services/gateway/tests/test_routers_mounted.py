"""Каждый `APIRouter` из `app/` подключён к приложению — и не заслонён.

ЧТО СЛУЧИЛОСЬ. После слияния двух линий `main.py` не подключал роутер
контекста организатора, и каждый `/api/admin/...` отвечал 405. Тесты
`test_admin_context.py` шли в тот же роутер и падали бы — но только потому, что
этот роутер ими покрыт. Следующий роутер, у которого своих тестов по проводу
нет, пропадёт молча.

ПОЧЕМУ НЕ ПО КОДУ ОТВЕТА. При собранном фронтенде в конце `main.py` стоит
SPA-фолбэк `GET /{full_path:path}`. Он и превращает забытый POST в 405, а
забытый GET — в 200 с `index.html`: проверка «маршрут отвечает» ответила бы
«отвечает». Поэтому здесь спрашивается, КТО ответил: запрос проходит всю
разводку приложения (middleware, подключённые роутеры, фолбэк), а в последний
момент `APIRoute.handle` подменён записью — обработчик не выполняется, но
известно, чей он. Ответить обязан обработчик из роутера, и никто другой: это
ловит и «забыли подключить», и «подключили после заслоняющего маршрута».
Разводка не разбирается по внутренностям FastAPI — они менялись между
версиями (подключённый роутер теперь ленивый `_IncludedRouter`), а путь
запроса остаётся тем же.

Роутеры ищутся разбором исходников, а не списком: список пришлось бы помнить
пополнять, а забытый пункт списка — ровно та ошибка, от которой тест.
"""

from __future__ import annotations

import ast
import importlib
import re
from pathlib import Path

import pytest
from fastapi import APIRouter, Response
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.main import app

APP_DIR = Path(__file__).resolve().parents[1] / "app"


def _router_definitions() -> list[tuple[str, str]]:
    """(модуль, имя) каждого `X = APIRouter(...)` на верхнем уровне модуля в `app/`."""
    found = []
    for path in sorted(APP_DIR.rglob("*.py")):
        if "vendor" in path.parts:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in tree.body:
            if not (isinstance(node, (ast.Assign, ast.AnnAssign)) and isinstance(node.value, ast.Call)):
                continue
            func = node.value.func
            name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
            if name != "APIRouter":
                continue
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            module = ".".join(path.relative_to(APP_DIR.parent).with_suffix("").parts)
            found += [(module, t.id) for t in targets if isinstance(t, ast.Name)]
    return found


ROUTERS = _router_definitions()


def test_the_scan_sees_the_routers_it_is_meant_to_guard():
    """Без этой проверки сломанный разбор нашёл бы ноль роутеров, и тест ниже
    прошёл бы, ничего не проверив."""
    assert {("app.admin_context", "router"), ("app.attestation", "router")} <= set(ROUTERS)


def _probe_path(template: str) -> str:
    # Значение параметра неважно: обработчик не выполняется.
    return re.sub(r"\{[^}]+\}", "probe", template)


@pytest.fixture
def who_answers(monkeypatch):
    """Кто из обработчиков приложения взял бы запрос. None — никто из `APIRoute`
    (404 разводки или, например, статика)."""
    seen: list = []

    async def record(self, scope, receive, send):
        seen.append(self.endpoint)
        await Response(status_code=204)(scope, receive, send)

    monkeypatch.setattr(APIRoute, "handle", record)
    client = TestClient(app)   # без `with`: lifespan для разводки не нужен

    def ask(method: str, path: str):
        seen.clear()
        client.request(method, path)
        return seen[0] if seen else None

    return ask


@pytest.mark.parametrize(("module", "name"), ROUTERS, ids=[f"{m}.{n}" for m, n in ROUTERS])
def test_every_route_of_the_router_is_what_the_app_serves(module, name, who_answers):
    router = getattr(importlib.import_module(module), name)
    assert isinstance(router, APIRouter)
    assert router.routes, f"{module}.{name}: пустой роутер — проверять нечего, это подозрительно"
    for route in router.routes:
        for method in sorted(route.methods or {"GET"}):
            served = who_answers(method, _probe_path(route.path))
            assert served is route.endpoint, (
                f"{method} {route.path} из {module}.{name} обслуживает "
                f"{getattr(served, '__name__', 'никто')} — роутер не подключён в main.py "
                "или подключён после заслоняющего маршрута")
