"""Имя продукта там, где его видит человек или чужой сервис: RocketTalk.

Продукт переименован («Диалог» → RocketTalk, решение владельца, 19.10). На
сервере имя живёт в четырёх местах, которые ни один другой тест не читает:
заголовок API (страница /docs), окно пароля браузера (realm), свидетельство об
экзамене и подпись трафика в OpenRouter. Пропущенное место ничего не валит —
человек просто видит у одного продукта два названия.

Технические имена — юнит `dialog.service`, `/etc/dialog.env`, логгеры
`dialog.*`, домен подписи `dialog-attestation-v1` — остаются прежними
намеренно: смена юнита ломает выкладку, смена домена подписи — уже выданные
свидетельства.
"""
import asyncio
import re

from fastapi.testclient import TestClient

from app import attestation
from app.main import app
from app.providers.openrouter import chat
from tests.test_attestation import finished, registry  # noqa: F401 — фикстура
from tests.test_split_deploy import _Env

OLD = re.compile(r"Диалог|\bDialog\b")


def test_api_title():
    assert app.title.startswith("RocketTalk "), app.title


def test_password_prompt_names_the_product():
    """Браузер показывает realm в окне пароля стенда."""
    with _Env(NEGO_HTTP_PASSWORD="секрет") as main:
        challenge = TestClient(main.app).get("/api/health").headers.get("WWW-Authenticate", "")
    assert challenge == 'Basic realm="RocketTalk"', challenge


def test_attestation_document_names_the_product(registry):  # noqa: F811
    signed = attestation.issue(finished())
    page = TestClient(app).get(f"/api/attestations/{signed['record']['id']}/document").text
    assert "RocketTalk" in page
    assert not OLD.search(page), OLD.search(page)


def test_openrouter_attribution_is_ascii_and_named():
    """OpenRouter показывает X-Title в своей статистике. Заголовок обязан быть
    ASCII: httpx кодирует заголовки в latin-1."""
    before, chat._client = chat._client, None
    try:
        client = chat._get_client()
        title = client.headers["X-Title"]
        asyncio.run(client.aclose())
    finally:
        chat._client = before
    assert title.startswith("RocketTalk "), title
    title.encode("ascii")
