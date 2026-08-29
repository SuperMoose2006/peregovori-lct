#!/usr/bin/env python
"""validate_against_cocoa.py — внешняя проверка классификатора приёмов.

ЗАЧЕМ. `app/engine/techniques.py::analyze` до сих пор проверялся только собой:
нашими тестами на репликах, которые мы же и придумали. Это слабейшая точка
доказательства — «проверили себя и остались довольны».

Здесь классификатор прогоняется по ЧУЖОМУ корпусу: CraigslistBargain из
stanfordnlp/cocoa — 6682 диалога живого торга, собранных на Amazon Mechanical
Turk, с разметкой диалоговых актов, сделанной ЧУЖИМ правилом (их
`craigslistbargain/model/parser.py`), а не нами.

ЧЕСТНАЯ ОГОВОРКА, которую нельзя убирать из вывода: их ярлыки —
МАШИННЫЕ. Реплики человеческие, разметка — вывод их rule-based разборщика
(HuggingFace помечает корпус `annotations_creators: machine-generated`).
Значит это согласие двух НЕЗАВИСИМЫХ правил на человеческом тексте, а не
сверка с золотым стандартом человека. Расхождение указывает, где смотреть, —
и не доказывает, что неправы мы.

Вторая оговорка: корпус английский. Проверяется английская половина словаря;
русская внешне не проверена ничем.

    python tools/validate_against_cocoa.py --fetch      # скачать корпус
    python tools/validate_against_cocoa.py              # прогон
    python tools/validate_against_cocoa.py --limit 100  # первые 100 диалогов
    python tools/validate_against_cocoa.py --examples 12

Корпус НЕ кладётся в репозиторий: он большой и чужой. Путь задаётся
`--corpus` или переменной `NEGO_COCOA_DIR`.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterator, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.engine.techniques import LEX, analyze, extract_number, norm  # noqa: E402

# CodaLab, где корпус лежал у авторов, отдаёт 500 с 2024 года. Живое зеркало —
# паркетная конвертация того же самого на HuggingFace: те же поля, тот же
# порядок реплик, включая машинную разметку `dialogue_acts.intent`.
MIRROR = (
    "https://huggingface.co/datasets/stanfordnlp/craigslist_bargains/"
    "resolve/refs%2Fconvert%2Fparquet/default/craigslist_bargains-{split}.parquet"
)
SPLITS = ("train", "validation", "test")
CACHE = "cb-all.jsonl"

HOWTO = """\
Корпуса нет на диске: {path}

Достать (≈3 МБ, лицензия репозитория stanfordnlp/cocoa — MIT):

    pip install pyarrow            # нужен только для распаковки паркета
    python tools/validate_against_cocoa.py --fetch --corpus {path}

Либо вручную, если нет сети у этой машины: скачать три файла
    {mirror}
для split ∈ train, validation, test, положить в {path} под именами
cb-<split>.parquet и повторить --fetch.
"""


# ---------------------------------------------------------------------------
# Корпус
# ---------------------------------------------------------------------------

def fetch(corpus: Path) -> None:
    """Скачать паркет и разложить в один JSONL, чтобы прогон не зависел от pyarrow."""
    corpus.mkdir(parents=True, exist_ok=True)
    import urllib.request

    for split in SPLITS:
        dst = corpus / f"cb-{split}.parquet"
        if dst.exists():
            print(f"  есть  {dst.name}")
            continue
        url = MIRROR.format(split=split)
        print(f"  качаю {dst.name} …", flush=True)
        urllib.request.urlretrieve(url, dst)

    try:
        import pyarrow.parquet as pq
    except ImportError:
        sys.exit(
            "Паркет скачан, но распаковать нечем.\n"
            "    pip install pyarrow\n"
            "и повторить --fetch (файлы уже на диске, заново качаться не будут)."
        )

    out = corpus / CACHE
    n = 0
    with out.open("w", encoding="utf-8") as f:
        for split in SPLITS:
            for row in pq.read_table(corpus / f"cb-{split}.parquet").to_pylist():
                f.write(json.dumps({
                    "split": split,
                    "roles": row["agent_info"]["Role"],
                    "category": (row["items"]["Category"] or [None])[0],
                    "listing": (row["items"]["Price"] or [None])[0],
                    "agent_turn": row["agent_turn"],
                    "intent": row["dialogue_acts"]["intent"],
                    "price": row["dialogue_acts"]["price"],
                    "utterance": row["utterance"],
                }, ensure_ascii=False) + "\n")
                n += 1
    print(f"  готово: {out} ({n} диалогов)")


def load(corpus: Path, limit: Optional[int]) -> list[dict]:
    cache = corpus / CACHE
    if not cache.exists():
        sys.exit(HOWTO.format(path=corpus, mirror=MIRROR.format(split="<split>")))
    out = []
    with cache.open(encoding="utf-8") as f:
        for line in f:
            out.append(json.loads(line))
            if limit and len(out) >= limit:
                break
    return out


def utterances(dialogues: list[dict]) -> Iterator[dict]:
    """Реплика с ярлыком. Пустые — служебные события `offer/accept/quit` без текста."""
    for d in dialogues:
        for i, (intent, text) in enumerate(zip(d["intent"], d["utterance"])):
            if not intent or not text.strip():
                continue
            yield {
                "intent": intent,
                "text": text,
                "price": d["price"][i] if i < len(d["price"]) else -1.0,
                "role": d["roles"][d["agent_turn"][i]] if i < len(d["agent_turn"]) else "?",
                "listing": d["listing"],
                "category": d["category"],
                "turn": i,
            }


# ---------------------------------------------------------------------------
# Отображение их актов на наши приёмы
# ---------------------------------------------------------------------------
#
# Построено ЧТЕНИЕМ их `classify_intent`, а не догадкой по названию. Порядок
# ветвей в их коде даёт железные следствия, на которых и держится сверка:
#
#   has_price ⟹ intent ∈ {init-price, counter-price, insist, agree}
#   и наоборот: intro/inquiry/inform/disagree/vague-price/unknown ⟹ цены НЕТ.
#
# Поэтому «упомянута ли цена» — единственный класс, где отображение
# ДВУСТОРОННЕЕ и можно считать каппу. Остальное — односторонняя полнота.

#: Их акт → наш приём, где соответствие честное и ДВУСТОРОННЕЕ.
MAPPED_PRICE_POS = ("init-price", "counter-price", "insist")
MAPPED_PRICE_NEG = ("intro", "inquiry", "inform", "disagree", "vague-price", "unknown")

#: Односторонние: их класс — подмножество нашего, обратное неверно.
#: Считаем ПОЛНОТУ (сколько их случаев мы поймали), точность посчитать нечем.
ONE_SIDED = {
    # tags == ['question'] и ничего больше. Вопрос, в котором есть ещё что-то
    # (цена, согласие), у них уедет в другой класс — поэтому только полнота.
    "inquiry": ("вопрос", lambda a: a.flags["question"]),
    # agreement_patterns ('that works', 'deal', 'ok', 'great') ИЛИ упоминание
    # своей же цены. Второе у нас закрытием не считается — и не должно.
    "agree": ("закрытие/принятие", lambda a: "accept" in a.moves),
    # Первый ход диалога без цены. Не обязательно приветствие: у них сюда
    # попадает и «is this still available?». Меряем описательно.
    "intro": ("контакт/приветствие", lambda a: "rapport" in a.moves),
}

#: Их акты, для которых у нас НЕТ приёма. Перечислены явно — отсутствие
#: отображения такой же результат, как отображение.
NO_MAPPING_THEIRS = {
    "vague-price": "разговор о цене без числа («come down», «too high») — "
                   "у нас такого приёма нет, число либо есть, либо нет",
    "disagree": "чистое отрицание. У нас несогласие не приём, а следствие "
                "(движок меряет его реакцией оппонента, а не ярлыком хода)",
    "inform": "ответ на вопрос партнёра. У нас это `statement` — мусорная "
              "корзина, а не приём; сравнивать нечего",
    "unknown": "их отказ классифицировать (24% реплик). Сверять свой ответ с "
               "чужим «не знаю» бессмысленно",
    "insist": "повтор СВОЕЙ прежней цены. Учтён в сверке цены, но как "
              "отдельный приём у нас не выделен",
}

#: Наши приёмы, которых нет у них. Не ошибка ни одной стороны: у них разметка
#: под торг на Craigslist, у нас — под гарвардскую школу.
NO_MAPPING_OURS = [
    ("interests_probe", "вскрытие интересов — стержень нашего продукта, у них класса нет"),
    ("spin_situation/problem/implication/needpayoff", "стадии SPIN"),
    ("objective_criteria", "объективный критерий"),
    ("batna", "BATNA / альтернатива"),
    ("tradeoff", "размен, создающий ценность"),
    ("acknowledge", "активное слушание"),
    ("threat", "ультиматум"),
    ("hostile", "грубость"),
    ("concession", "уступка (их counter-price её не отличает от контроффера)"),
    ("anchor", "якорь (их init-price близок, но задан позицией в диалоге, а не формулировкой)"),
]


# ---------------------------------------------------------------------------
# Меры
# ---------------------------------------------------------------------------

def kappa(tp: int, fp: int, fn: int, tn: int) -> float:
    n = tp + fp + fn + tn
    if not n:
        return 0.0
    po = (tp + tn) / n
    pe = ((tp + fp) * (tp + fn) + (fn + tn) * (fp + tn)) / (n * n)
    return 0.0 if pe == 1 else (po - pe) / (1 - pe)


def triggers(text: str, key: str) -> list[str]:
    """Какие именно слова словаря сработали — чтобы находка была адресной."""
    from app.engine.techniques import _starts_at_word

    t = norm(text)
    return [w for w in LEX.get(key, []) if _starts_at_word(t, w)]


def bar(x: float) -> str:
    return f"{x * 100:5.1f}%"


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    default = os.environ.get("NEGO_COCOA_DIR", "/tmp/cocoa-data")
    ap.add_argument("--corpus", default=default, help=f"каталог с корпусом (сейчас {default})")
    ap.add_argument("--fetch", action="store_true", help="скачать корпус и выйти")
    ap.add_argument("--limit", type=int, default=0, help="сколько диалогов взять (0 = все)")
    ap.add_argument("--examples", type=int, default=8, help="сколько примеров на каждое расхождение")
    ap.add_argument("--json", metavar="FILE", help="сложить числа машиночитаемо")
    args = ap.parse_args()

    corpus = Path(args.corpus)
    if args.fetch:
        fetch(corpus)
        return 0

    dialogues = load(corpus, args.limit or None)
    utts = list(utterances(dialogues))

    print("=" * 78)
    print("ВНЕШНЯЯ СВЕРКА КЛАССИФИКАТОРА · CraigslistBargain (stanfordnlp/cocoa)")
    print("=" * 78)
    print(f"Диалогов прочитано:            {len(dialogues)}")
    labeled = len({id(d) for d in dialogues if any(d["intent"])})
    print(f"Из них с чужой разметкой:      {labeled}")
    print(f"Размеченных реплик с текстом:  {len(utts)}")
    print()
    print("Их ярлыки — МАШИННЫЕ (их rule-based разборщик), реплики — человеческие.")
    print("Это согласие двух независимых правил, а не сверка с человеком.")
    print("Корпус английский: русская половина словаря внешне НЕ проверена.")
    print()

    dist = Counter(u["intent"] for u in utts)
    print("-- их схема актов (уровень: одна реплика) " + "-" * 35)
    for k, v in dist.most_common():
        note = "  ← отображения нет" if k in NO_MAPPING_THEIRS else ""
        print(f"   {k:<15} {v:6d}  {bar(v / len(utts))}{note}")
    print()

    # ---------------- A. цена: двусторонняя сверка -------------------------
    tp = fp = fn = tn = 0
    ex_fp: list[dict] = []
    ex_fn: list[dict] = []
    for u in utts:
        if u["intent"] not in MAPPED_PRICE_POS and u["intent"] not in MAPPED_PRICE_NEG:
            continue  # agree — двусмысленный, из сверки цены исключён
        theirs = u["intent"] in MAPPED_PRICE_POS
        a = analyze(u["text"])
        ours = a.number is not None
        if theirs and ours:
            tp += 1
        elif theirs and not ours:
            fn += 1
            ex_fn.append(u)
        elif ours and not theirs:
            fp += 1
            ex_fp.append(u)
        else:
            tn += 1

    n = tp + fp + fn + tn
    acc = (tp + tn) / n if n else 0.0
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0

    print("== A. ЦЕНА НАЗВАНА (единственный двусторонний класс) " + "=" * 24)
    print("   их «да»:  init-price · counter-price · insist")
    print("   их «нет»: intro · inquiry · inform · disagree · vague-price · unknown")
    print("   наш «да»: offer_number() вернул число")
    print("   вне сверки: agree (у них может нести цену, а может не нести)")
    print()
    print(f"   реплик в сверке      {n}")
    print(f"   согласие             {bar(acc)}")
    print(f"   каппа Коэна          {kappa(tp, fp, fn, tn):.3f}")
    print(f"   точность / полнота   {bar(prec)} / {bar(rec)}   F1 {bar(f1)}")
    print()
    print("   матрица ошибок                мы: цена     мы: нет")
    print(f"     они: цена                  {tp:8d}    {fn:8d}")
    print(f"     они: нет                   {fp:8d}    {tn:8d}")
    print()

    # Верхняя граница: число в реплике вообще есть?
    raw_fn = sum(1 for u in ex_fn if extract_number(norm(u["text"])) is not None)
    print(f"   Из {fn} наших пропусков в {raw_fn} ({bar(raw_fn / fn) if fn else '—'}) "
          f"число В РЕПЛИКЕ ЕСТЬ,")
    print("   но offer_number отказался считать его ценой. Это наш отказ, а не")
    print("   отсутствие числа — то есть чинится словарём, а не регуляркой.")
    print()

    # ---------------- B. значение цены -------------------------------------
    same = diff = 0
    ex_val: list[tuple[dict, float, float]] = []
    for u in utts:
        if u["price"] is None or u["price"] < 0:
            continue
        ours = analyze(u["text"]).number
        if ours is None:
            continue
        if abs(ours - u["price"]) < 1e-6:
            same += 1
        else:
            diff += 1
            ex_val.append((u, u["price"], ours))
    tot = same + diff
    print("== B. ЗНАЧЕНИЕ ЦЕНЫ (там, где число назвали обе стороны) " + "=" * 20)
    print(f"   сравнимых реплик     {tot}")
    print(f"   совпало число        {bar(same / tot) if tot else '—'} ({same})")
    print(f"   разошлось            {bar(diff / tot) if tot else '—'} ({diff})")
    print("   Их число — «предложенная цена» после их же фильтров (не повтор")
    print("   текущей, не листинговая у покупателя). Наше — ПЕРВОЕ число реплики.")
    print("   Расхождение здесь не обязательно наша ошибка.")
    print()

    # ---------------- C. односторонние классы ------------------------------
    print("== C. ОДНОСТОРОННИЕ КЛАССЫ (только полнота) " + "=" * 33)
    one_sided_rows = {}
    misses: dict[str, list[dict]] = defaultdict(list)
    for intent, (title, pred) in ONE_SIDED.items():
        pool = [u for u in utts if u["intent"] == intent]
        hit = 0
        for u in pool:
            if pred(analyze(u["text"])):
                hit += 1
            else:
                misses[intent].append(u)
        one_sided_rows[intent] = (len(pool), hit)
        print(f"   их {intent:<12} → наш {title:<22} "
              f"{hit:6d}/{len(pool):<6d} {bar(hit / len(pool)) if pool else '—'}")
    print("   Точность здесь посчитать НЕЧЕМ: их класс — не «все вопросы», а")
    print("   «вопрос и больше ничего». Наше срабатывание вне их класса не ошибка.")
    print()

    # ---------------- D. что мы видим там, где у них ярлыка нет -------------
    print("== D. НАШИ ПРИЁМЫ НА ЧУЖОМ ТЕКСТЕ (у них класса нет) " + "=" * 24)
    fired = Counter()
    fired_by_trigger: dict[str, Counter] = defaultdict(Counter)
    sample: dict[str, list[dict]] = defaultdict(list)
    lex_of = {
        "spin_problem": "spinProblem", "spin_situation": "spinSituation",
        "spin_implication": "spinImplication", "spin_needpayoff": "spinNeedPayoff",
        "interests_probe": "interestsProbe", "objective_criteria": "objectiveCriteria",
        "acknowledge": "acknowledge", "batna": "batna", "tradeoff": "tradeoff",
        "threat": "threat", "hostile": "hostile", "concession": "concession",
        "anchor": "anchor", "rapport": "rapport", "accept": "accept",
    }
    for u in utts:
        a = analyze(u["text"])
        for m in a.moves:
            fired[m] += 1
            key = lex_of.get(m)
            if key:
                for w in triggers(u["text"], key):
                    fired_by_trigger[m][w] += 1
                if len(sample[m]) < 400:
                    sample[m].append(u)
    for m, cnt in fired.most_common():
        print(f"   {m:<20} {cnt:6d}  {bar(cnt / len(utts))}")
    print()

    print("-- чем именно сработали (топ-триггеры) " + "-" * 38)
    for m in ("spin_problem", "concession", "tradeoff", "threat", "objective_criteria",
              "batna", "acknowledge", "hostile", "anchor", "accept", "rapport"):
        top = fired_by_trigger.get(m)
        if not top:
            continue
        line = ", ".join(f"{w!r}×{c}" for w, c in top.most_common(6))
        print(f"   {m:<20} {line}")
    print()

    # ---------------- E. примеры -------------------------------------------
    k = args.examples

    def show(title: str, items, fmt) -> None:
        print(f"-- {title} " + "-" * max(0, 74 - len(title)))
        for it in items[:k]:
            print("   " + fmt(it))
        print()

    show("A/FN · они видят цену, мы нет", ex_fn,
         lambda u: f"[{u['intent']}] {u['text'][:110]!r}")
    show("A/FP · мы видим цену, они нет", ex_fp,
         lambda u: f"[{u['intent']}] {u['text'][:110]!r}")
    show("B · число разошлось (их / наше)", ex_val,
         lambda t: f"их {t[1]:g} · наше {t[2]:g} :: {t[0]['text'][:90]!r}")
    for intent in ONE_SIDED:
        show(f"C/пропуск · их {intent}, мы не поймали", misses[intent],
             lambda u: repr(u["text"][:110]))

    print("== ГДЕ ОТОБРАЖЕНИЯ НЕТ " + "=" * 54)
    print("   их акты без нашего приёма:")
    for k2, why in NO_MAPPING_THEIRS.items():
        print(f"     {k2:<14} {why}")
    print("   наши приёмы без их акта:")
    for k2, why in NO_MAPPING_OURS:
        print(f"     {k2:<42} {why}")
    print()

    if args.json:
        Path(args.json).write_text(json.dumps({
            "dialogues": len(dialogues),
            "utterances": len(utts),
            "intent_distribution": dict(dist),
            "price": {"tp": tp, "fp": fp, "fn": fn, "tn": tn,
                      "accuracy": acc, "kappa": kappa(tp, fp, fn, tn),
                      "precision": prec, "recall": rec, "f1": f1,
                      "fn_with_a_number_in_text": raw_fn},
            "price_value": {"same": same, "diff": diff},
            "one_sided": {k2: {"n": v[0], "hit": v[1]} for k2, v in one_sided_rows.items()},
            "our_moves_fired": dict(fired),
            "triggers": {m: dict(c.most_common(20)) for m, c in fired_by_trigger.items()},
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"числа: {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
