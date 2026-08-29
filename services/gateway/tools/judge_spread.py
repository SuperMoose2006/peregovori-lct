#!/usr/bin/env python
"""judge_spread.py — воспроизводимость семантического судьи, замером.

ЗАЧЕМ. Судья (`app/orchestrator/judge.py`) — единственная НЕдетерминированная
деталь в критическом пути оценки: движок считает ход, взяв его `arg_score` на
место словарного. Первый принцип продукта («считает движок») выполняется по
букве — состояние меняет только движок, — но число, с которого он начинает,
приходит от модели. Значит вопрос «одна и та же партия даёт один и тот же
грейд?» решается не архитектурой, а температурой сэмплинга. Это надо мерить, а
не обсуждать.

ЧТО МЕРЯЕТСЯ. Два режима, и второй важнее первого.

  --mode turns  Одна реплика, K вызовов судьи. Печатает медиану/min/max/σ балла
                и — отдельно — разброс ДИСКРЕТНЫХ полей: индекс интереса и три
                вето. Балл входит в оценку сглаженно (14 очков техники на всю
                партию), а вето и индекс интереса — ступенькой: они решают,
                двинулась цена или нет.

  --mode games  Эталонная партия из frontend/test/fixtures/games.json, целиком,
                K раз через НАСТОЯЩИЕ engine.apply_move + живого судью. Печатает
                разброс overall и — то самое, ради чего всё, — набор грейдов.
                Разные грейды на одной и той же партии обесценивают сертификат.

ЗАПУСК. Ключ живёт в services/gateway/.env и в командную строку не попадает:

    cd services/gateway && set -a && . ./.env && set +a && \
        .venv/bin/python tools/judge_spread.py --mode turns --k 5

    .venv/bin/python tools/judge_spread.py --mode games --k 5 --game good

`--temperature` принимает СПИСОК, чтобы сравнить настройки на одних и тех же
репликах одним прогоном: `--temperature 0.2,0`.

Стоимость: turns → K·N вызовов, games → K·(длина партии). При K=5, N=6 это 30
вызовов дешёвой модели.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from collections import Counter
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

from app import engine, views  # noqa: E402
from app.ai.judge import build_prompts, parse_judgement  # noqa: E402
from app.providers.openrouter import chat as orchat  # noqa: E402

FIXTURE = _ROOT.parents[1] / "frontend" / "test" / "fixtures" / "games.json"

#: N=6 реплик — не выдуманных, а выдернутых из эталонных партий того же стола
#: (`supplier`, ru). Взяты по одной с каждой ступени лестницы качества, потому
#: что интересен не средний разброс, а разброс ВОЗЛЕ ПОРОГОВ: движок разводит
#: ходы по `arg_quality >= 35` (критерий засчитан событием) и `> 55` (BATNA
#: подкреплена). Реплика, чей балл ходит вокруг такого порога, меняет не 14
#: очков техники, а сам факт движения цены.
TURN_LINES: list[tuple[str, str]] = [
    ("passive",     "Ага 1."),
    ("haggling",    "Наша цена 88, дальше не пойдём."),
    ("alternating", "По рыночным данным медиана независимых прайсов 86, "
                    "потому что это отраслевой стандарт."),
    ("basic",       "Почему для вас так важна стабильная загрузка производства?"),
    ("good",        "Если мы дадим предоплату, сможете подвинуться к 87?"),
    ("principled",  "Фиксируем пакет: годовой контракт, предоплата — и цена 86. "
                    "Договорились?"),
]


def _load_dotenv() -> None:
    """То же, что делает main.py. Тул может запускаться и без `set -a`, но
    секрет всё равно приходит из файла, а не из командной строки."""
    path = _ROOT / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def _stats(values: list[float]) -> dict:
    if not values:
        return {}
    return {
        "n": len(values),
        "min": min(values),
        "median": statistics.median(values),
        "max": max(values),
        "spread": max(values) - min(values),
        "stdev": statistics.pstdev(values) if len(values) > 1 else 0.0,
    }


#: Секунды, потраченные на каждое суждение (одно или голосование). Сравнивать
#: цену вариантов на глаз нельзя: голосование идёт ПАРАЛЛЕЛЬНО, и его цена в
#: секундах — не сумма вызовов, а хвост самого медленного.
LATENCIES: list[float] = []


async def _one_judgement(context: str, text: str, lang: str, interests, secondary,
                         temperature: float, vote: int = 1) -> dict | None:
    """Суждение о реплике. Промпт и валидация — те же, что в бою.

    `vote > 1` — голосование: N вызовов параллельно, берём суждение с МЕДИАННЫМ
    баллом целиком. Именно целиком, а не по полям: балл 75 из одного ответа и
    вето из другого дали бы запись, которой не выносил никто.
    """
    system, user = build_prompts(context, text, lang, interests, secondary)

    async def call() -> dict | None:
        raw = await orchat.complete(system, user, role="judge", max_tokens=300,
                                    temperature=temperature, raw=True)
        return parse_judgement(raw or "", lang, interests, secondary)

    t0 = time.perf_counter()
    got = [j for j in await asyncio.gather(*[call() for _ in range(vote)]) if j is not None]
    LATENCIES.append(time.perf_counter() - t0)
    if not got:
        return None
    got.sort(key=lambda j: j["arg_score"])
    return got[len(got) // 2]


def _session_context(scenario_id: str, lang: str):
    sess = engine.create_session(scenario_id, lang)
    context, interests = views.judge_context(sess)
    return context, interests, views.judge_secondary(sess)


# --------------------------------------------------------------- режим turns

async def mode_turns(scenario_id: str, lang: str, k: int, n: int,
                     temperatures: list[float], vote: int = 1) -> dict:
    context, interests, secondary = _session_context(scenario_id, lang)
    lines = TURN_LINES[:n]
    out: dict = {"mode": "turns", "scenario": scenario_id, "lang": lang,
                 "k": k, "vote": vote, "model": orchat.model_for("judge"), "rows": []}

    for temp in temperatures:
        for source, text in lines:
            results = await asyncio.gather(*[
                _one_judgement(context, text, lang, interests, secondary, temp, vote)
                for _ in range(k)
            ])
            ok = [r for r in results if r is not None]
            scores = [float(r["arg_score"]) for r in ok]
            row = {
                "temperature": temp,
                "source": source,
                "text": text,
                "answered": len(ok),
                "score": _stats(scores),
                # Дискретные поля — вторая половина ответа. Балл сглажен весом
                # 14/100 на всю партию, а вето и индекс интереса действуют
                # ступенькой, поэтому их нестабильность стоит дороже.
                "interest_targeted": Counter(str(r["interest_targeted"]) for r in ok),
                "criteria_legitimate": Counter(str(r["criteria_legitimate"]) for r in ok),
                "tradeoff_real": Counter(str(r["tradeoff_real"]) for r in ok),
                "batna_real": Counter(str(r["batna_real"]) for r in ok),
                # Пороги движка: пересечение любого из них меняет не число, а
                # ЛОГИКУ хода (см. engine.apply_move).
                "crosses_35": bool(scores) and min(scores) < 35 <= max(scores),
                "crosses_55": bool(scores) and min(scores) <= 55 < max(scores),
            }
            out["rows"].append(row)
            _print_turn_row(row)
    return out


def _print_turn_row(row: dict) -> None:
    s = row["score"]
    if not s:
        print(f"  [t={row['temperature']}] {row['source']:<12} — судья не ответил ни разу")
        return
    flags = []
    if row["crosses_35"]:
        flags.append("ПЕРЕСЕКАЕТ 35 (критерий как событие)")
    if row["crosses_55"]:
        flags.append("ПЕРЕСЕКАЕТ 55 (BATNA подкреплена)")
    for key in ("interest_targeted", "criteria_legitimate", "tradeoff_real", "batna_real"):
        if len(row[key]) > 1:
            flags.append(f"{key}: {dict(row[key])}")
    print(f"  [t={row['temperature']}] {row['source']:<12} "
          f"med={s['median']:>5.1f}  min={s['min']:>5.1f}  max={s['max']:>5.1f}  "
          f"σ={s['stdev']:>5.2f}  разброс={s['spread']:>5.1f}  "
          f"ответов={row['answered']}")
    for f in flags:
        print(f"      · {f}")


# --------------------------------------------------------------- режим games

def _fixture_lines(game_id: str) -> tuple[str, str, list[str]]:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    ladder = data["ladder"]
    game = next(g for g in ladder["games"] if g["id"] == game_id)
    lines = game["lines"]
    if isinstance(lines, str) and lines.startswith("@principled."):
        key = lines.split(".", 1)[1]
        return key, ladder["lang"], data["principled"][key][ladder["lang"]]
    return ladder["scenario"], ladder["lang"], lines


async def _play_once(scenario_id: str, lang: str, lines: list[str],
                     temperature: float, vote: int = 1) -> dict:
    """Партия целиком: настоящий движок, живой судья на каждом ходу.

    Возвращает разбор плюс СЛЕД партии: баллы судьи по ходам и вскрытые
    интересы. Без следа отчёт говорит «грейд поплыл», но не говорит, от чего
    именно, — а разница между «поплыл балл» и «поплыло вскрытие интереса»
    ведёт к разным решениям."""
    sess = engine.create_session(scenario_id, lang)
    trace: list = []
    for text in lines:
        if sess.state.status != "active":
            break
        sess.turn += 1
        context, interests = views.judge_context(sess)
        secondary = views.judge_secondary(sess)
        judgement = await _one_judgement(context, text, lang, interests,
                                         secondary, temperature, vote)
        trace.append(None if judgement is None else judgement["arg_score"])
        engine.apply_move(sess, engine.analyze(text), text, judge=judgement)
        if sess.state.status == "active" and sess.turn >= sess.max_turns:
            sess.state.status = "breakdown"
    debrief = engine.score_session(sess)
    debrief["_trace"] = trace
    debrief["_interests_found"] = sorted(sess.state.interests_found)
    debrief["_avg_arg"] = (sess.metrics.arg_quality_sum / sess.metrics.arg_quality_n
                           if sess.metrics.arg_quality_n else 0)
    return debrief


async def mode_games(game_id: str, k: int, temperatures: list[float],
                     vote: int = 1) -> dict:
    scenario_id, lang, lines = _fixture_lines(game_id)
    out: dict = {"mode": "games", "game": game_id, "scenario": scenario_id,
                 "lang": lang, "k": k, "vote": vote, "turns": len(lines),
                 "model": orchat.model_for("judge"), "rows": []}
    for temp in temperatures:
        # Партии идут последовательно: внутри партии ход зависит от предыдущего,
        # а параллелить сами партии значит бить в одну модель K потоками и мерить
        # заодно её очередь.
        debriefs = [await _play_once(scenario_id, lang, lines, temp, vote)
                    for _ in range(k)]
        overall = [float(d["overall"]) for d in debriefs]
        grades = Counter(d["grade"] for d in debriefs)
        row = {
            "temperature": temp,
            "overall": _stats(overall),
            "economic": _stats([float(d["economic"]) for d in debriefs]),
            "relationship": _stats([float(d["relationship"]) for d in debriefs]),
            "technique": _stats([float(d["technique"]) for d in debriefs]),
            "grades": grades,
            "grade_unstable": len(grades) > 1,
            "runs": [{"grade": d["grade"], "overall": d["overall"],
                      "technique": d["technique"], "avg_arg": round(d["_avg_arg"], 2),
                      "scores": d["_trace"], "interests": d["_interests_found"]}
                     for d in debriefs],
        }
        out["rows"].append(row)
        print(f"  [t={temp}] «{game_id}» {len(lines)} ходов ×{k}:  "
              f"overall med={row['overall']['median']:.1f} "
              f"[{row['overall']['min']:.0f}..{row['overall']['max']:.0f}] "
              f"σ={row['overall']['stdev']:.2f}   грейды={dict(grades)}"
              + ("   ← ГРЕЙД ПЛЫВЁТ" if row["grade_unstable"] else ""))
        for dim in ("economic", "relationship", "technique"):
            st = row[dim]
            print(f"      · {dim:<13} med={st['median']:>5.1f} "
                  f"[{st['min']:.0f}..{st['max']:.0f}] разброс={st['spread']:.0f}")
        for run in row["runs"]:
            print(f"        {run['grade']} overall={run['overall']:>3} "
                  f"technique={run['technique']:>3} avg_arg={run['avg_arg']:>6.2f} "
                  f"баллы={run['scores']} интересы={run['interests']}")
    return out


def _encode(obj):
    if isinstance(obj, Counter):
        return dict(obj)
    raise TypeError(type(obj))


def main() -> int:
    _load_dotenv()
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mode", choices=("turns", "games"), default="turns")
    ap.add_argument("--k", type=int, default=5, help="повторов на реплику/партию")
    ap.add_argument("--n", type=int, default=len(TURN_LINES), help="сколько реплик (mode=turns)")
    ap.add_argument("--scenario", default="supplier")
    ap.add_argument("--lang", default="ru")
    ap.add_argument("--game", default="good", help="id партии из games.json (mode=games)")
    ap.add_argument("--temperature", default="0.2",
                    help="через запятую: 0.2,0 — сравнить настройки одним прогоном")
    ap.add_argument("--vote", type=int, default=1,
                    help="голосование: N параллельных вызовов, медиана по баллу")
    ap.add_argument("--json", action="store_true", help="машинный вывод в stdout")
    args = ap.parse_args()

    if not orchat.available():
        print("Судья недоступен: нет ключа или NEGO_AI=off. "
              "Запусти как `set -a && . ./.env && set +a && .venv/bin/python …`",
              file=sys.stderr)
        return 2

    temps = [float(t) for t in args.temperature.split(",") if t.strip() != ""]
    print(f"модель судьи: {orchat.model_for('judge')}   температуры: {temps}   "
          f"голосов: {args.vote}")

    async def run():
        try:
            if args.mode == "turns":
                return await mode_turns(args.scenario, args.lang, args.k, args.n,
                                        temps, args.vote)
            return await mode_games(args.game, args.k, temps, args.vote)
        finally:
            await orchat.aclose()

    result = asyncio.run(run())
    lat = _stats([round(v * 1000) for v in LATENCIES])
    if lat:
        result["latency_ms"] = lat
        print(f"цена суждения (голосов={args.vote}): медиана {lat['median']:.0f} мс "
              f"[{lat['min']:.0f}..{lat['max']:.0f}], вызовов {lat['n'] * args.vote}")
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2, default=_encode))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
