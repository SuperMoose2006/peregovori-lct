#!/usr/bin/env python3
"""grade_spread.py — какие оценки вообще достижимы?

Шкала из пяти букв обещает пять исходов. Шестнадцать эталонных партий дают
только два: F (14–29) или B/A (73–92). Между ними сорок четыре балла пустоты, и
отсюда родилась гипотеза «полосы C и D недостижимы».

ГИПОТЕЗА ОКАЗАЛАСЬ ЛОЖНОЙ, и способ, которым она была опровергнута, важнее её
самой.

Первый подход — случайные партии тысячами — «подтвердил» её: ноль C на трёх
тысячах игр. Подтверждал он при этом не движок, а генератор. Тот сначала не
умел закрывать сделку (ноль рукопожатий на двух тысячах партий), потом обрывал
игру на кончившемся списке реплик (87% исходов «никакой»), потом хамил с
вероятностью 0.15 независимо от уровня — так что «умелый» игрок срывал
переговоры не реже бестолкового. Каждая из трёх ошибок давала красивую
гистограмму, и каждая «доказывала» ровно то, что и хотелось увидеть.

Ответил другой опыт, и он на два порядка дешевле. Берём партию с ИЗВЕСТНЫМ
грейдом и играем все подмножества её реплик. Это интерполяция между хорошей
игрой и молчанием, и никакого генератора в ней нет — только настоящие реплики
в настоящем движке. Тридцать одно подмножество хорошей партии (B, 77) дают
девять C и четыре D; шестьдесят три подмножества образцовой (A, 92) — шесть C
и семнадцать D.

Значит полосы населены, а пуст НАБОР ЭТАЛОНОВ: фикстуры писались нарочными
крайностями — «отвратительно» и «хорошо», — и середины в них нет. Это не
дефект движка, а дыра в покрытии, и она задевает инвариант 8: офлайн-ядро и
сервер сверяются друг с другом только на краях шкалы.

    .venv/bin/python tools/grade_spread.py             # интерполяция, главный ответ
    .venv/bin/python tools/grade_spread.py --random    # случайные партии, со всеми оговорками
    .venv/bin/python tools/grade_spread.py --json
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
from collections import Counter

os.environ.setdefault("NEGO_AI", "off")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import itertools  # noqa: E402

from app.engine import engine  # noqa: E402
from app.engine.scenarios import SCENARIOS  # noqa: E402
from app.engine.techniques import analyze  # noqa: E402

#: Реплики по приёмам. Не выдуманные на ходу: взяты из тех формулировок,
#: которые продукт сам преподаёт в курсе и признаёт в эталонных партиях.
MOVES = {
    "rapport": ["Здравствуйте! Рад, что нашли время.",
                "Спасибо, что встретились — давайте разберёмся вместе."],
    "spin": ["А что для вас сейчас самое неудобное в этой ситуации?",
             "Чем это оборачивается, если так и останется?",
             "Как это сказывается на ваших сроках?"],
    "interests": ["Что для вас важнее всего в этой сделке?",
                  "Почему для вас важен именно этот срок?",
                  "Что вы хотите получить в итоге?"],
    "criteria": ["По рынку такие условия идут заметно дешевле.",
                 "Давайте опираться на рыночные данные, а не на ощущения."],
    "tradeoff": ["Если я возьму на себя доставку, вы сдвинетесь по цене?",
                 "Готов пойти навстречу по срокам в обмен на цену."],
    "batna": ["У меня есть другой вариант, но ваш мне интереснее.",
              "Есть запасной вариант — хотелось бы договориться с вами."],
    "filler": ["Ага.", "Понятно.", "Ну да.", "Хорошо."],
    "rude": ["Это просто грабёж.", "Вы вообще несерьёзны."],
}


def _price(sc, closeness: float):
    lo, hi = sc.opponent_open, sc.player_target
    price = lo + (hi - lo) * closeness
    return round(price, 2) if abs(hi - lo) < 20 else round(price)


def offer_line(sc, closeness: float, lang: str) -> str:
    """Оффер на заданной доле пути от «как просит оппонент» к своей цели.

    `closeness` = 0 — соглашаюсь на его открытие, 1 — требую свою цель.
    Дробное значение и есть та середина, которой в эталонных партиях нет.
    """
    p = _price(sc, closeness)
    return f"Предлагаю {p}." if lang == "ru" else f"I propose {p}."


def close_line(sc, closeness: float, lang: str) -> str:
    """Закрытие сделки.

    Первая редакция прибора этой реплики не имела — и получила НОЛЬ сделок на
    двух тысячах партий. Гистограмма при этом выглядела осмысленно и «доказывала»
    пустоту полос C и D. Она доказывала только то, что генератор не умеет
    закрывать: сделку в движке открывает приём «согласие», а не хорошая цена.
    Прибор, у которого не проверен главный исход, измеряет себя.
    """
    p = _price(sc, closeness)
    return (f"Фиксируем: цена {p}. Договорились?" if lang == "ru"
            else f"Let's lock it in at {p}. Deal?")


def play_one(sc_id: str, lang: str, rng: random.Random) -> dict:
    sc = engine.by_id(sc_id)
    #: Уровень игрока одним числом. Он управляет И долей приёмов, И тем,
    #: насколько упорно игрок торгуется, — потому что в жизни это связано.
    skill = rng.random()
    closeness = max(0.0, min(1.0, rng.gauss(skill, 0.18)))
    #: Грубость обратна уровню. В первой редакции она стояла фиксированной
    #: (0.15 при любом skill), и «умелый» игрок хамил ровно столько же, сколько
    #: бестолковый: 97.6% партий кончались срывом, и гистограмма опять
    #: «доказывала» пустоту верхних полос.
    rude_p = 0.30 * (1 - skill)
    #: Умеет ли игрок закрывать. Связано с уровнем, но не тождественно ему:
    #: «поговорил хорошо и ушёл без сделки» — очень частая живая партия.
    closes = rng.random() < 0.35 + 0.5 * skill
    close_at = rng.randint(3, 9)
    #: Сколько раз он попробует закрыть, прежде чем сдастся. Без этого предела
    #: генератор повторял одну реплику до конца партии, а движок штрафует
    #: повторы — то есть прибор наказывал сам себя.
    tries_left = rng.randint(1, 3)
    give = closeness

    sess = engine.create_session(sc_id, lang)
    #: Играем до НАСТОЯЩЕГО конца — рукопожатия, срыва или лимита ходов.
    #: Первая редакция обрывала партию, когда кончался заготовленный список
    #: реплик, и 87% партий получали исход «active», то есть никакой.
    while sess.state.status == "active" and sess.turn < sess.max_turns:
        i, r = sess.turn, rng.random()
        if closes and i >= close_at and tries_left > 0:
            text = close_line(sc, give, lang)
            tries_left -= 1
            give = max(0.0, give - 0.2)   # не взяли — уступаю и пробую снова
        elif i > 2 and r < 0.25:
            text = offer_line(sc, give, lang)
        elif r < rude_p:
            text = rng.choice(MOVES["rude"])
        elif r < rude_p + skill:
            key = rng.choice(["rapport", "spin", "interests", "criteria", "tradeoff", "batna"])
            text = rng.choice(MOVES[key])
        else:
            text = rng.choice(MOVES["filler"])
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text)
    if sess.state.status == "active":
        sess.state.status = "breakdown"   # вышли ходы — это тоже исход
    d = engine.score_session(sess)
    return {"grade": d["grade"], "overall": d["overall"], "economic": d["economic"],
            "relationship": d["relationship"], "technique": d["technique"],
            "status": sess.state.status, "skill": skill}


def _fixture_games():
    """Эталонные партии с их разрешёнными ссылками.

    `lines` бывает строкой `@principled.<id>` — ссылкой на партию из соседнего
    раздела. Первая редакция прибора этого не знала и перебрала ссылку ПО
    БУКВАМ: партия «@principled.supplier» стала двадцатью ходами «@», «p», «r»…
    и получила 12 F вместо 92 A. Полчаса ушло на объяснение расхождения,
    которого не было.
    """
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))))), "frontend", "test", "fixtures", "games.json")
    with open(path, encoding="utf-8") as fh:
        g = json.load(fh)
    principled = {k: v for k, v in g["principled"].items() if k != "note"}
    lad = g["ladder"]
    # У двуязычного раздела ведущая половина названа полем `mirror`; шкала
    # грейдов меряется на одной, иначе каждая точка удвоилась бы.
    lang = lad.get("mirror") or lad["lang"]
    out = []
    for rec in lad["games"]:
        lines = rec["lines"]
        if isinstance(lines, str) and lines.startswith("@principled."):
            lines = principled[lines.split(".", 1)[1]][lang]
        elif isinstance(lines, dict):
            lines = lines[lang]
        out.append((rec["id"], lad["scenario"], lang, lines))
    return out


def _play(sc_id: str, lang: str, lines) -> dict:
    sess = engine.create_session(sc_id, lang)
    for text in lines:
        if sess.state.status != "active":
            break
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text)
        if sess.state.status == "active" and sess.turn >= sess.max_turns:
            sess.state.status = "breakdown"
    d = engine.score_session(sess)
    return {"grade": d["grade"], "overall": d["overall"], "economic": d["economic"],
            "relationship": d["relationship"], "technique": d["technique"],
            "status": sess.state.status}


def interpolate(limit: int = 12) -> tuple[list[dict], list[str]]:
    """Все подмножества реплик каждой эталонной партии.

    `limit` бережёт от взрыва: партия из двадцати реплик дала бы миллион
    подмножеств. Что отброшено — печатается, а не умалчивается.
    """
    rows, notes = [], []
    for gid, sc_id, lang, lines in _fixture_games():
        base = _play(sc_id, lang, lines)
        notes.append(f"  {gid:12} целиком → {base['overall']:3} {base['grade']}  ({len(lines)} реплик)")
        if len(lines) > limit:
            notes.append(f"  {'':12} подмножества НЕ считались: {len(lines)} реплик — это 2^{len(lines)} игр")
            continue
        for n in range(1, len(lines) + 1):
            for combo in itertools.combinations(range(len(lines)), n):
                rows.append(_play(sc_id, lang, [lines[i] for i in combo]))
    return rows, notes


def _histogram(rows: list[dict], title: str) -> None:
    grades = Counter(r["grade"] for r in rows)
    print(f"\n─── {title}: {len(rows)} партий ───")
    for g in "ABCDF":
        n = grades.get(g, 0)
        bar = "█" * round(50 * n / max(1, len(rows)))
        print(f"  {g}  {n:6}  {100*n/max(1,len(rows)):5.1f}%  {bar}")
    print("\n  ─ куда попадает overall ─")
    buckets = Counter(min(9, r["overall"] // 10) for r in rows)
    for b in range(10):
        n = buckets.get(b, 0)
        bar = "█" * round(50 * n / max(1, len(rows)))
        print(f"    {b*10:3}–{b*10+9:3}  {n:6}  {bar}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--random", action="store_true",
                    help="случайные партии вместо интерполяции (см. шапку: метод слабый)")
    ap.add_argument("--games", type=int, default=3000)
    ap.add_argument("--seed", type=int, default=20260829)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.random:
        rng = random.Random(args.seed)
        ids = [s.id for s in SCENARIOS]
        rows = [play_one(rng.choice(ids), rng.choice(["ru", "en"]), rng) for _ in range(args.games)]
        notes = ["  метод слабый: см. шапку файла — три редакции генератора подряд",
                 "  «доказывали» пустоту полос, и каждый раз доказывали себя"]
    else:
        rows, notes = interpolate()

    if args.json:
        print(json.dumps({"grades": dict(Counter(r["grade"] for r in rows)),
                          "games": len(rows),
                          "method": "random" if args.random else "interpolation"},
                         ensure_ascii=False))
        return 0

    print()
    for n in notes:
        print(n)
    _histogram(rows, "случайные партии" if args.random else "подмножества эталонных партий")

    print("\n─── исходы (без этой строки прибор мерит себя) ───")
    for st, n in Counter(r["status"] for r in rows).most_common():
        print(f"  {st:12} {n:6}  {100*n/max(1,len(rows)):5.1f}%")

    # Средняя треть считается ТОЛЬКО по состоявшимся сделкам, и это не
    # придирка: у сорвавшейся партии `economic` равен нулю по определению, а
    # таких большинство. Считая их, прибор получал «economic в середине: 0.0%»
    # и объявлял измерение бимодальным. На настоящих сделках оно непрерывно.
    deals = [r for r in rows if r["status"] == "agreement"]
    print(f"\n─── средняя треть (34–66), только состоявшиеся сделки: {len(deals)} ───")
    for dim in ("economic", "relationship", "technique", "overall"):
        mid = sum(1 for r in deals if 34 <= r[dim] <= 66)
        print(f"  {dim:13} {100*mid/max(1,len(deals)):5.1f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
