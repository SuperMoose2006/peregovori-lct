"""Разбор хода состоит из ДВУХ вещей, и готовы они в разное время.

ЧТО ЗДЕСЬ ДОКАЗЫВАЕТСЯ И ЗАЧЕМ. Документ обещает: «через 3 мс под репликой
игрока уже горят теги приёмов и качество аргумента». Половина обещания была
неправдой в обе стороны сразу.

  • Теги (`tags`, `primary`, `spin`, `flags`) действительно готовы за 3 мс и
    после этого НЕ МЕНЯЮТСЯ — ни от судьи, ни от `apply_move`. А клиент держал
    их в буфере до реплики оппонента, то есть ~1300 мс.

  • `arg_quality` в `turn.analysis` — ЧЕРНОВИК. Судья его перепишет
    (32 → 5), штраф за повтор обрежет (84 → 12), и второе происходит даже
    когда судьи нет вовсе. То есть показанное клиентом число не было ни
    судейским, ни движковым: его не использовал никто.

Первый тест меряет расхождение на эталонных партиях — тех же, что доказывают
баланс. Второй проверяет, что авторитетное число доезжает до клиента в
`engine.state`, а не остаётся внутри сервера.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app import engine, views
from app.main import app

FIXTURES = Path(__file__).resolve().parents[3] / "frontend/test/fixtures/games.json"

#: Судья, который вмешивается во всё, что ему разрешено: переписывает балл и
#: накладывает все три вето. Если теги от него всё-таки зависят — здесь это
#: видно наверняка.
LOUD_JUDGE = {
    "arg_score": 5, "interest_targeted": 0, "secondary_conceded": None,
    "criteria_legitimate": False, "tradeoff_real": False, "batna_real": False,
    "note": "", "techniques": [],
}

STABLE_FIELDS = ("tags", "primary", "spin", "flags")


def _ladder() -> tuple[str, str, list[tuple[str, list[str]]]]:
    """Эталонные партии из общей фикстуры. Форма её принадлежит не нам, поэтому
    читаем обе редакции: один язык (`lang` + плоские `lines`) и оба
    (`langs`/`mirror` + `lines` по языкам)."""
    data = json.loads(FIXTURES.read_text(encoding="utf-8"))["ladder"]
    lang = data.get("lang") or data.get("mirror") or (data.get("langs") or ["ru"])[0]
    games = []
    for g in data["games"]:
        lines = g["lines"]
        games.append((g["id"], lines[lang] if isinstance(lines, dict) else lines))
    return data["scenario"], lang, games


def _play(scenario: str, lang: str, lines: list[str], judge: dict | None):
    """Партия ход за ходом. На каждом — снимок разбора ДО судьи и ПОСЛЕ хода."""
    sess = engine.create_session(scenario, lang)
    out = []
    for text in lines:
        analysis = engine.analyze(text)
        published = views.analysis_view(analysis).model_dump()   # то, что уходит за 3 мс
        engine.apply_move(sess, analysis, text,
                          judge=copy.deepcopy(judge) if judge else None)
        settled = views.analysis_view(analysis).model_dump()     # то, что ушло в грейд
        out.append((text, published, settled))
        if sess.state.status != "active":
            break
    return out


def test_tags_are_settled_at_three_milliseconds_and_the_score_is_not():
    """Теги устойчивы; число — нет. Это и есть основание отдавать их порознь."""
    scenario, lang, games = _ladder()

    turns = 0
    score_moved_with_judge = 0
    score_moved_without_judge = 0

    for name, lines in games:
        plain = _play(scenario, lang, lines, None)
        judged = _play(scenario, lang, lines, LOUD_JUDGE)
        assert len(plain) == len(judged)

        for (text, pub_a, settled_plain), (_, pub_b, settled_judged) in zip(plain, judged):
            turns += 1
            assert pub_a == pub_b, (
                f"[{name}] снимок на 3 мс обязан не зависеть от судьи — "
                "он снимается ДО обращения к нему")
            for field in STABLE_FIELDS:
                assert pub_a[field] == settled_plain[field], (
                    f"[{name}] движок переписал «{field}» после публикации: {text[:40]!r}")
                assert pub_a[field] == settled_judged[field], (
                    f"[{name}] судья переписал «{field}»: {text[:40]!r}. Если это правда, "
                    "теги нельзя зажигать раньше судьи, и правку надо откатывать")
            if pub_a["arg_quality"] != settled_judged["arg_quality"]:
                score_moved_with_judge += 1
            if pub_a["arg_quality"] != settled_plain["arg_quality"]:
                score_moved_without_judge += 1

    assert turns >= 40, "эталонные партии должны давать десятки ходов, иначе замер ни о чём"
    # Обратная сторона: если бы число тоже было устойчиво, отдельный канал для
    # него был бы лишней сложностью. Оно неустойчиво, и без судьи тоже.
    assert score_moved_with_judge > 0, "судья обязан переписывать балл — иначе он ничего не делает"
    assert score_moved_without_judge > 0, (
        "штраф за повтор обязан обрезать балл ПОСЛЕ публикации — именно поэтому "
        "черновик нельзя показывать даже офлайн")


def test_engine_state_carries_the_score_that_actually_counted():
    """Авторитетное число обязано доехать до клиента, а не остаться на сервере.

    Берём спам-повтор: `turn.analysis` показывает высокий черновик, а в метрики
    (и в грейд) уходит обрезанный. До правки клиенту приезжал только черновик.
    """
    line = ("По рыночным данным медиана независимых прайсов 90, потому что это "
            "отраслевой стандарт, и если мы дадим годовой контракт, сможете "
            "подвинуться? Я вас слышу и ценю вашу позицию.")

    client = TestClient(app)
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        ws.receive_json()
        ws.send_json({"type": "session.init",
                      "payload": {"scenarioId": "supplier", "lang": "ru"}})
        ws.receive_json()

        drafts: list[int] = []
        settled: list[dict] = []
        for _ in range(2):                      # тот же абзац дважды — второй повтор
            ws.send_json({"type": "input.append", "input": {"text": line}})
            ws.send_json({"type": "input.commit"})
            for _ in range(14):
                event = ws.receive_json()
                if event["type"] == "turn.analysis":
                    drafts.append(event["analysis"]["arg_quality"])
                elif event["type"] == "engine.state":
                    settled.append(event)
                elif event["type"] == "response.done":
                    break

        ws.send_json({"type": "session.close", "reason": "user_stop"})

    assert len(drafts) == 2 and len(settled) == 2

    for event in settled:
        assert "arg_quality" in event, (
            "клиенту нечем нарисовать честное число: `engine.state` его не несёт")
        assert "judged" in event, "источник балла обязан ехать вместе с баллом (принцип 2)"
        assert event["judged"] is False, "conftest держит нас офлайн — судьи здесь нет"

    assert settled[1]["arg_quality"] < drafts[1], (
        "повтор обязан обрезать балл, и клиент обязан увидеть обрезанный: "
        f"черновик {drafts[1]}, авторитетное {settled[1]['arg_quality']}")
