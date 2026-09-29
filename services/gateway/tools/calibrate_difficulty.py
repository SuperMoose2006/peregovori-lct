#!/usr/bin/env python3
"""Matched offline difficulty measurement; no network, engine or fixture edits.

Run from any directory with Python >= 3.10, standard library only. Every case
is replayed at every difficulty. Permutations/locales are coverage within a
scenario, not independent experimental units: inference clusters by scenario.
The optional JSON contains the input transcripts, final states and turn ledger.
"""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import contextmanager, nullcontext
from dataclasses import asdict, replace
import hashlib
import itertools
import json
import math
from pathlib import Path
import random
import statistics
import sys
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "services/gateway"))

from app.engine import engine as eng  # noqa: E402
from app.engine.techniques import analyze  # noqa: E402

FIXTURE = ROOT / "frontend/test/fixtures/games.json"
LEVELS = range(1, 6)
POLICIES = ("package", "early_close", "hold_target")
SEED = 20260929
BOOTSTRAPS = 20000
GRADES = "ABCDEF"  # E is deliberately shown as zero: the engine has no E grade.
BASELINE = Path(__file__).resolve().parent / "fixtures/difficulty_baseline.json"
OPENING_SLOPE = 0.0
PROFILES = ("current", "baseline", "three", "opening10", "opening25", "opening50")


@contextmanager
def configuration(name: str):
    """Historical/candidate configurations exist only in this offline process.

    Baseline and literal three-parameter trial stay reproducible after the
    accepted balance changes. Opening-price candidates never alter production
    scenario objects. They are exploratory, not deployed balancing rules.
    """
    global OPENING_SLOPE
    previous_slope = OPENING_SLOPE
    settings = {}
    if name == "baseline":
        settings = dict(DIFFICULTY_CONCESSION_K=.06, DIFFICULTY_TRUST_GATE_STEP=2.,
                        PRICE_STEP_DIVISOR=16, OPENING_PRICE_STEP_DIVISOR=16,
                        REVEAL_TRUST_GATE_MAX=100.)
    elif name == "three":
        settings = dict(DIFFICULTY_CONCESSION_K=.12, DIFFICULTY_TRUST_GATE_STEP=4.,
                        PRICE_STEP_DIVISOR=32, OPENING_PRICE_STEP_DIVISOR=32,
                        REVEAL_TRUST_GATE_MAX=100.)
    OPENING_SLOPE = {"opening10": .10, "opening25": .25, "opening50": .50}.get(name, 0.)
    try:
        with patch.multiple(eng, **settings) if settings else nullcontext():
            yield
    finally:
        OPENING_SLOPE = previous_slope


def play(sid: str, lang: str, level: int, lines: list[str]) -> dict:
    if OPENING_SLOPE:
        original_lookup = eng.by_id
        sc = original_lookup(sid)
        opening = sc.opponent_reservation + (sc.opponent_open - sc.opponent_reservation) * (
            1 + OPENING_SLOPE * (level - 1))
        candidate = replace(sc, opponent_open=round(opening, 2))
        with patch.object(eng, "by_id", lambda key: candidate if key == sid else original_lookup(key)):
            return _play(sid, lang, level, lines)
    return _play(sid, lang, level, lines)


def _play(sid: str, lang: str, level: int, lines: list[str]) -> dict:
    sess = eng.create_session(sid, lang)
    sess.difficulty = level
    sc = eng.by_id(sid)
    end_reason = None
    for line in lines:
        if sess.state.status != "active":
            break
        sess.turn += 1
        result = eng.apply_move(sess, analyze(line), line)
        if sess.state.status == "active" and sess.turn >= sess.max_turns:
            # This belongs to the orchestrator, not apply_move (negotiation.py).
            sess.state.status = "breakdown"
            end_reason = "turn_limit"
        elif sess.state.status == "breakdown":
            end_reason = "trust_or_tension"
        elif sess.state.status == "agreement":
            end_reason = "agreement"
        sess.ledger[-1]["concession_fraction"] = result.concession_fraction
        # Ledger's status precedes the orchestrator's turn-limit check.
        sess.ledger[-1]["status_after_turn_limit"] = sess.state.status
        floor_ok = (sess.state.offer_opp >= sc.opponent_reservation - 0.001
                    if sess.lower_better else
                    sess.state.offer_opp <= sc.opponent_reservation + 0.001)
        if not floor_ok:
            raise RuntimeError(f"opponent floor crossed: {sid}/{lang}/{level}")
    if sess.state.status == "active":
        raise RuntimeError(f"unfinished measurement: {sid}/{lang}/{level}")
    if not (1 <= sess.turn <= sess.max_turns):
        raise RuntimeError("invalid turn count")
    if (sess.state.status == "agreement") != (sess.state.deal is not None):
        raise RuntimeError("agreement/deal mismatch")
    score = eng.score_session(sess)
    deal = sess.state.deal
    agreed = sess.state.status == "agreement"
    def reaches(limit: float) -> bool:
        return bool(agreed and deal is not None and
                    (deal <= limit + 0.001 if sess.lower_better else deal >= limit - 0.001))
    span = abs(sc.opponent_open - sc.opponent_reservation)
    return {
        "scenario": sid, "lang": lang, "difficulty": level,
        "status": sess.state.status, "end_reason": end_reason,
        "turns": sess.turn, "deal": deal, "offer_opp": sess.state.offer_opp,
        "within_reservation": reaches(sc.player_reservation),
        "target_reached": reaches(sc.player_target),
        "conceded_span_pct": 100 * abs(sess.state.offer_opp - sc.opponent_open) / span,
        "interests_found": len(sess.state.interests_found),
        **{k: score[k] for k in ("overall", "grade", "economic", "relationship", "technique")},
        "ledger": sess.ledger,
    }


def reference_check(fixtures: dict, expected: dict | None = None) -> int:
    """Calibrate the harness against committed scores before measuring anything."""
    if expected is None:
        expected = json.loads((FIXTURE.parent / "games.scores.json").read_text())
    count = 0
    for sid, langs in fixtures.items():
        for lang in ("ru",):
            lines = langs[lang]
            actual = play(sid, lang, eng.by_id(sid).difficulty, lines)
            # Committed score snapshots contain RU; do not invent an EN baseline.
            section = expected["principled"]
            for key in ("overall", "grade", "economic", "relationship", "technique",
                        "status", "interests_found", "turn", "deal", "offer_opp"):
                observed = actual["turns" if key == "turn" else key]
                if observed != section[sid][key]:
                    raise RuntimeError(f"reference mismatch {sid}/{lang}/{key}: "
                                       f"{observed!r} != {section[sid][key]!r}")
            count += 1
    return count


def cases(fixtures: dict, policy: str):
    for sid, langs in sorted(fixtures.items()):
        sc = eng.by_id(sid)
        for lang in ("ru", "en"):
            lines = langs[lang]
            for order in itertools.permutations(range(3)):
                prefix = [lines[i] for i in order]
                if policy == "package":
                    script = prefix + lines[3:]
                elif policy == "early_close":
                    script = prefix + [lines[3], "Договорились." if lang == "ru" else "Deal, agreed."]
                else:
                    close = (f"Договорились на {sc.player_target:g}." if lang == "ru"
                             else f"Agreed at {sc.player_target:g}.")
                    budget = eng.create_session(sid, lang).max_turns
                    script = prefix + lines[3:5] + [close] * (budget - 5)
                case_id = f"{sid}/{lang}/{''.join(str(i + 1) for i in order)}"
                yield case_id, sid, lang, script


def summarize(rows: list[dict]) -> dict:
    n = len(rows)
    deals = [r for r in rows if r["status"] == "agreement"]
    grades = Counter(r["grade"] for r in rows)
    return {
        "n": n,
        "agreement_pct": 100 * len(deals) / n,
        "breakdown_pct": 100 * sum(r["status"] == "breakdown" for r in rows) / n,
        "overall": statistics.mean(r["overall"] for r in rows),
        "grades": {g: grades[g] for g in GRADES},
        "agreement_turns": statistics.mean(r["turns"] for r in deals) if deals else None,
        "all_turns": statistics.mean(r["turns"] for r in rows),
        "within_reservation_pct": 100 * sum(r["within_reservation"] for r in rows) / n,
        "target_reached_pct": 100 * sum(r["target_reached"] for r in rows) / n,
        "conceded_span_pct": statistics.mean(r["conceded_span_pct"] for r in rows),
        "gate_blocks": sum(sum(t["gated"] for t in r["ledger"]) for r in rows),
        "at_concession_cap": sum(sum(abs(t["concession_fraction"] - .7) < 1e-10
                                     for t in r["ledger"]) for r in rows),
        "economic_100": sum(r["economic"] == 100 for r in rows),
    }


def quantile(xs: list[float], p: float) -> float:
    at = (len(xs) - 1) * p
    lo = math.floor(at)
    hi = math.ceil(at)
    return xs[lo] + (xs[hi] - xs[lo]) * (at - lo)


def compare(rows: list[dict], lo: int, hi: int) -> dict:
    left = {r["case_id"]: r for r in rows if r["difficulty"] == lo}
    right = {r["case_id"]: r for r in rows if r["difficulty"] == hi}
    if left.keys() != right.keys():
        raise RuntimeError("unpaired cases")
    differences = [left[k]["overall"] - right[k]["overall"] for k in sorted(left)]
    groups = sorted({r["scenario"] for r in left.values()})
    # One statistical unit per authored scenario; both locales and all orderings
    # move together. Otherwise deterministic duplicates inflate significance.
    clusters = [statistics.mean(left[k]["overall"] - right[k]["overall"]
                                for k in left if left[k]["scenario"] == sid)
                for sid in groups]
    observed = abs(sum(clusters))
    signs = list(itertools.product((-1, 1), repeat=len(clusters)))
    p = sum(abs(sum(x * sign for x, sign in zip(clusters, signs_))) >= observed - 1e-12
            for signs_ in signs) / len(signs)
    rng = random.Random(SEED)
    boot = sorted(statistics.mean(rng.choices(clusters, k=len(clusters)))
                  for _ in range(BOOTSTRAPS))
    return {
        "pair": f"{lo}→{hi}", "drop": statistics.mean(differences),
        "ci95": [quantile(boot, .025), quantile(boot, .975)],
        "p_exact": p, "scenario_drops": dict(zip(groups, clusters)),
        "lower_score": sum(x > 0 for x in differences),
        "same_score": sum(x == 0 for x in differences),
        "higher_score": sum(x < 0 for x in differences),
        "agreement_changes": sum((left[k]["status"] == "agreement") !=
                                  (right[k]["status"] == "agreement") for k in left),
        "grade_changes": sum(left[k]["grade"] != right[k]["grade"] for k in left),
    }


def holm(comparisons: list[dict]) -> None:
    previous = 0.0
    for rank, row in enumerate(sorted(comparisons, key=lambda x: x["p_exact"])):
        previous = max(previous, min(1., (len(comparisons) - rank) * row["p_exact"]))
        row["p_holm"] = previous


def parameters(sids: list[str]) -> dict:
    varying = []
    for d in LEVELS:
        sess = eng.create_session(sids[0])
        sess.difficulty = d
        varying.append({"difficulty": d, "resistance": eng.resistance(sess),
                        "trust_gate": eng.reveal_trust_gate(sess),
                        "max_turns": sess.max_turns, "trust": sess.state.trust,
                        "tension": sess.state.tension, "info": sess.state.info})
    fixed = []
    for sid in sids:
        sc = eng.by_id(sid)
        width = ((sc.player_reservation - sc.opponent_reservation) if
                 sc.headline.dir == "lower_is_better" else
                 (sc.opponent_reservation - sc.player_reservation))
        fixed.append({"scenario": sid, "direction": sc.headline.dir,
                      "style": sc.counterpart.style, "open": sc.opponent_open,
                      "floor": sc.opponent_reservation, "target": sc.player_target,
                      "reservation": sc.player_reservation, "zopa": width,
                      "player_batna": sc.player_batna.strength,
                      "step": eng.price_step(sc),
                      "opening_step": eng.price_step(sc, opening=True),
                      "open_by_level": [round(sc.opponent_reservation +
                          (sc.opponent_open - sc.opponent_reservation) *
                          (1 + OPENING_SLOPE * (d - 1)), 2) for d in LEVELS],
                      "target_reachable": eng.target_reachable(sc)})
    # Arithmetic of proposals only. Never installed into the engine/session.
    proposal = [{"difficulty": d, "resistance_at_k_012": 1 + .12 * (3.5 - d),
                 "gate_at_step_4": 30 + 4 * (d - 2)} for d in LEVELS]
    return {"levels": varying, "scenarios": fixed, "proposal_arithmetic": proposal,
            "concession_k": eng.DIFFICULTY_CONCESSION_K,
            "gate_step": eng.DIFFICULTY_TRUST_GATE_STEP,
            "gate_cap": eng.REVEAL_TRUST_GATE_MAX,
            "price_divisor": eng.PRICE_STEP_DIVISOR,
            "opening_price_divisor": eng.OPENING_PRICE_STEP_DIVISOR,
            "opening_slope": OPENING_SLOPE}


def markdown(data: dict) -> str:
    out = [f"# Числа калибровки сложности: {data['profile']}", "",
           "Настройки: " + json.dumps({k: v for k, v in data['parameters'].items()
                                       if k not in ('levels', 'scenarios', 'proposal_arithmetic')}), "",
           f"Проверено исторических эталонов: {data['reference_games']}. "
           f"Всего измерительных партий: {len(data['games'])}.", "",
           "| Уровень | Множитель уступки | Доверие строго выше | Лимит ходов | Старт trust/tension/info |",
           "|---|---:|---:|---:|---|"]
    for p in data["parameters"]["levels"]:
        out.append(f"| {p['difficulty']} | {p['resistance']:.2f} | {p['trust_gate']:g} | "
                   f"{p['max_turns']} | {p['trust']:g}/{p['tension']:g}/{p['info']:g} |")
    out += ["", "Числа исходных сценариев (для экспериментов opening — уровень 1; на других уровнях шаг вычисляется заново):", "",
            "| Сценарий | Направление | Стиль | Старт | Дно | Цель | Предел игрока | ZOPA | BATNA игрока | Первый шаг | Шаг торга |",
            "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for p in data["parameters"]["scenarios"]:
        out.append("| " + " | ".join(str(p[k]) for k in ("scenario", "direction", "style", "open", "floor",
                   "target", "reservation", "zopa", "player_batna", "opening_step", "step")) + " |")
    if data['parameters']['opening_slope']:
        out += ["", "Стартовая цена экспериментального оппонента (прочие условия сценария сохранены):", "",
                "| Сценарий | 1 | 2 | 3 | 4 | 5 |", "|---|---:|---:|---:|---:|---:|"]
        for p in data['parameters']['scenarios']:
            out.append(f"| {p['scenario']} | " + " | ".join(map(str, p['open_by_level'])) + " |")
    for policy in POLICIES:
        out += ["", f"## {policy}", "",
                "| Уровень | N | Сделки % | Балл | A/B/C/D/E/F (число) | Ходы до сделки | Срывы % | В пределах игрока % | Достигнута цель % |",
                "|---|---:|---:|---:|---|---:|---:|---:|---:|"]
        for d in LEVELS:
            s = data["summaries"][policy][d]
            turns = "—" if s["agreement_turns"] is None else f"{s['agreement_turns']:.2f}"
            out.append(f"| {d} | {s['n']} | {s['agreement_pct']:.2f} | {s['overall']:.4f} | "
                       f"{'/'.join(str(s['grades'][g]) for g in GRADES)} | {turns} | "
                       f"{s['breakdown_pct']:.2f} | {s['within_reservation_pct']:.2f} | {s['target_reached_pct']:.2f} |")
        out += ["", "| Пара | Падение балла | 95% cluster bootstrap | p exact | p Holm | Ниже/равно/выше | Смены грейда | Смены соглашения |",
                "|---|---:|---|---:|---:|---|---:|---:|"]
        for c in data["comparisons"][policy]:
            out.append(f"| {c['pair']} | {c['drop']:.4f} | [{c['ci95'][0]:.4f}; {c['ci95'][1]:.4f}] | "
                       f"{c['p_exact']:.5f} | {c['p_holm']:.5f} | "
                       f"{c['lower_score']}/{c['same_score']}/{c['higher_score']} | "
                       f"{c['grade_changes']} | {c['agreement_changes']} |")
        out += ["", "| Уровень | Пройдено пути до дна % | Заблокировано вопросов | Ходов на потолке уступки | Партий economic=100 |",
                "|---|---:|---:|---:|---:|"]
        for d in LEVELS:
            s = data["summaries"][policy][d]
            out.append(f"| {d} | {s['conceded_span_pct']:.4f} | {s['gate_blocks']} | "
                       f"{s['at_concession_cap']} | {s['economic_100']} |")
        out += ["", "| Срез | 1 | 2 | 3 | 4 | 5 |", "|---|---:|---:|---:|---:|---:|"]
        for group, rows in data["strata"][policy].items():
            out.append(f"| {group} | " + " | ".join(f"{rows[d]:.4f}" for d in LEVELS) + " |")
    out += ["", "Сравнение крайних уровней (отдельное семейство из трёх проверок):", "",
            "| Стратегия | Падение 1→5 | 95% cluster bootstrap | p exact | p Holm |",
            "|---|---:|---|---:|---:|"]
    for policy, c in data["endpoints"].items():
        out.append(f"| {policy} | {c['drop']:.4f} | [{c['ci95'][0]:.4f}; {c['ci95'][1]:.4f}] | "
                   f"{c['p_exact']:.5f} | {c['p_holm']:.5f} |")
    out += ["", "Вариант сокращения до уровней 1/3/5 (Holm по двум парам внутри стратегии):", "",
            "| Стратегия | Пара | Падение балла | p Holm |", "|---|---|---:|---:|"]
    for policy, comparisons in data['three_levels'].items():
        for c in comparisons:
            out.append(f"| {policy} | {c['pair']} | {c['drop']:.4f} | {c['p_holm']:.5f} |")
    out += ["", "Арифметика первоначального предложения; результаты выбранного профиля выше:", "",
            "| Уровень | K=0.12 | Шаг порога=4 |", "|---|---:|---:|"]
    for p in data["parameters"]["proposal_arithmetic"]:
        out.append(f"| {p['difficulty']} | {p['resistance_at_k_012']:.2f} | {p['gate_at_step_4']} |")
    out += ["", "SHA-256 входов:", ""]
    out += [f"- `{path}`: `{sha}`" for path, sha in data["source_sha256"].items()]
    return "\n".join(out) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, help="Write complete replay evidence, no credentials or IDs")
    parser.add_argument("--markdown", type=Path, help="Write numeric tables instead of stdout")
    parser.add_argument("--profile", choices=PROFILES, default="current",
                        help="Current engine, historical baseline, literal three changes, or opening-price trial")
    args = parser.parse_args()
    with configuration(args.profile):
        run(args)


def run(args: argparse.Namespace) -> None:
    paths = [FIXTURE, FIXTURE.parent / "games.scores.json", BASELINE, Path(__file__).resolve(),
             ROOT / "services/gateway/app/course/simulate.py",
             ROOT / "services/gateway/app/orchestrator/negotiation.py",
             ROOT / "services/gateway/app/ai/scenario_gen.py"]
    paths += sorted((ROOT / "services/gateway/app/engine").glob("*.py"))
    def fingerprint() -> dict:
        return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    sources_before = fingerprint()
    fixtures = {k: v for k, v in json.loads(FIXTURE.read_text())["principled"].items() if k != "note"}
    scenarios_before = {sid: asdict(eng.by_id(sid)) for sid in fixtures}
    baseline = json.loads(BASELINE.read_text())
    if hashlib.sha256(FIXTURE.read_bytes()).hexdigest() != baseline["input_sha256"]:
        raise RuntimeError("input corpus changed: before/after comparison requires original transcripts")
    with configuration("baseline"):
        references = reference_check(fixtures, baseline)
    if args.profile == "current":
        reference_check(fixtures)
    rows = []
    summaries, comparisons, strata, endpoints, three_levels = {}, {}, {}, {}, {}
    for policy in POLICIES:
        inputs = list(cases(fixtures, policy))
        if len(inputs) < 30 or len({tuple(c[3]) for c in inputs}) != len(inputs):
            raise RuntimeError("need at least 30 distinct input transcripts per level")
        cohort = []
        for case_id, sid, lang, lines in inputs:
            for d in LEVELS:
                row = play(sid, lang, d, lines)
                if row != play(sid, lang, d, lines):
                    raise RuntimeError(f"non-reproducible replay: {policy}/{case_id}/{d}")
                row.update(policy=policy, case_id=case_id, input_lines=lines)
                cohort.append(row)
        summaries[policy] = {d: summarize([r for r in cohort if r["difficulty"] == d]) for d in LEVELS}
        comparisons[policy] = [compare(cohort, d, d + 1) for d in range(1, 5)]
        holm(comparisons[policy])
        endpoints[policy] = compare(cohort, 1, 5)
        three_levels[policy] = [compare(cohort, 1, 3), compare(cohort, 3, 5)]
        holm(three_levels[policy])
        strata[policy] = {}
        for key in sorted(fixtures) + ["ru", "en", "lower_is_better", "higher_is_better"]:
            selected = [r for r in cohort if key in (r["scenario"], r["lang"],
                        eng.by_id(r["scenario"]).headline.dir)]
            strata[policy][key] = {d: statistics.mean(r["overall"] for r in selected if r["difficulty"] == d)
                                   for d in LEVELS}
        rows.extend(cohort)
    holm(list(endpoints.values()))
    if scenarios_before != {sid: asdict(eng.by_id(sid)) for sid in fixtures}:
        raise RuntimeError("measurement mutated a scenario")
    if sources_before != fingerprint():
        raise RuntimeError("source files changed during the measurement; rerun")
    data = {"profile": args.profile, "reference_games": references, "seed": SEED, "bootstrap_samples": BOOTSTRAPS,
            "parameters": parameters(sorted(fixtures)), "summaries": summaries,
            "comparisons": comparisons, "endpoints": endpoints, "three_levels": three_levels,
            "strata": strata, "games": rows,
            "source_sha256": sources_before}
    if args.json:
        args.json.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    rendered = markdown(data)
    if args.markdown:
        args.markdown.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
