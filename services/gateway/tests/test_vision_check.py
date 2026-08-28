"""Ручка калибровки камеры: годится ли кадр для игры.

Страница проверки оборудования умеет доказать, что браузер отдал поток и кадр
нарисовался. Главного она доказать не может — что МОДЕЛЬ на этом кадре что-то
видит. А жалоба «камера не работает» чаще всего означает именно это: поток есть,
а в кадре темно или лицо срезано краем.
"""
import os
os.environ.setdefault("NEGO_AI", "off")

from fastapi.testclient import TestClient

from app.main import app
from app.perception.vision import parse_calibration

client = TestClient(app)


def test_without_a_key_it_says_unavailable_instead_of_inventing_a_checklist():
    """Принцип 2: слой, которого нет, не притворяется."""
    r = client.post("/api/vision/check", json={"frame": "x" * 100, "lang": "ru"})
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False and body["reason"] == "no_key"
    assert "person" not in body, "выдуман чек-лист без модели"


def test_an_empty_frame_is_a_client_error_not_a_verdict():
    assert client.post("/api/vision/check", json={"lang": "ru"}).status_code == 400


def test_a_huge_frame_is_refused_before_it_reaches_the_model():
    """Кадр 320px качества 0.6 — около 15 КБ. Полмегабайта это уже чей-то файл."""
    r = client.post("/api/vision/check", json={"frame": "x" * 800_000})
    assert r.status_code == 413


def test_a_missing_line_is_not_a_no():
    """Молчание модели и ответ «нет» — разные вещи.

    Показать «лицо не видно» там, где модель просто не ответила, значит
    придумать данные — та же ошибка, что и в «покерфейсе».
    """
    out = parse_calibration("ЧЕЛОВЕК: да")
    assert out["person"] is True
    assert out["face"] is None and out["light"] is None


def test_both_languages_parse_and_the_hint_survives():
    ru = parse_calibration("ЧЕЛОВЕК: да\nЛИЦО: нет\nСВЕТ: да\nОтодвиньтесь немного назад.")
    assert (ru["person"], ru["face"], ru["light"]) == (True, False, True)
    assert "Отодвиньтесь" in ru["hint"]

    en = parse_calibration("PERSON: yes\nFACE: yes\nLIGHT: no\nTurn on a lamp.")
    assert (en["person"], en["face"], en["light"]) == (True, True, False)
    assert en["hint"] == "Turn on a lamp."


def test_all_clear_carries_no_hint():
    out = parse_calibration("ЧЕЛОВЕК: да\nЛИЦО: да\nСВЕТ: да")
    assert out["hint"] == ""


def test_calibration_never_lands_in_the_session_observations():
    """Калибровка отвечает на другой вопрос и в разбор партии не попадает."""
    import inspect

    from app.perception.vision import VisionSampler
    src = inspect.getsource(VisionSampler.calibrate)
    assert "_record" not in src and "_publish" not in src
