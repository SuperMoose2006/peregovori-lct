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

  --mode games  Эталонные партии из frontend/test/fixtures/games.json, целиком,
                K раз через НАСТОЯЩИЕ engine.apply_move + живого судью. Печатает
                разброс overall и — то самое, ради чего всё, — набор грейдов.
                Разные грейды на одной и той же партии обесценивают сертификат.

                `--game all` играет всю лестницу качества и печатает ДВА
                вердикта: ПОРЯДОК — обещание «торг ≤ пассив ≤ спам ≤
                чередование ≤ базовая ≤ хорошая ≤ образцовая», — и ЗАПАС между
                ступенями качества (`ladder.tiers`), потому что знака
                неравенства мало. Именно этот прибор и показал, что мало:
                соседние ступени стояли в одном балле друг от друга, и живой
                судья менял их местами на обоих языках и на обеих моделях
                судьи. Порог запаса берётся из фикстуры (`ladder.tier_margin`),
                чтобы прибор и офлайновый tests/test_reference_games.py спорили
                с одним и тем же числом.
                `--game principled.all` — девять принципиальных партий, по
                одной на стол (инвариант 2: принципиальная игра → A/B).

                Отдельным блоком печатается СПОР С РАЗБОРОМ: сколько ходов
                получили от судьи балл, противоречащий детерминированному
                разбору той же реплики. Это не эстетика: балл ниже
                `CRITERIA_EVENT_MIN` отменяет засчитанный движком объективный
                критерий, и цена не двигается.

ЗАПУСК. Ключ живёт в services/gateway/.env и в командную строку не попадает:

    cd services/gateway && set -a && . ./.env && set +a && \
        .venv/bin/python tools/judge_spread.py --mode turns --k 5

    .venv/bin/python tools/judge_spread.py --mode games --k 5 --game good
    .venv/bin/python tools/judge_spread.py --mode games --k 3 --game all --json
    NEGO_MODEL_JUDGE=google/gemini-2.5-flash-lite \
        .venv/bin/python tools/judge_spread.py --mode games --game all

Модель берётся из `NEGO_MODEL_JUDGE` (`app/providers/routing.py`) — сравнение
двух судей это два прогона с разным значением переменной, а не два прибора.

`--temperature` принимает СПИСОК, чтобы сравнить настройки на одних и тех же
репликах одним прогоном: `--temperature 0.2,0`.

`--lang` в режиме `games` РАБОТАЕТ. Раньше он молча игнорировался: язык брался
из поля `mirror` фикстуры всегда, и `--lang en` возвращал русские числа. Это
самый дешёвый способ соврать в пользу вывода — половина замера, которой не
было, выглядела сделанной.

Стоимость: turns → K·N вызовов, games → K·(длина партии). Вся лестница на одном
языке — 55 ходов, то есть 55·K вызовов; девять принципиальных партий — 54·K.
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
# Порог, за которым движок засчитывает объективный критерий СОБЫТИЕМ и
# двигает цену (engine.py:751). Импортируется, а не переписывается числом:
# замер обязан спорить с тем порогом, что стоит в бою.
from app.engine.engine import CRITERIA_EVENT_MIN  # noqa: E402
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

#: Приёмы, которые детерминированный разборщик (`engine.analyze`) считает
#: СОДЕРЖАТЕЛЬНЫМИ. Реплика без единого такого приёма — пустая: междометие,
#: голая позиция, «ага». Этот список нужен, чтобы спросить у замера третий
#: вопрос: не ставит ли судья пустышке БОЛЬШЕ, чем реплике с приёмом.
SUBSTANTIVE_MOVES = frozenset({
    "spin_situation", "spin_problem", "spin_implication", "spin_needpayoff",
    "interests_probe", "objective_criteria", "batna", "tradeoff",
})

#: Поле вето судьи → приём, который оно отменяет. Пара, а не два списка:
#: `engine.judged()` смотрит именно на эту связку.
VETO_FIELDS = {
    "criteria_legitimate": "objective_criteria",
    "tradeoff_real": "tradeoff",
    "batna_real": "batna",
}


def _game_spec(game_id: str) -> tuple[str, str | None]:
    """`good` → ('ladder', 'good'); `principled.salary` → ('principled', 'salary').

    Разбор ИМЕННО через `split(".", 1)`, а не срезом по длине префикса: срез
    молча съедает лишнюю букву при опечатке в префиксе и подсовывает ключ,
    которого в фикстуре нет, — а `data["principled"][key]` на таком ключе даст
    KeyError только если повезёт с буквами.
    """
    head, _, tail = game_id.partition(".")
    if head == "principled":
        return "principled", (tail or None)
    return "ladder", game_id


def expand_games(spec: str) -> list[str]:
    """`all` → вся лестница в порядке `order`; `principled.all` → все столы."""
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    if spec == "all":
        return list(data["ladder"]["order"])
    if spec == "principled.all":
        return [f"principled.{k}" for k in data["principled"] if k != "note"]
    return [spec]


def _fixture_lines(game_id: str, lang: str | None = None) -> tuple[str, str, list[str]]:
    """Реплики эталонной партии: (сценарий, язык, строки).

    `lang=None` — половина, по которой посчитаны эталонные числа (`mirror`).
    Указанный язык ОБЯЗАН существовать: молча отдать русские реплики в ответ на
    `--lang en` — ровно та форма лжи прибора, ради которой этот аргумент и
    заведён (раньше режим `games` игнорировал `--lang` целиком).
    """
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    ladder = data["ladder"]
    default_lang = ladder.get("mirror") or ladder["lang"]
    want = lang or default_lang
    kind, key = _game_spec(game_id)

    if kind == "principled":
        block = data["principled"][key]
        if want not in block:
            raise SystemExit(f"у партии principled.{key} нет языка {want!r}")
        return key, want, block[want]

    game = next(g for g in ladder["games"] if g["id"] == game_id)
    lines = game["lines"]
    if isinstance(lines, str) and lines.startswith("@principled."):
        ref = lines.split(".", 1)[1]
        block = data["principled"][ref]
        if want not in block:
            raise SystemExit(f"у партии {game_id} нет языка {want!r}")
        return ref, want, block[want]
    if isinstance(lines, dict):
        if want not in lines:
            raise SystemExit(f"у партии {game_id} нет языка {want!r}")
        lines = lines[want]
    return ladder["scenario"], want, lines


async def _play_once(scenario_id: str, lang: str, lines: list[str],
                     temperature: float, vote: int = 1) -> dict:
    """Партия целиком: настоящий движок, живой судья на каждом ходу.

    Возвращает разбор плюс СЛЕД партии: баллы судьи по ходам и вскрытые
    интересы. Без следа отчёт говорит «грейд поплыл», но не говорит, от чего
    именно, — а разница между «поплыл балл» и «поплыло вскрытие интереса»
    ведёт к разным решениям.

    Рядом с баллом судьи в след кладётся ДЕТЕРМИНИРОВАННЫЙ разбор того же
    хода — приёмы и keyword-балл. Это единственная опора, по которой видно, что
    судья спорит не с другим прогоном, а с самим движком.
    """
    sess = engine.create_session(scenario_id, lang)
    trace: list = []
    turns: list = []
    for text in lines:
        if sess.state.status != "active":
            break
        sess.turn += 1
        context, interests = views.judge_context(sess)
        secondary = views.judge_secondary(sess)
        judgement = await _one_judgement(context, text, lang, interests,
                                         secondary, temperature, vote)
        trace.append(None if judgement is None else judgement["arg_score"])
        analysis = engine.analyze(text)
        # Снимок ДО `apply_move`: он перезаписывает `analysis.arg_quality`
        # баллом судьи (engine.py:599), и снятый после keyword-балл был бы
        # копией судейского — измерение согласия с самим собой.
        # Вето — вторая половина ответа судьи, и она дороже балла: балл входит в
        # технику сглаженно, а `criteria_legitimate: false` ОТМЕНЯЕТ приём,
        # который разборщик уже увидел (engine.py::judged).
        #
        # Считается только СРАБОТАВШЕЕ вето. `judged(k, field)` — это
        # `has(k) and not veto`, поэтому `batna_real: false` на реплике без
        # BATNA не отменяет ничего. Считать такие «вето» значило бы получить по
        # дюжине на партию из шести ходов и объявить моделью-цензором ту, что
        # просто аккуратно заполняет все поля JSON.
        vetoes = [] if judgement is None else sorted(
            field for field, move in VETO_FIELDS.items()
            if judgement.get(field) is False and move in analysis.moves
        )
        turns.append({
            "text": text,
            "judge": None if judgement is None else judgement["arg_score"],
            "keyword": analysis.arg_quality,
            "moves": list(analysis.moves),
            "substantive": sorted(SUBSTANTIVE_MOVES.intersection(analysis.moves)),
            "vetoed": vetoes,
            "interest_targeted": None if judgement is None else judgement.get("interest_targeted"),
        })
        engine.apply_move(sess, analysis, text, judge=judgement)
        if sess.state.status == "active" and sess.turn >= sess.max_turns:
            sess.state.status = "breakdown"
    debrief = engine.score_session(sess)
    debrief["_trace"] = trace
    debrief["_turns"] = turns
    debrief["_interests_found"] = sorted(sess.state.interests_found)
    debrief["_avg_arg"] = (sess.metrics.arg_quality_sum / sess.metrics.arg_quality_n
                           if sess.metrics.arg_quality_n else 0)
    return debrief


def _disagreements(rows: list[dict]) -> dict:
    """Где балл судьи спорит с детерминированным разбором ТОГО ЖЕ хода.

    Два счёта, и оба про пороги движка, а не про красоту числа:

    · `criteria_killed` — разборщик увидел объективный критерий, а судья дал
      меньше `CRITERIA_EVENT_MIN` (35). Движок тогда НЕ засчитывает критерий
      событием (engine.py:751) и цена не двигается: судья отменяет приём,
      который игрок действительно применил.
    · `empty_above_substantive` — пар «содержательная реплика / пустая», где
      пустой достался балл ВЫШЕ. Это тот самый вопрос, с которого начался
      спор о моделях.
    """
    turns = [t for row in rows for run in row["runs"] for t in run["turns"]
             if t["judge"] is not None]
    subst = [t for t in turns if t["substantive"]]
    empty = [t for t in turns if not t["substantive"]]
    killed = [t for t in subst
              if "objective_criteria" in t["substantive"]
              and t["judge"] < CRITERIA_EVENT_MIN]
    vetoed = [t for t in subst if t.get("vetoed")]
    pairs = [(s, e) for s in subst for e in empty]
    inverted = [(s, e) for s, e in pairs if s["judge"] < e["judge"]]
    return {
        "turns": len(turns),
        "substantive": len(subst),
        "empty": len(empty),
        "median_substantive": statistics.median([t["judge"] for t in subst]) if subst else None,
        "median_empty": statistics.median([t["judge"] for t in empty]) if empty else None,
        "criteria_turns": sum(1 for t in subst if "objective_criteria" in t["substantive"]),
        "criteria_killed": len(killed),
        "vetoed_turns": len(vetoed),
        "vetoes": dict(Counter(v for t in vetoed for v in t["vetoed"])),
        "pairs": len(pairs),
        "empty_above_substantive": len(inverted),
    }


def _print_disagreements(d: dict) -> None:
    print(f"\nСПОР С РАЗБОРОМ ({d['turns']} оценённых ходов: "
          f"{d['substantive']} с приёмом, {d['empty']} пустых)")
    print(f"  медиана балла: с приёмом {d['median_substantive']}, "
          f"пустая {d['median_empty']}")
    print(f"  критерий отменён судьёй (балл < {CRITERIA_EVENT_MIN}, "
          f"цена не двигается): {d['criteria_killed']} из {d['criteria_turns']}")
    print(f"  приём снят ВЕТО: {d['vetoed_turns']} ходов {d['vetoes'] or ''}")
    share = 100.0 * d["empty_above_substantive"] / d["pairs"] if d["pairs"] else 0.0
    print(f"  пустышка выше реплики с приёмом: "
          f"{d['empty_above_substantive']} пар из {d['pairs']} ({share:.1f}%)")


def _print_order(rows: list[dict]) -> None:
    """Порядок лестницы — главный вопрос замера, и он либо цел, либо нет."""
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    order = [g for g in data["ladder"]["order"] if g in {r["game"] for r in rows}]
    if len(order) < 2:
        return
    med = {r["game"]: r["overall"]["median"] for r in rows}
    print("\nПОРЯДОК ЛЕСТНИЦЫ (медиана overall)")
    print("  " + "  ≤  ".join(f"{g}={med[g]:.0f}" for g in order))
    broken = [(lo, hi) for lo, hi in zip(order, order[1:]) if med[lo] > med[hi]]
    # Те же три строгих неравенства, что держит tests/test_reference_games.py:
    # анти-гейминг обещает не «не выше базовой», а СТРОГО ниже.
    strict = [(g, "basic") for g in ("spam", "alternating", "passive")
              if g in med and "basic" in med and med[g] >= med["basic"]]
    if broken or strict:
        for lo, hi in broken:
            print(f"  ✗ «{lo}» ({med[lo]:.0f}) выше «{hi}» ({med[hi]:.0f})")
        for lo, hi in strict:
            print(f"  ✗ «{lo}» ({med[lo]:.0f}) не ниже «{hi}» ({med[hi]:.0f})")
    else:
        print("  ✓ порядок цел, и спам/чередование/пассив строго ниже базовой")

    # ЗНАКА НЕРАВЕНСТВА МАЛО, и этот прибор ровно это и показал: между спамом
    # (27), чередованием (28) и базовой игрой (29) стояло по одному очку, и
    # живой судья их переставлял. Порядок, который держится на одном балле, —
    # не порядок, поэтому вторым блоком печатается ЗАПАС между ступенями
    # качества. Порог и его обоснование живут в фикстуре, а не здесь: прибор и
    # тест обязаны спорить с одним и тем же числом.
    tiers = data["ladder"].get("tiers")
    margin = data["ladder"].get("tier_margin")
    if not tiers or margin is None:
        return
    played = {r["game"] for r in rows}
    tiers = [t for t in tiers if played.issuperset(t["games"])]
    if len(tiers) < 2:
        print(f"\nЗАПАС МЕЖДУ СТУПЕНЯМИ: сыграно меньше двух целых ступеней "
              f"(нужен --game all)")
        return
    print(f"\nЗАПАС МЕЖДУ СТУПЕНЯМИ (требуется ≥ {margin} очков overall)")
    for lo, hi in zip(tiers, tiers[1:]):
        top = max(med[g] for g in lo["games"])
        bottom = min(med[g] for g in hi["games"])
        gap = bottom - top
        mark = "✓" if gap >= margin else "✗"
        print(f"  {mark} «{lo['id']}» (потолок {top:.0f}) → «{hi['id']}» "
              f"(пол {bottom:.0f}): {gap:.0f}")


async def mode_games(game_ids: list[str], k: int, temperatures: list[float],
                     vote: int = 1, lang: str | None = None) -> dict:
    out: dict = {"mode": "games", "k": k, "vote": vote,
                 "model": orchat.model_for("judge"), "rows": []}
    for game_id in game_ids:
        out["rows"].extend(
            (await _mode_one_game(game_id, k, temperatures, vote, lang))["rows"])
    _print_order([r for r in out["rows"] if r["temperature"] == temperatures[0]])
    out["disagreement"] = _disagreements(out["rows"])
    _print_disagreements(out["disagreement"])
    return out


async def _mode_one_game(game_id: str, k: int, temperatures: list[float],
                         vote: int, lang: str | None) -> dict:
    scenario_id, lang, lines = _fixture_lines(game_id, lang)
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
            "game": game_id,
            "lang": lang,
            "overall": _stats(overall),
            "economic": _stats([float(d["economic"]) for d in debriefs]),
            "relationship": _stats([float(d["relationship"]) for d in debriefs]),
            "technique": _stats([float(d["technique"]) for d in debriefs]),
            "grades": grades,
            "grade_unstable": len(grades) > 1,
            "runs": [{"grade": d["grade"], "overall": d["overall"],
                      "technique": d["technique"], "avg_arg": round(d["_avg_arg"], 2),
                      "scores": d["_trace"], "interests": d["_interests_found"],
                      "turns": d["_turns"]}
                     for d in debriefs],
        }
        out["rows"].append(row)
        print(f"  [t={temp}] «{game_id}» ({lang}) {len(lines)} ходов ×{k}:  "
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
    ap.add_argument("--lang", default=None,
                    help="ru|en. mode=games: по умолчанию половина `mirror`, "
                         "по которой посчитаны эталонные числа")
    ap.add_argument("--game", default="good",
                    help="id партии из games.json (mode=games): `good`, "
                         "`principled.salary`, `all` — вся лестница, "
                         "`principled.all` — все столы")
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
                return await mode_turns(args.scenario, args.lang or "ru", args.k,
                                        args.n, temps, args.vote)
            return await mode_games(expand_games(args.game), args.k, temps,
                                    args.vote, args.lang)
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
