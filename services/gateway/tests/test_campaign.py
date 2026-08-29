"""Tests for campaign mode: catalog endpoint + reputation carry."""

import json
import os
from pathlib import Path
os.environ.setdefault("NEGO_AI", "off")

from fastapi.testclient import TestClient
from app.main import app
from app import engine, views
from app.engine.techniques import analyze

FIXTURE = (Path(__file__).resolve().parents[3]
           / "frontend" / "test" / "fixtures" / "games.json")

client = TestClient(app)


def test_campaigns_endpoint_bilingual():
    for lang in ("ru", "en"):
        r = client.get(f"/api/campaigns?lang={lang}")
        assert r.status_code == 200
        camps = r.json()["campaigns"]
        assert len(camps) >= 1
        c = camps[0]
        assert c["stages"] and len(c["stages"]) == 4
        # every stage references a real scenario, with narrative
        for st in c["stages"]:
            assert engine.by_id(st["scenario_id"]) is not None
            assert st["act"] and st["intro"] and st["title"]


def test_reputation_nudges_initial_trust():
    base = engine.create_session("supplier", "ru").state.trust
    up = engine.create_session("supplier", "ru")
    views.apply_reputation(up, 100)   # stellar prior result
    down = engine.create_session("supplier", "ru")
    views.apply_reputation(down, -100)  # poor prior result
    assert up.state.trust > base > down.state.trust
    # clamped to ±15
    assert abs(up.state.trust - base) <= 15.001
    assert abs(down.state.trust - base) <= 15.001


def test_campaign_start_applies_reputation():
    """Репутация из прошлых актов приезжает в стартовое доверие оппонента.

    Через realtime-протокол: старая ручка `/ws` удалена, а инвариант — нет.
    """
    with client.websocket_connect("/v1/realtime?mode=text") as ws:
        assert ws.receive_json()["type"] == "session.queue_done"
        ws.send_json({"type": "session.init", "payload": {
            "scenarioId": "conflict", "lang": "ru",
            "gameMode": "campaign", "reputation": 100}})
        created = ws.receive_json()
        assert created["type"] == "session.created"
        # базовое доверие в «конфликте» — 40; +100 репутации → +12 → ~52
        assert created["state"]["trust"] > 45


# --------------------------------------------------------------- эпилог и вторая кампания

def test_every_campaign_has_a_full_bilingual_epilogue():
    """Полос пять, и ни одна не имеет права быть пустой.

    Эпилог показывается ПОСЛЕ последнего акта, то есть в единственный момент,
    когда человек уже не может ничего исправить, — недописанная полоса здесь
    видна как пустой экран в финале.
    """
    from app.engine.campaigns import CAMPAIGNS, epilogue_key
    bands = {epilogue_key(r) for r in (80, 30, 0, -30, -80)}
    assert bands == {"triumph", "solid", "mixed", "strained", "burnt"}
    for c in CAMPAIGNS:
        assert set(c.epilogue) == bands, f"кампания {c.id}: полосы эпилога не сошлись"
        for key, text in c.epilogue.items():
            for lang in ("ru", "en"):
                assert text.get(lang, "").strip(), f"{c.id}/{key}/{lang} пуст"


def test_epilogue_english_carries_no_cyrillic():
    """Инвариант 4: билингвальность во всём пользовательском тексте."""
    import re
    from app.engine.campaigns import CAMPAIGNS
    cyr = re.compile(r"[а-яА-ЯёЁ]")
    for c in CAMPAIGNS:
        assert not cyr.search(c.tagline["en"]), c.id
        for key, text in c.epilogue.items():
            assert not cyr.search(text["en"]), f"{c.id}/{key}"
        for st in c.stages:
            assert not cyr.search(st.act["en"]) and not cyr.search(st.intro["en"]), st.scenario_id


def test_campaign_bands_agree_with_the_greeting_thresholds():
    """Финал и приветствие описывают одного человека, а не разных.

    `views.reputation_intro` здоровается по тем же порогам. Разъедься они — и
    оппонент в четвёртом акте говорил бы «наслышан, вы жёстки», а эпилог хвалил
    бы за сохранённые отношения.
    """
    from app.engine.campaigns import epilogue_key
    from app.views import reputation_intro
    for rep in (60, 46, 44, 20, 16, 14, 0, -14, -16, -44, -46, -60):
        warm = epilogue_key(rep) in ("triumph", "solid")
        intro = reputation_intro(float(rep), "ru")
        if warm:
            assert intro, f"репутация {rep}: эпилог тёплый, а приветствия нет"


def test_every_stage_points_at_a_real_scenario():
    from app.engine import scenarios as sc
    from app.engine.campaigns import CAMPAIGNS
    known = {s.id for s in sc.SCENARIOS}
    assert len(known) == 9, "сценариев стало другое число — проверьте кампании"
    for c in CAMPAIGNS:
        for st in c.stages:
            assert st.scenario_id in known, f"{c.id}: нет сценария {st.scenario_id}"


def test_the_two_campaigns_do_not_reuse_the_same_table():
    """Вторая кампания — новый путь, а не тот же набор столов в другом порядке."""
    from app.engine.campaigns import CAMPAIGNS
    used = [{st.scenario_id for st in c.stages} for c in CAMPAIGNS]
    for i, a in enumerate(used):
        for b in used[i + 1:]:
            assert not (a & b), f"кампании делят столы: {a & b}"


# ---------------------------------------------------------------------------
# Каждая написанная концовка обязана быть достижимой
# ---------------------------------------------------------------------------

def test_every_epilogue_band_is_reachable():
    """Четыре финала — четыре разных текста. Ни один не имеет права пустовать.

    ПОЧЕМУ ЭТО НЕ ОЧЕВИДНО. Репутация копится как `overall − 50` за акт, а
    `overall` распределён не равномерно: в этом продукте шестнадцать эталонных
    партий дают либо F (14…29), либо B/A (73…92), и середины среди них нет
    вовсе. Естественно было предположить, что и финалов на деле два —
    «триумф» и «испорченные отношения», — а две средние полосы написаны зря.

    ПРОВЕРЕНО ПЕРЕБОРОМ, и предположение оказалось ложным: двадцать тысяч
    кампаний, где каждый акт берётся из ВСЕХ подмножеств принципиальной линии
    этого стола, распределились как 29/28/25/13 процентов у «Восхождения» и
    36/28/22/11 у «Своего дела». Полосы населены.

    Здесь закреплено более слабое, зато точное и дешёвое утверждение: диапазон
    достижимой репутации накрывает КАЖДЫЙ порог. Перебор двадцати тысяч партий
    в наборе тестов держать незачем — он проверяет то же самое, но за минуты.
    Правка баланса, отрезавшая финал, свалит эту проверку.
    """
    from app.engine.campaigns import CAMPAIGNS, _EPILOGUE_BANDS, epilogue_key

    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    principled = {k: v for k, v in fixture["principled"].items() if k != "note"}

    for camp in CAMPAIGNS:
        lo = hi = 0.0
        for stage in camp.stages:
            lines = principled[stage.scenario_id]["ru"]
            # Худший акт — молчание: партия срывается по лимиту ходов.
            worst = _overall(stage.scenario_id, ["Ага."] * 12)
            best = _overall(stage.scenario_id, lines)
            assert best > worst, f"{camp.id}/{stage.scenario_id}: игра ничего не меняет"
            lo += worst - 50
            hi += best - 50

        lo, hi = max(-100.0, lo), min(100.0, hi)
        for threshold, key in _EPILOGUE_BANDS:
            assert lo <= threshold <= hi or key == epilogue_key(lo), (
                f"{camp.id}: финал «{key}» недостижим — репутация ходит "
                f"в диапазоне {lo:.0f}…{hi:.0f}, а порог {threshold}")
        # И крайние точки обязаны давать РАЗНЫЕ финалы, иначе диапазон
        # формально накрывает пороги, а игрок всегда читает один текст.
        assert epilogue_key(lo) != epilogue_key(hi), (
            f"{camp.id}: и лучшая, и худшая кампания кончаются одинаково")


def _overall(scenario_id: str, lines: list[str]) -> int:
    sess = engine.create_session(scenario_id, "ru")
    for text in lines:
        if sess.state.status != "active":
            break
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text)
        if sess.state.status == "active" and sess.turn >= sess.max_turns:
            sess.state.status = "breakdown"
    return engine.score_session(sess)["overall"]
