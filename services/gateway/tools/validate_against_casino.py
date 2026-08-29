#!/usr/bin/env python
"""validate_against_casino.py — внешняя проверка классификатора на ЧЕЛОВЕЧЕСКОЙ разметке.

ЗАЧЕМ. `app/engine/techniques.py::analyze` проверялся только собой: нашими
тестами на репликах, которые мы же придумали. Второй внешний корпус нужен
потому, что у первого (CraigslistBargain, см. `validate_against_cocoa.py`)
ярлыки МАШИННЫЕ — это согласие двух правил, а не сверка с человеком.

CaSiNo (Chawla et al., NAACL 2021) закрывает ровно эту дыру:
  · 1030 диалогов человек-человек (Amazon MTurk, дележ припасов в кемпинге);
  · 396 из них размечены ТРЕМЯ ЭКСПЕРТАМИ поутвердительно: 4615 реплик,
    девять стратегий, разметка мульти-ярлычная;
  · лицензия CC-BY-4.0 (файл LICENSE в репозитории — проверяется скриптом);
  · к каждому участнику приложен ИСХОД: points_scored, satisfaction,
    opponent_likeness. Значит проверяется не только совпадение ярлыков, но и
    предсказательная сила: предсказывают ли НАШИ распознанные приёмы те же
    исходы, что и экспертные.

ЧЕСТНЫЕ ОГОВОРКИ, которые нельзя убирать из вывода:
  1. Предметная область другая: дележ припасов, БЕЗ цен и БЕЗ BATNA. Наш
     словарь заточен под разговор о цене, поэтому низкая полнота вне домена
     ожидаема — число публикуется вместе с оговоркой, а не вместо неё.
  2. Корпус английский. Проверяется английская половина словаря; русская
     внешне не проверена ничем.
  3. У самих разметчиков согласие по `showing-empathy` и `promote-coordination`
     — 0.42 по Криппендорфу (таблица 2 статьи). Авторы исключили эти два
     ярлыка из своей же таблицы результатов (там семь стратегий, не девять).
     Наше расхождение именно там — скорее свойство конструкта, чем наша
     ошибка, и в отчёте разбирается отдельно.

    python tools/validate_against_casino.py --fetch
    python tools/validate_against_casino.py
    python tools/validate_against_casino.py --limit 100 --examples 10

Корпус НЕ кладётся в репозиторий. Путь — `--corpus` или `NEGO_CASINO_DIR`.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Callable, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.engine.techniques import LEX, Analysis, analyze, norm  # noqa: E402

RAW = "https://raw.githubusercontent.com/kushalchawla/CaSiNo/main/"
FILES = {"casino.json": RAW + "data/casino.json", "LICENSE": RAW + "LICENSE"}

HOWTO = """\
Корпуса нет на диске: {path}

Достать (≈4.3 МБ, лицензия CC-BY-4.0):

    python tools/validate_against_casino.py --fetch --corpus {path}

Вручную, если у машины нет сети:
    {url}
положить как {path}/casino.json (и LICENSE рядом).
"""

#: Числа из самой статьи (aclanthology.org/2021.naacl-main.254), таблицы 2 и 3.
#: Нужны как масштаб: «68% F1 у BERT» — это не «плохо», это потолок задачи.
PAPER = {
    #                α разметчиков, F1 их лучшей модели (позитивный класс), счёт
    "small-talk":           (0.81, 82.7, 1054),
    "elicit-pref":          (0.77, 83.2, 377),
    "vouch-fair":           (0.62, 67.9, 439),
    "showing-empathy":      (0.42, None, 254),   # исключена авторами из таблицы 3
    "promote-coordination": (0.42, None, 579),   # исключена авторами из таблицы 3
    "no-need":              (0.77, 36.4, 196),
    "other-need":           (0.89, 77.9, 409),
    "self-need":            (0.75, 74.4, 964),
    "uv-part":              (0.72, 44.5, 131),
}

# ---------------------------------------------------------------------------
# Отображение стратегий CaSiNo на наши приёмы
# ---------------------------------------------------------------------------
#
# Построено по определениям из раздела 3 статьи, а не по созвучию названий.
# Там, где определение шире или уже нашего приёма, это записано в поле `caveat`
# и попадает в вывод — натянутое отображение хуже отсутствующего.

MAPPED: dict[str, dict] = {
    "elicit-pref": {
        "ours": "interests_probe",
        "pred": lambda a: "interests_probe" in a.moves,
        "wide": lambda a: "interests_probe" in a.moves or a.spin is not None,
        "caveat": "их определение — «спросить о предпочтениях партнёра». Ровно "
                  "наш interests_probe. Самое честное соответствие из всех.",
    },
    "small-talk": {
        "ours": "rapport",
        "pred": lambda a: "rapport" in a.moves,
        "wide": lambda a: "rapport" in a.moves,
        "caveat": "у них small-talk включает разговор о походе, погоде, семье — "
                  "всё вне задачи. У нас rapport — только формулы контакта.",
    },
    "showing-empathy": {
        "ours": "acknowledge",
        "pred": lambda a: "acknowledge" in a.moves,
        "wide": lambda a: "acknowledge" in a.moves,
        "caveat": "α разметчиков 0.42, ярлык исключён авторами из их же "
                  "таблицы результатов. Плюс их эмпатия — сочувствие "
                  "(«не хотел бы, чтобы вы мёрзли»), наше acknowledge — "
                  "активное слушание («если я верно понял»). Пересечение "
                  "частичное по определению.",
    },
    "promote-coordination": {
        "ours": "tradeoff",
        "pred": lambda a: "tradeoff" in a.moves,
        "wide": lambda a: "tradeoff" in a.moves,
        "caveat": "α разметчиков 0.42, ярлык тоже исключён авторами. Их "
                  "координация — любой призыв к взаимной выгоде, наш tradeoff "
                  "— НАЗВАННЫЙ размен «это за то». Их класс заведомо шире.",
    },
    "vouch-fair": {
        "ours": "objective_criteria",
        "pred": lambda a: "objective_criteria" in a.moves,
        "wide": lambda a: "objective_criteria" in a.moves,
        "caveat": "их vouch-fair — апелляция к справедливости В СВОЮ ПОЛЬЗУ "
                  "(«так я останусь без воды»). Наш objective_criteria требует "
                  "ВНЕШНЕГО мерила (рынок, бенчмарк, прецедент). Совпадение "
                  "ожидается частичным, и низкая полнота здесь — не дефект.",
    },
}

NO_MAPPING_THEIRS = {
    "self-need": "«мне это нужно, потому что…» — личный аргумент в свою пользу. "
                 "У нас это не приём: движок судит обоснование (arg_quality), а "
                 "не факт заявления о своей нужде",
    "other-need": "нужда третьих лиц («с нами дети»). Приёма нет — и добавлять "
                  "не надо: у нас за столом двое",
    "no-need": "«нам вода не нужна» — сигнал о низкой ценности предмета. "
               "Ближайшее у нас — вскрытие интересов, но с обратной стороны "
               "стола; отображать было бы натяжкой",
    "uv-part": "обесценивание партнёра («сам-то дотащишь столько дров?»). "
               "Между нашими hostile и tradeoff, но не равно ни одному",
    "non-strategic": "отсутствие стратегии. У нас `statement` — мусорная "
                     "корзина, а не приём; сравнивать нечего",
}

NO_MAPPING_OURS = [
    ("batna", "у CaSiNo нет альтернативной сделки: уйти можно, но идти некуда"),
    ("objective_criteria (внешнее мерило)", "в кемпинге нет рынка и прайса"),
    ("offer / anchor / concession", "нет цен — нечего якорить и уступать"),
    ("accept", "сделка оформляется КНОПКОЙ Submit-Deal, а не репликой"),
    ("threat / hostile", "участников фильтровали за грубость на постобработке"),
    ("spin_implication / spin_needpayoff", "продающие стадии SPIN тут неуместны"),
]


# ---------------------------------------------------------------------------

def fetch(corpus: Path) -> None:
    import urllib.request

    corpus.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        dst = corpus / name
        if dst.exists():
            print(f"  есть  {name}")
            continue
        print(f"  качаю {name} …", flush=True)
        urllib.request.urlretrieve(url, dst)
    print(f"  готово: {corpus}")


def check_license(corpus: Path) -> str:
    """Лицензию читаем ФАЙЛОМ. Своими глазами, а не по чужому слову."""
    path = corpus / "LICENSE"
    if not path.exists():
        return "LICENSE не скачан — проверить нечем"
    head = path.read_text(encoding="utf-8", errors="replace")[:400]
    first = next((ln.strip() for ln in head.splitlines() if ln.strip()), "")
    ok = "Attribution 4.0 International" in head
    return f"{first!r} → {'CC-BY-4.0, использование допустимо' if ok else 'НЕ CC-BY — разобраться руками'}"


def load(corpus: Path, limit: Optional[int]) -> list[dict]:
    path = corpus / "casino.json"
    if not path.exists():
        sys.exit(HOWTO.format(path=corpus, url=FILES["casino.json"]))
    data = json.loads(path.read_text(encoding="utf-8"))
    out = [d for d in data if d.get("annotations")]
    return out[:limit] if limit else out


def rows(dialogues: list[dict]) -> list[dict]:
    """Реплика + экспертные ярлыки + кто сказал.

    Совмещение по ТЕКСТУ, а не по индексу: в трёх диалогах из 396 список
    аннотаций короче списка реплик на одну, и наивный zip сдвигает всю
    разметку диалога на говорящего-соседа.
    """
    out = []
    for d in dialogues:
        logs = d["chat_logs"]
        i = 0
        for text, labels in d["annotations"]:
            while i < len(logs) and logs[i]["text"] != text:
                i += 1
            speaker = logs[i]["id"] if i < len(logs) else None
            i += 1
            out.append({
                "dialogue": d["dialogue_id"],
                "speaker": speaker,
                "text": text,
                "labels": {t.strip() for t in labels.split(",") if t.strip()},
            })
    return out


# ---------------------------------------------------------------------------

def kappa(tp: int, fp: int, fn: int, tn: int) -> float:
    n = tp + fp + fn + tn
    if not n:
        return 0.0
    po = (tp + tn) / n
    pe = ((tp + fp) * (tp + fn) + (fn + tn) * (fp + tn)) / (n * n)
    return 0.0 if pe == 1 else (po - pe) / (1 - pe)


def spearman(xs: list[float], ys: list[float]) -> float:
    def rank(v: list[float]) -> list[float]:
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r

    if len(xs) < 3:
        return 0.0
    rx, ry = rank(xs), rank(ys)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    return num / den if den else 0.0


SATISFACTION = {"Extremely dissatisfied": 1, "Slightly dissatisfied": 2, "Undecided": 3,
                "Slightly satisfied": 4, "Extremely satisfied": 5}
LIKENESS = {"Extremely dislike": 1, "Slightly dislike": 2, "Undecided": 3,
            "Slightly like": 4, "Extremely like": 5}


def bar(x: float) -> str:
    return f"{x * 100:5.1f}%"


def triggers(text: str, key: str) -> list[str]:
    from app.engine.techniques import _starts_at_word

    t = norm(text)
    return [w for w in LEX.get(key, []) if _starts_at_word(t, w)]


LEX_OF = {
    "interests_probe": "interestsProbe", "rapport": "rapport",
    "acknowledge": "acknowledge", "tradeoff": "tradeoff",
    "objective_criteria": "objectiveCriteria", "spin_problem": "spinProblem",
    "spin_situation": "spinSituation", "spin_implication": "spinImplication",
    "spin_needpayoff": "spinNeedPayoff", "batna": "batna", "threat": "threat",
    "hostile": "hostile", "concession": "concession", "anchor": "anchor",
    "accept": "accept",
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    default = os.environ.get("NEGO_CASINO_DIR", "/tmp/casino-data")
    ap.add_argument("--corpus", default=default, help=f"каталог с корпусом (сейчас {default})")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="сколько размеченных диалогов взять")
    ap.add_argument("--examples", type=int, default=8)
    ap.add_argument("--json", metavar="FILE")
    args = ap.parse_args()

    corpus = Path(args.corpus)
    if args.fetch:
        fetch(corpus)
        return 0

    dialogues = load(corpus, args.limit or None)
    data = rows(dialogues)
    cache: dict[str, Analysis] = {}

    def an(text: str) -> Analysis:
        if text not in cache:
            cache[text] = analyze(text)
        return cache[text]

    print("=" * 78)
    print("ВНЕШНЯЯ СВЕРКА КЛАССИФИКАТОРА · CaSiNo (Chawla et al., NAACL 2021)")
    print("=" * 78)
    print(f"Лицензия (прочитана файлом):   {check_license(corpus)}")
    print(f"Размеченных диалогов:          {len(dialogues)}")
    print(f"Размеченных реплик:            {len(data)}")
    print("Разметка: ТРИ ЭКСПЕРТА, уровень реплики, мульти-ярлык.")
    print("Домен: дележ припасов в кемпинге — БЕЗ цен и БЕЗ BATNA.")
    print("Корпус английский: русская половина словаря внешне НЕ проверена.")
    print()

    dist = Counter(l for r in data for l in r["labels"])
    print("-- их схема (девять стратегий + non-strategic) " + "-" * 31)
    print(f"   {'ярлык':<22} {'n':>6}  {'α разметчиков':>14}  {'F1 их BERT':>11}")
    for k, v in dist.most_common():
        a, f1, _ = PAPER.get(k, (None, None, None))
        astr = f"{a:.2f}" if a is not None else "—"
        fstr = f"{f1:.1f}" if f1 else ("исключён" if k in PAPER else "—")
        mark = "  ← отображения нет" if k in NO_MAPPING_THEIRS else ""
        print(f"   {k:<22} {v:6d}  {astr:>14}  {fstr:>11}{mark}")
    print()

    # ---------------- согласованность по отображённым классам --------------
    print("== СОГЛАСОВАННОСТЬ ПО ОТОБРАЖЁННЫМ КЛАССАМ " + "=" * 33)
    print(f"   {'их ярлык':<22} {'наш приём':<20} {'P':>7} {'R':>7} {'F1':>7} {'κ':>7}")
    results = {}
    conf: dict[str, tuple[int, int, int, int]] = {}
    ex_fp: dict[str, list[dict]] = defaultdict(list)
    ex_fn: dict[str, list[dict]] = defaultdict(list)
    for label, spec in MAPPED.items():
        pred: Callable[[Analysis], bool] = spec["pred"]
        tp = fp = fn = tn = 0
        for r in data:
            theirs = label in r["labels"]
            ours = pred(an(r["text"]))
            if theirs and ours:
                tp += 1
            elif theirs:
                fn += 1
                ex_fn[label].append(r)
            elif ours:
                fp += 1
                ex_fp[label].append(r)
            else:
                tn += 1
        p = tp / (tp + fp) if tp + fp else 0.0
        rc = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * p * rc / (p + rc) if p + rc else 0.0
        k = kappa(tp, fp, fn, tn)
        conf[label] = (tp, fp, fn, tn)
        results[label] = {"tp": tp, "fp": fp, "fn": fn, "tn": tn,
                          "precision": p, "recall": rc, "f1": f1, "kappa": k}
        print(f"   {label:<22} {spec['ours']:<20} {bar(p)} {bar(rc)} {bar(f1)} {k:7.3f}")
    print()
    print("   Ориентир: их собственный multi-task BERT даёт F1 83.2 на elicit-pref,")
    print("   82.7 на small-talk, 67.9 на vouch-fair (таблица 3 статьи). Наш")
    print("   классификатор — детерминированные списки слов без обучения.")
    print()

    print("-- матрицы ошибок " + "-" * 59)
    for label, (tp, fp, fn, tn) in conf.items():
        print(f"   {label} → {MAPPED[label]['ours']}")
        print(f"       {'':<22}{'мы: да':>10}{'мы: нет':>10}")
        print(f"       {'эксперты: да':<22}{tp:>10}{fn:>10}")
        print(f"       {'эксперты: нет':<22}{fp:>10}{tn:>10}")
    print()

    print("-- оговорки к каждому отображению " + "-" * 43)
    for label, spec in MAPPED.items():
        print(f"   {label}: {spec['caveat']}")
    print()

    # ---------------- широкое чтение elicit-pref ---------------------------
    tp = fn = 0
    for r in data:
        if "elicit-pref" not in r["labels"]:
            continue
        if MAPPED["elicit-pref"]["wide"](an(r["text"])):
            tp += 1
        else:
            fn += 1
    print(f"   Расширенное чтение elicit-pref (interests_probe ИЛИ любая стадия SPIN):")
    print(f"   полнота {bar(tp / (tp + fn)) if tp + fn else '—'} против "
          f"{bar(results['elicit-pref']['recall'])} на строгом. Наши стадии SPIN")
    print("   ловят часть вопросов о предпочтениях, которые не попали в interests_probe.")
    print()

    # ---------------- чем сработали / что пропустили -----------------------
    print("== ЧЕМ ИМЕННО МЫ СРАБАТЫВАЕМ (топ-триггеры словаря) " + "=" * 25)
    fired = Counter()
    trig: dict[str, Counter] = defaultdict(Counter)
    for r in data:
        for m in an(r["text"]).moves:
            fired[m] += 1
            key = LEX_OF.get(m)
            if key:
                for w in triggers(r["text"], key):
                    trig[m][w] += 1
    for m, c in fired.most_common():
        line = ", ".join(f"{w!r}×{n}" for w, n in trig[m].most_common(5))
        print(f"   {m:<20} {c:6d} {bar(c / len(data))}  {line}")
    print()

    # ---------------- исходы ------------------------------------------------
    print("== ПРЕДСКАЗАТЕЛЬНАЯ СИЛА: наши приёмы против экспертных ярлыков " + "=" * 13)
    print("   Спирмен между числом реплик участника с признаком и его исходом.")
    print("   Слева — экспертный ярлык, справа — наш приём. Если знаки и порядок")
    print("   совпадают, наш детектор ловит ТУ ЖЕ величину, даже расходясь на")
    print("   отдельных репликах.")
    print()
    per: dict[tuple[int, str], dict] = defaultdict(lambda: defaultdict(int))
    for r in data:
        if r["speaker"] is None:
            continue
        key = (r["dialogue"], r["speaker"])
        per[key]["_n"] += 1
        for l in r["labels"]:
            per[key]["L:" + l] += 1
        for m in an(r["text"]).moves:
            per[key]["M:" + m] += 1
    info = {d["dialogue_id"]: d["participant_info"] for d in dialogues}
    outcomes: dict[str, list[float]] = defaultdict(list)
    feats: dict[str, list[float]] = defaultdict(list)
    keys = [k for k in per if k[1] in info.get(k[0], {})]
    for k in keys:
        o = info[k[0]][k[1]]["outcomes"]
        outcomes["points"].append(float(o["points_scored"]))
        outcomes["satisfaction"].append(float(SATISFACTION.get(o["satisfaction"], 3)))
        outcomes["likeness"].append(float(LIKENESS.get(o["opponent_likeness"], 3)))
    for label, spec in MAPPED.items():
        for k in keys:
            n = max(1, per[k]["_n"])
            feats["L:" + label].append(per[k]["L:" + label] / n)
            feats["M:" + spec["ours"]].append(per[k]["M:" + spec["ours"]] / n)

    print(f"   участников в выборке: {len(keys)}")
    print(f"   {'признак':<40} {'points':>9} {'satisf.':>9} {'likeness':>9}")
    for label, spec in MAPPED.items():
        for tag, name in (("L:" + label, f"эксперт · {label}"),
                          ("M:" + spec["ours"], f"мы      · {spec['ours']}")):
            xs = feats[tag]
            cells = "".join(f"{spearman(xs, outcomes[o]):9.3f}"
                            for o in ("points", "satisfaction", "likeness"))
            print(f"   {name:<40}{cells}")
        print()

    # ---------------- примеры ----------------------------------------------
    k = args.examples
    print("== ПРИМЕРЫ РАСХОЖДЕНИЙ " + "=" * 54)
    for label in MAPPED:
        print(f"-- {label}: эксперты да, мы нет ({len(ex_fn[label])}) " + "-" * 20)
        for r in ex_fn[label][:k]:
            print(f"     {r['text'][:110]!r}")
        print(f"-- {label}: мы да, эксперты нет ({len(ex_fp[label])}) " + "-" * 20)
        for r in ex_fp[label][:k]:
            t = ", ".join(triggers(r["text"], LEX_OF[MAPPED[label]["ours"]]))
            print(f"     [{t}] {r['text'][:100]!r}")
        print()

    print("== ГДЕ ОТОБРАЖЕНИЯ НЕТ " + "=" * 54)
    print("   их стратегии без нашего приёма:")
    for k2, why in NO_MAPPING_THEIRS.items():
        print(f"     {k2:<16} {why}")
    print("   наши приёмы без их стратегии:")
    for k2, why in NO_MAPPING_OURS:
        print(f"     {k2:<38} {why}")
    print()

    if args.json:
        Path(args.json).write_text(json.dumps({
            "dialogues": len(dialogues), "utterances": len(data),
            "label_distribution": dict(dist),
            "agreement": results,
            "our_moves_fired": dict(fired),
            "triggers": {m: dict(c.most_common(20)) for m, c in trig.items()},
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"числа: {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
