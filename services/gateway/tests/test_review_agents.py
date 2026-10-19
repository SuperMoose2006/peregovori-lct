"""test_review_agents.py — разбор ответов агентов: что модель может прислать криво.

Дешёвая модель отвечает не всегда по форме: число по сто-балльной шкале вместо
доли, строка вместо числа, лишние коды. Разбор обязан либо понять ответ, либо
выбросить его — но не превратить «70» в «100%».
"""

from app.review.agents import _parse_competency, parse_face, parse_voice


def test_a_score_out_of_a_hundred_is_read_as_a_share():
    out = _parse_competency({"competencies": [
        {"id": "interests", "score": 70, "pro": [], "con": []},
        {"id": "listening", "score": "0.4", "pro": [], "con": []},
        {"id": "value", "score": 250, "pro": [], "con": []},
        {"id": "rapport", "score": -3, "pro": [], "con": []},
    ]})
    got = {c["id"]: c["score"] for c in out["competencies"]}
    assert got == {"interests": 0.7, "listening": 0.4}, \
        "«70» — это 70 из 100, а не 100%; число вне шкал — не ответ"


def test_voice_events_outside_the_clip_or_the_list_are_dropped():
    raw = '{"events": [{"t": 1.2, "kind": "filler", "text": "э-э"}, {"t": 9, "kind": "filler"}, {"t": 1, "kind": "anxious"}]}'
    assert parse_voice(raw, 2.0) == [{"t": 1.2, "kind": "filler", "text": "э-э"}]
    assert parse_voice("не JSON", 2.0) is None


def test_face_frames_keep_only_known_codes_and_real_indexes():
    raw = '{"frames": [{"i": 1, "cues": ["Frown", "nervous"]}, {"i": 9, "cues": ["smile"]}, {"i": 2, "cues": []}]}'
    assert parse_face(raw, 2) == {1: ["frown"], 2: []}
