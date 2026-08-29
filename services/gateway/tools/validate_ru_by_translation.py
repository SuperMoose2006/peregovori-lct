#!/usr/bin/env python
"""validate_ru_by_translation.py — суррогатная внешняя проверка РУССКОЙ половины словаря.

ЗАЧЕМ ЭТОТ ПРИБОР ВООБЩЕ СУЩЕСТВУЕТ. Английская половина классификатора
(`app/engine/techniques.py`) прогнана по двум чужим корпусам живых переговоров
— `validate_against_cocoa.py` (CraigslistBargain, 36 862 реплики) и
`validate_against_casino.py` (CaSiNo, 4615 реплик, три эксперта). Русская
половина не прогнана НИ ПО ЧЕМУ внешнему: она держится на наших же тестах,
написанных на наших же репликах. Её собственный отчёт (docs/validation.md § 6)
называет это самым слабым местом всей проверки.

Русскоязычного корпуса переговоров с разметкой приёмов в открытом доступе
найти не удалось (что именно искали — docs/validation.md § 7.1). Поэтому здесь
СУРРОГАТ, и его ограничения обязаны стоять ДО чисел, а не в сноске.

═══════════════════════════════════════════════════════════════════════════
МЕТОД: ПЕРЕНОС РАЗМЕТКИ ПЕРЕВОДОМ

Берём реплики, размеченные ЧУЖИМИ людьми (CaSiNo — три эксперта) и чужим
правилом (CraigslistBargain), переводим выборку на русский и спрашиваем: там,
где английская половина словаря срабатывает на оригинале, срабатывает ли
русская на переводе. Экспертная метка при переводе сохраняется: меняется язык,
а не намерение говорящего.

ЧЕМ ЭТО ИЗМЕРЕНИЕ ОПТИМИСТИЧНО — ЧЕТЫРЕ ПРИЧИНЫ, ВСЕ НАЗВАНЫ ЗАРАНЕЕ

  1. ГЛАВНАЯ. Перевод делает языковая модель, и её русский — это ЕЁ
     представление о том, как сказать то же самое. Наш словарь писали люди,
     думавшие ровно о том же и в том же регистре. Совпасть они могут просто
     потому, что и то и другое — «книжный» русский, а не потому, что словарь
     ловит живую речь. Любая цифра полноты ниже — ВЕРХНЯЯ оценка.

  2. Модель-переводчик — из того же семейства, что генератор реплик оппонента
     в самом продукте. То есть мы меряем словарь на русском, который наш же
     продукт и производит. Это ещё один виток той же петли.

  3. Живой русский торг никто не размечал. Метка приехала из английского
     диалога о кемпинге и с Craigslist. Домен не наш ни там, ни там — в CaSiNo
     нет цен вовсе, на Craigslist нет ни SPIN, ни BATNA, ни объективных
     критериев.

  4. Перевод — не транскрипт. В нём нет опечаток, оборванных фраз, мата,
     голосового распознавания и раскладки. Настоящий игрок пишет хуже.

ЧЕМ ПЕРЕКОС ОСЛАБЛЕН (не снят — ослаблен)

  · У переводчика просят РАЗГОВОРНУЮ реплику, а не дословный перевод, и прямо
    запрещают деловой/тренинговый регистр.
  · Просят ТРИ варианта разного регистра, а не один. Разброс полноты между
    вариантами — сам по себе результат: если словарь ловит только вариант №1,
    он ловит формулировку, а не смысл.
  · Промпт не содержит НИ ОДНОГО слова из нашего словаря и ничего не знает про
    приёмы. Переводчик переводит чат, а не «приём вскрытия интересов».

═══════════════════════════════════════════════════════════════════════════
ВЫБОРКА — по стратам, а не подряд

Подряд взятая выборка состоит из частого, а проверить надо в том числе редкое
и то, что чинили сегодня. Страты (детерминированный отбор, seed в коде):

  CaSiNo, по ЭКСПЕРТНОМУ ярлыку (наш детектор в отборе не участвует):
    elicit-pref · small-talk · showing-empathy · promote-coordination ·
    vouch-fair · контроль «ни одного отображённого ярлыка»

  CraigslistBargain, по трём классам, которые чинились в § 4.7–4.9:
    price_intent   — цена доказана ТОЛЬКО формулой `offerIntent`
    price_plain    — цена доказана валютой или ценовым контекстом (контроль)
    short_close    — закрытие одним словом (`_is_short_close`)
    negated_problem— слово «problem» под отрицанием (§ 4.8)

═══════════════════════════════════════════════════════════════════════════
ЦЕНА. Перевод — платные вызовы: один вызов на реплику, три варианта в ответе.
Выборка кэшируется на диск и второй раз не оплачивается.

    .venv/bin/python tools/validate_ru_by_translation.py --plan       # состав выборки, 0 вызовов
    .venv/bin/python tools/validate_ru_by_translation.py --translate  # ПЛАТНО, пишет кэш
    .venv/bin/python tools/validate_ru_by_translation.py              # отчёт по кэшу

Ключ живёт в services/gateway/.env и в командную строку не попадает.

ПЕРЕВЕДЁННАЯ ВЫБОРКА В РЕПОЗИТОРИЙ НЕ КЛАДЁТСЯ — как и сами корпуса. Причина
не только в размере: у CraigslistBargain к транскриптам НЕТ явной лицензии
данных (docs/validation.md § 1), а перевод — производная работа от них.
Кэш лежит рядом с корпусами, вне дерева: `--cache` или `NEGO_RU_TRANSFER_DIR`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))  # рядом лежат оба валидатора

from app.engine.techniques import (  # noqa: E402
    LEX, MONEY_RE, Analysis, _has, _has_unnegated, _is_short_close,
    _MONEY_SUFFIX_RE, analyze, norm,
)

import validate_against_casino as CASINO  # noqa: E402
import validate_against_cocoa as COCOA  # noqa: E402

#: Отбор обязан воспроизводиться: иначе «перезамерить» значит «замерить другое».
SEED = 20260829

#: Страты и их размеры. Сумма — 340 реплик, один платный вызов на каждую.
CASINO_STRATA = {
    "elicit-pref": 40,
    "small-talk": 40,
    "showing-empathy": 30,
    "promote-coordination": 30,
    "vouch-fair": 30,
    "control-none": 30,
}
COCOA_STRATA = {
    "price_intent": 40,
    "price_plain": 30,
    "short_close": 40,
    "negated_problem": 30,
}

#: Сколько вариантов перевода просить у модели. Три: нейтральный разговорный,
#: сниженный, и «то же другими словами». Разброс между ними — результат.
VARIANTS = 3

CACHE_FILE = "ru-transfer-sample.json"

HOWTO = """\
Переведённой выборки нет на диске: {path}

Она стоит платных вызовов, поэтому кэшируется и не пересчитывается зря:

    .venv/bin/python tools/validate_ru_by_translation.py --plan       # 0 вызовов, состав выборки
    .venv/bin/python tools/validate_ru_by_translation.py --translate  # ПЛАТНО ({n} вызовов)

Ключ — в services/gateway/.env (OPENAI_API_KEY, ключ OpenRouter).
Корпуса нужны оба: /tmp/casino-data и /tmp/cocoa-data
(см. tools/validate_against_casino.py --fetch и tools/validate_against_cocoa.py --fetch).
"""


# ---------------------------------------------------------------------------
# .env — как у judge_spread.py: секрет из файла, а не из командной строки
# ---------------------------------------------------------------------------

def _load_dotenv() -> None:
    path = _ROOT / ".env"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


# ---------------------------------------------------------------------------
# Чем именно доказана цена — нужно, чтобы отобрать страту `price_intent`
# ---------------------------------------------------------------------------

def price_proof(t: str, moves: list[str]) -> Optional[str]:
    """Какая ветка `offer_number` признала число ценой. Порядок ТОТ ЖЕ.

    Нужно для страты: реплики, где единственным доказательством цены была
    формула `offerIntent`, — это ровно то, что добавлено в § 4.7, и ровно то,
    русская половина чего написана по симметрии, а не по замеру.
    """
    m = MONEY_RE.search(t)
    if not m:
        return None
    tail = t[m.end(1):]
    after = tail.strip().split(" ")[0].strip(".,?!-") if tail.strip() else ""
    if after and any(after.startswith(u) for u in LEX["nonPriceUnits"]):
        return None
    if any(k in moves for k in ("anchor", "concession", "accept", "tradeoff")):
        return "move"
    if _MONEY_SUFFIX_RE.match(tail):
        return "suffix"
    if _has(t, LEX["priceContext"]):
        return "context"
    if _has(t, LEX["offerIntent"]):
        return "offerIntent"
    if len([w for w in t.split(" ") if w]) <= 1:
        return "bare"
    return None


# ---------------------------------------------------------------------------
# Выборка
# ---------------------------------------------------------------------------

def build_sample(casino_dir: Path, cocoa_dir: Path) -> list[dict]:
    rng = random.Random(SEED)
    out: list[dict] = []
    seen: set[str] = set()

    def take(pool: list[dict], n: int, stratum: str, source: str) -> None:
        uniq = []
        local: set[str] = set()
        for r in pool:
            key = r["text"].strip()
            if len(key) < 3 or key in seen or key in local:
                continue
            local.add(key)
            uniq.append(r)
        rng.shuffle(uniq)
        for r in uniq[:n]:
            seen.add(r["text"].strip())
            out.append({"source": source, "stratum": stratum, "text": r["text"],
                        "labels": sorted(r.get("labels", [])), "intent": r.get("intent")})

    # --- CaSiNo: отбор по ЭКСПЕРТНОМУ ярлыку, наш детектор не участвует ----
    cas = CASINO.rows(CASINO.load(casino_dir, None))
    mapped = set(CASINO.MAPPED)
    for label, n in CASINO_STRATA.items():
        if label == "control-none":
            pool = [dict(r, labels=r["labels"]) for r in cas if not (r["labels"] & mapped)]
        else:
            pool = [dict(r, labels=r["labels"]) for r in cas if label in r["labels"]]
        take(pool, n, label, "casino")

    # --- CraigslistBargain: отбор по классам, чинённым в § 4.7–4.9 ---------
    cb = list(COCOA.utterances(COCOA.load(cocoa_dir, None)))
    buckets: dict[str, list[dict]] = defaultdict(list)
    for u in cb:
        t = norm(u["text"])
        a = analyze(u["text"])
        if _is_short_close(t):
            buckets["short_close"].append(u)
        if _has(t, LEX["spinProblem"]) and not _has_unnegated(t, LEX["spinProblem"]):
            buckets["negated_problem"].append(u)
        if u["intent"] in COCOA.MAPPED_PRICE_POS and a.number is not None:
            proof = price_proof(t, a.moves)
            if proof == "offerIntent":
                buckets["price_intent"].append(u)
            elif proof in ("suffix", "context"):
                buckets["price_plain"].append(u)
    for stratum, n in COCOA_STRATA.items():
        take(buckets[stratum], n, stratum, "cocoa")

    return out


# ---------------------------------------------------------------------------
# Перевод
# ---------------------------------------------------------------------------

#: Промпт НЕ содержит ни одного слова из нашего словаря и ничего не знает про
#: приёмы: переводчик переводит чат, а не «вскрытие интересов». Запрет на
#: деловой регистр стоит здесь, потому что именно деловой регистр и есть тот
#: перекос, ради которого прибор пишется, — снять его нельзя, но просить не
#: усугублять можно.
SYSTEM = (
    "Ты переводишь реплики из чата на русский язык. Собеседники — обычные люди, "
    "которые в свободной форме о чём-то договариваются: кто что берёт, кто "
    "сколько платит, кто в чём уступит.\n"
    "\n"
    "Правила:\n"
    "1. Переводи ЖИВОЙ разговорной речью — так, как человек написал бы это "
    "в мессенджере. НЕ деловым стилем, НЕ языком бизнес-тренинга, НЕ дословно.\n"
    "2. Намерение говорящего должно сохраниться полностью: если он спрашивает — "
    "спрашивает, если давит — давит, если называет число — называет то же число.\n"
    "3. Числа переноси как есть. Валюту передавай так, как сказал бы русский "
    "человек в этой ситуации.\n"
    "4. Дай РОВНО три разных варианта одного и того же смысла:\n"
    "   первый — нейтрально-разговорный;\n"
    "   второй — сниженный, неформальный, можно с сокращениями;\n"
    "   третий — то же самое, но другими словами и другой конструкцией.\n"
    "5. Не добавляй ничего от себя, не объясняй, не извиняйся.\n"
    "\n"
    'Ответ — ТОЛЬКО JSON-массив из трёх строк, без разметки: ["...", "...", "..."]'
)

CALLS = 0


async def translate_one(text: str, sem: asyncio.Semaphore) -> list[str]:
    global CALLS
    from app.providers.openrouter import chat

    async with sem:
        CALLS += 1
        raw = await chat.complete(SYSTEM, text, role="reasoning", max_tokens=400,
                                  temperature=0.9, raw=True)
    if not raw:
        return []
    s = raw.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[-1].rsplit("```", 1)[0]
    at = s.find("[")
    if at > 0:
        s = s[at:]
    try:
        got = json.loads(s)
    except Exception:
        return []
    if not isinstance(got, list):
        return []
    return [str(v).strip() for v in got if isinstance(v, (str, int, float)) and str(v).strip()][:VARIANTS]


async def translate_all(sample: list[dict], parallel: int) -> None:
    sem = asyncio.Semaphore(parallel)
    done = 0

    async def one(row: dict) -> None:
        nonlocal done
        row["ru"] = await translate_one(row["text"], sem)
        done += 1
        if done % 20 == 0:
            print(f"  переведено {done}/{len(sample)}", flush=True)

    await asyncio.gather(*(one(r) for r in sample))
    from app.providers.openrouter import chat
    await chat.aclose()


# ---------------------------------------------------------------------------
# Замер
# ---------------------------------------------------------------------------

def kappa(tp: int, fp: int, fn: int, tn: int) -> float:
    return CASINO.kappa(tp, fp, fn, tn)


def pct(x: float) -> str:
    return f"{x * 100:5.1f}%"


LEX_OF = CASINO.LEX_OF


def triggers(text: str, move: str) -> list[str]:
    key = LEX_OF.get(move)
    if not key:
        return []
    return CASINO.triggers(text, key)


def report(sample: list[dict], examples: int, dump: Optional[str]) -> int:
    live = [r for r in sample if r.get("ru")]
    dead = [r for r in sample if not r.get("ru")]

    print("=" * 78)
    print("РУССКАЯ ПОЛОВИНА СЛОВАРЯ · ПЕРЕНОС ЧУЖОЙ РАЗМЕТКИ ПЕРЕВОДОМ")
    print("=" * 78)
    print()
    print("ЧТО ЭТО НЕ ЕСТЬ. Это НЕ проверка на русском корпусе — русского корпуса")
    print("переговоров с разметкой найти не удалось. Это суррогат, и он ОПТИМИСТИЧЕН:")
    print()
    print("  1. Русский здесь придумала модель. Наш словарь придумали мы. Совпасть")
    print("     они могут просто потому, что и то и другое — «книжный» русский.")
    print("     Всякая полнота ниже — ВЕРХНЯЯ оценка, а не оценка.")
    print("  2. Переводчик — из того же семейства моделей, что генератор реплик")
    print("     оппонента в продукте: словарь меряется на русском, который продукт")
    print("     сам и производит.")
    print("  3. Домен чужой в обоих корпусах: кемпинг без цен и торг на Craigslist.")
    print("  4. Перевод чище живой речи: без опечаток, обрывов и распознавания.")
    print()
    print("ЧЕМ ПЕРЕКОС ОСЛАБЛЕН: у переводчика просили разговорную реплику и ТРИ")
    print("варианта разного регистра. Разброс между вариантами напечатан ниже — если")
    print("словарь ловит только вариант №1, он ловит формулировку, а не смысл.")
    print()

    print("-- выборка " + "-" * 66)
    by = Counter((r["source"], r["stratum"]) for r in sample)
    for (src, st), n in by.items():
        got = sum(1 for r in live if r["source"] == src and r["stratum"] == st)
        print(f"   {src:<8} {st:<20} отобрано {n:4d}   переведено {got:4d}")
    print(f"   {'ИТОГО':<29} {len(sample):4d}   {'':10} {len(live):4d}"
          + (f"   (перевод не разобран: {len(dead)})" if dead else ""))
    nvar = Counter(len(r["ru"]) for r in live)
    print(f"   вариантов на реплику: " + ", ".join(f"{k}→{v}" for k, v in sorted(nvar.items())))
    print()

    # --------------------------------------------------------------------
    # 1. Перенос по приёмам: EN на оригинале → RU на переводе
    # --------------------------------------------------------------------
    cache: dict[str, Analysis] = {}

    def an(text: str) -> Analysis:
        if text not in cache:
            cache[text] = analyze(text)
        return cache[text]

    moves_all: set[str] = set()
    for r in live:
        moves_all |= set(an(r["text"]).moves)
        for v in r["ru"]:
            moves_all |= set(an(v).moves)
    moves_all -= {"statement"}

    print("== 1. ПЕРЕНОС ПРИЁМА: английская половина на оригинале → русская на переводе " + "=" * 1)
    print("   EN·n   — на скольких оригиналах сработала английская половина")
    print("   RU·любой — доля из них, где сработала русская хотя бы на ОДНОМ варианте")
    print("   RU·все   — доля, где сработала на ВСЕХ трёх (устойчивость к формулировке)")
    print("   по вариантам — полнота отдельно на 1-м, 2-м, 3-м; разброс = max−min")
    print("   RU-лишних — сработала русская там, где английская молчала (и наоборот)")
    print()
    print(f"   {'приём':<20} {'EN·n':>5} {'RU·любой':>9} {'RU·все':>8} "
          f"{'в1':>6} {'в2':>6} {'в3':>6} {'разброс':>8} {'RU-лишних':>10}")
    transfer: dict[str, dict] = {}
    misses: dict[str, list[dict]] = defaultdict(list)
    extras: dict[str, list[dict]] = defaultdict(list)
    for m in sorted(moves_all):
        en_rows = [r for r in live if m in an(r["text"]).moves]
        if not en_rows:
            en_rows = []
        any_hit = all_hit = 0
        per_var = [[0, 0] for _ in range(VARIANTS)]
        for r in en_rows:
            hits = [m in an(v).moves for v in r["ru"]]
            if any(hits):
                any_hit += 1
            else:
                misses[m].append(r)
            if hits and all(hits):
                all_hit += 1
            for i, h in enumerate(hits[:VARIANTS]):
                per_var[i][1] += 1
                per_var[i][0] += 1 if h else 0
        extra = 0
        for r in live:
            if m in an(r["text"]).moves:
                continue
            if any(m in an(v).moves for v in r["ru"]):
                extra += 1
                extras[m].append(r)
        n = len(en_rows)
        if n == 0 and extra == 0:
            continue
        rates = [(a / b) if b else 0.0 for a, b in per_var]
        spread = (max(rates) - min(rates)) if n else 0.0
        transfer[m] = {"en_n": n, "any": any_hit, "all": all_hit,
                       "per_variant": rates, "spread": spread, "ru_extra": extra}
        if n:
            print(f"   {m:<20} {n:5d} {pct(any_hit / n):>9} {pct(all_hit / n):>8} "
                  f"{pct(rates[0]):>6} {pct(rates[1]):>6} {pct(rates[2]):>6} "
                  f"{pct(spread):>8} {extra:10d}")
        else:
            print(f"   {m:<20} {0:5d} {'—':>9} {'—':>8} {'—':>6} {'—':>6} {'—':>6} "
                  f"{'—':>8} {extra:10d}")
    print()

    # --------------------------------------------------------------------
    # 2. CaSiNo: против ЭКСПЕРТОВ, а не против самих себя
    # --------------------------------------------------------------------
    cas = [r for r in live if r["source"] == "casino"]
    print("== 2. CaSiNo · против ЭКСПЕРТНОЙ разметки, EN-оригинал против RU-перевода " + "=" * 3)
    print("   Здесь наш детектор в отборе НЕ участвовал: страты нарезаны по ярлыкам")
    print("   трёх экспертов. Это единственная строка отчёта, где русская половина")
    print("   сверяется с человеком, а не сама с собой через английскую.")
    print("   ВАЖНО: выборка стратифицирована, поэтому доля положительных завышена")
    print("   против корпуса — сравнивать нужно КОЛОНКИ друг с другом, а не эти")
    print("   числа с таблицей § 3 отчёта.")
    print()
    print(f"   {'ярлык → приём':<40} {'сторона':<10} {'P':>7} {'R':>7} {'F1':>7} {'κ':>7}")
    casino_rows: dict[str, dict] = {}
    for label, spec in CASINO.MAPPED.items():
        ours = spec["ours"]
        row: dict[str, dict] = {}
        for side in ("EN·оригинал", "RU·любой", "RU·все"):
            tp = fp = fn = tn = 0
            for r in cas:
                theirs = label in r["labels"]
                if side == "EN·оригинал":
                    got = ours in an(r["text"]).moves
                elif side == "RU·любой":
                    got = any(ours in an(v).moves for v in r["ru"])
                else:
                    got = bool(r["ru"]) and all(ours in an(v).moves for v in r["ru"])
                if theirs and got:
                    tp += 1
                elif theirs:
                    fn += 1
                elif got:
                    fp += 1
                else:
                    tn += 1
            p = tp / (tp + fp) if tp + fp else 0.0
            rc = tp / (tp + fn) if tp + fn else 0.0
            f1 = 2 * p * rc / (p + rc) if p + rc else 0.0
            k = kappa(tp, fp, fn, tn)
            row[side] = {"tp": tp, "fp": fp, "fn": fn, "tn": tn,
                         "precision": p, "recall": rc, "f1": f1, "kappa": k}
            head = f"{label} → {ours}" if side == "EN·оригинал" else ""
            print(f"   {head:<40} {side:<10} {pct(p):>7} {pct(rc):>7} {pct(f1):>7} {k:7.3f}")
        casino_rows[label] = row
        print()

    # --------------------------------------------------------------------
    # 3. CraigslistBargain: ровно то, что чинилось сегодня
    # --------------------------------------------------------------------
    print("== 3. CraigslistBargain · три приёма, чинённые в § 4.7–4.9 " + "=" * 18)
    print("   Здесь отбор шёл ПО НАШЕМУ ЖЕ детектору на английском — значит EN всегда")
    print("   100% по построению, и меряется ровно одно: доживает ли приём до русского.")
    print()
    cocoa_rows: dict[str, dict] = {}
    checks = {
        "price_intent": ("цена, доказанная только формулой offerIntent",
                         lambda a: a.number is not None),
        "price_plain": ("цена, доказанная валютой/ценовым контекстом (контроль)",
                        lambda a: a.number is not None),
        "short_close": ("закрытие одним словом", lambda a: "accept" in a.moves),
        "negated_problem": ("«problem» ПОД ОТРИЦАНИЕМ: приёма быть НЕ должно",
                            lambda a: "spin_problem" in a.moves),
    }
    for stratum, (title, pred) in checks.items():
        rows_ = [r for r in live if r["stratum"] == stratum]
        if not rows_:
            continue
        want = stratum != "negated_problem"   # у отрицания правильный ответ — «нет»
        any_hit = all_hit = 0
        per_var = [[0, 0] for _ in range(VARIANTS)]
        bad: list[dict] = []
        for r in rows_:
            hits = [pred(an(v)) for v in r["ru"]]
            if any(hits):
                any_hit += 1
            if hits and all(hits):
                all_hit += 1
            for i, h in enumerate(hits[:VARIANTS]):
                per_var[i][1] += 1
                per_var[i][0] += 1 if h else 0
            if (not any(hits)) if want else any(hits):
                bad.append(r)
        n = len(rows_)
        rates = [(a / b) if b else 0.0 for a, b in per_var]
        cocoa_rows[stratum] = {"n": n, "any": any_hit, "all": all_hit,
                               "per_variant": rates, "want": want, "bad": len(bad)}
        print(f"   {stratum:<17} {title}")
        print(f"   {'':<17} n={n}, ожидаем {'СРАБАТЫВАНИЕ' if want else 'МОЛЧАНИЕ'}: "
              f"хотя бы один вариант {pct(any_hit / n)}, все три {pct(all_hit / n)}, "
              f"по вариантам {pct(rates[0])}/{pct(rates[1])}/{pct(rates[2])}")
        print(f"   {'':<17} ПРОВАЛОВ: {len(bad)} из {n}")
        for r in bad[:examples]:
            print(f"   {'':<19} EN {r['text'][:80]!r}")
            for v in r["ru"]:
                print(f"   {'':<19}    RU {v[:80]!r} → {an(v).moves}")
        print()

    # --------------------------------------------------------------------
    # 4. Дыры: где английская сработала, а русская молчит на всех вариантах
    # --------------------------------------------------------------------
    print("== 4. ДЫРЫ: EN сработала, RU молчит на ВСЕХ трёх вариантах " + "=" * 18)
    for m in sorted(misses, key=lambda k: -len(misses[k])):
        rows_ = misses[m]
        if not rows_:
            continue
        n = transfer[m]["en_n"]
        print(f"-- {m}: {len(rows_)} из {n} " + "-" * 40)
        for r in rows_[:examples]:
            tr = ", ".join(triggers(r["text"], m))
            print(f"     EN [{tr}] {r['text'][:88]!r}")
            for v in r["ru"]:
                print(f"        RU {v[:88]!r}")
        print()

    print("== 5. RU-ЛИШНИЕ: русская сработала там, где английская молчала " + "=" * 14)
    print("   Не обязательно ошибка: половины НЕ обязаны быть переводом друг друга,")
    print("   и русская местами богаче. Но каждая такая пара — расхождение рецепта,")
    print("   то есть ровно то, что ловит tools/bilingual_audit.py.")
    for m in sorted(extras, key=lambda k: -len(extras[k]))[:6]:
        rows_ = extras[m]
        print(f"-- {m}: {len(rows_)} " + "-" * 50)
        for r in rows_[:max(2, examples // 2)]:
            print(f"     EN {r['text'][:88]!r} → {an(r['text']).moves}")
            for v in r["ru"]:
                if m in an(v).moves:
                    print(f"        RU [{', '.join(triggers(v, m))}] {v[:80]!r}")
    print()

    print("== 6. ЧЕГО ЭТО НЕ ДОКАЗЫВАЕТ " + "=" * 48)
    for line in (
        "Что русская половина работает на живой русской речи. Проверен ПЕРЕВОД,",
        "  сделанный моделью, и он чище и «книжнее» любого игрока.",
        "Что число выше — оценка полноты. Это ВЕРХНЯЯ граница: переводчик и словарь",
        "  писаны в одном регистре, и совпадение частично тавтологично.",
        "Что домен наш. В CaSiNo нет цен, на Craigslist нет SPIN, BATNA и критериев —",
        "  половина приёмов продукта в выборке не встречается вовсе.",
        "Что русская половина не беднее английской ТАМ, ГДЕ ИХ СРАВНИВАЛИ: сравнение",
        "  идёт только на приёмах, которые английская нашла в чужом корпусе.",
    ):
        print("   · " + line if not line.startswith("  ") else "     " + line.strip())
    print()

    if dump:
        Path(dump).write_text(json.dumps({
            "seed": SEED, "sample": len(sample), "translated": len(live),
            "strata": {f"{s}/{k}": v for (s, k), v in by.items()},
            "transfer": transfer, "casino_vs_experts": casino_rows,
            "cocoa_fixed_today": cocoa_rows,
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"числа: {dump}")
    return 0


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--casino", default=os.environ.get("NEGO_CASINO_DIR", "/tmp/casino-data"))
    ap.add_argument("--cocoa", default=os.environ.get("NEGO_COCOA_DIR", "/tmp/cocoa-data"))
    ap.add_argument("--cache", default=os.environ.get("NEGO_RU_TRANSFER_DIR", "/tmp/ru-transfer-data"))
    ap.add_argument("--plan", action="store_true", help="состав выборки, НОЛЬ вызовов")
    ap.add_argument("--translate", action="store_true", help="ПЛАТНО: перевести и записать кэш")
    ap.add_argument("--parallel", type=int, default=8)
    ap.add_argument("--examples", type=int, default=6)
    ap.add_argument("--json", metavar="FILE")
    args = ap.parse_args()

    cache = Path(args.cache) / CACHE_FILE

    if args.plan or args.translate:
        sample = build_sample(Path(args.casino), Path(args.cocoa))
        if args.plan:
            by = Counter((r["source"], r["stratum"]) for r in sample)
            print(f"выборка: {len(sample)} реплик, seed {SEED}, "
                  f"{VARIANTS} варианта перевода на каждую → {len(sample)} вызовов")
            for (src, st), n in by.items():
                print(f"   {src:<8} {st:<20} {n:4d}")
            print()
            print("примеры по стратам:")
            shown: set[str] = set()
            for r in sample:
                if r["stratum"] in shown:
                    continue
                shown.add(r["stratum"])
                print(f"   [{r['stratum']}] {r['text'][:90]!r}")
            return 0

        # Кэш дописывается, а не переписывается: перевод стоит денег, и повтор
        # уже оплаченной реплики — это оплата второй раз за тот же ответ.
        # Заодно это единственный способ дотянуть те несколько реплик, на
        # которых модель вернула не-JSON: они добираются повтором, а не
        # вычёркиванием из выборки.
        if cache.exists():
            known = {r["text"]: r.get("ru") or [] for r in
                     json.loads(cache.read_text(encoding="utf-8"))}
            for row in sample:
                if known.get(row["text"]):
                    row["ru"] = known[row["text"]]
            todo = [r for r in sample if not r.get("ru")]
            print(f"кэш есть: {len(sample) - len(todo)} уже переведено, "
                  f"платных вызовов будет {len(todo)}")
        else:
            todo = sample

        _load_dotenv()
        from app.providers.openrouter import chat
        if not chat.available():
            print("ИИ недоступен: нет ключа в окружении или NEGO_AI=off.\n"
                  "Ключ берётся из services/gateway/.env.", file=sys.stderr)
            return 2
        print(f"перевод {len(todo)} реплик, по {VARIANTS} варианта, "
              f"параллельно {args.parallel} …", flush=True)
        if todo:
            asyncio.run(translate_all(todo, args.parallel))
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(sample, ensure_ascii=False, indent=1), encoding="utf-8")
        ok = sum(1 for r in sample if r.get("ru"))
        print(f"вызовов: {CALLS}; разобрано переводов: {ok}/{len(sample)}")
        print(f"кэш: {cache}")
        return 0

    if not cache.exists():
        sys.exit(HOWTO.format(path=cache, n=sum(CASINO_STRATA.values()) + sum(COCOA_STRATA.values())))
    sample = json.loads(cache.read_text(encoding="utf-8"))
    return report(sample, args.examples, args.json)


if __name__ == "__main__":
    raise SystemExit(main())
