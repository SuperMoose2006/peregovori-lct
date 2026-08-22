"""Ручка комментария тренера не имеет права влиять на зачёт — и на офлайн.

Тесты идут с `NEGO_AI=off` (conftest ставит принудительно), то есть судья
недоступен. Это и есть главный случай: упражнение обязано работать, а ручка —
честно отвечать «комментария нет», а не пятисоткой и не выдуманной похвалой.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_coach_is_silent_without_ai() -> None:
    r = client.post("/api/course/coach", json={
        "exerciseId": "fo-04", "lang": "ru",
        "text": "Наталья, что для вас важнее всего в жильце?",
    })
    assert r.status_code == 200
    assert r.json() == {"note": None, "techniques": []}


def test_coach_rejects_unknown_or_non_freeform_exercise() -> None:
    assert client.post("/api/course/coach",
                       json={"exerciseId": "nope", "text": "…"}).status_code == 400
    # `choice` не свободный ответ: комментировать нечего, и вариант всё равно
    # проверяется индексом.
    assert client.post("/api/course/coach",
                       json={"exerciseId": "fo-01", "text": "…"}).status_code == 400


def test_coach_ignores_empty_text() -> None:
    r = client.post("/api/course/coach", json={"exerciseId": "fo-04", "text": "   "})
    assert r.status_code == 200 and r.json()["note"] is None
