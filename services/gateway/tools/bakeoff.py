#!/usr/bin/env python
"""bakeoff.py — прибор для `docs/model-bakeoff.md`: роль → модели → сравнимые числа.

ЗАЧЕМ ОН ПОЯВИЛСЯ. У чисел бейк-оффа не было прибора. Каталог, которым их
получили, в репозиторий не попал: `git ls-files` его не знает, на диске его нет.
Правило репозитория «числа не правятся руками, разошлись с реальностью — надо
перезамерить» имеет силу ровно потому, что рядом лежит команда, которой мерят
(`tools/bench_latency.py` для задержек, `tools/judge_spread.py` для судьи). У
бейк-оффа такой команды не было, и вся таблица держалась на памяти.

ЧТО МЕРЯЕТСЯ. По одному измерению на роль, и каждое измеряет то, ради чего роль
существует, а не «скорость вообще».

  opponent   Задержка ПЕРВОГО ТОКЕНА на потоковом вызове (человек слышит начало
             реплики, а не её конец) и приговор санитайзера (`app/ai/sanitize.py`)
             всей реплике. Отвергнутая реплика — не «медленнее»: это НЕ РАБОТАЕТ,
             в бою на её месте играет шаблон движка. Поэтому доля прошедших
             санитайзер печатается ПЕРЕД задержкой, а не после.

  judge      Доля валидного JSON с первой попытки, задержка и разброс балла на
             одной и той же реплике. Меряется не заново: режим `turns` уже
             написан в `tools/judge_spread.py`, здесь он вызывается по одной
             модели за раз через `NEGO_MODEL_JUDGE`. Дублировать его значило бы
             завести второй набор эталонных реплик и сравнивать модели по разным
             линейкам.

  reasoning  Доля валидного JSON и задержка на генерации сценария («своя
             сделка»). Медиана НЕ считается по неудачам: модель, не вернувшая ни
             одного валидного JSON, получает строку «НЕ РАБОТАЕТ В ЭТОЙ РОЛИ», а
             не среднее время своих провалов. Живой урок из CLAUDE.md ровно про
             это: 142 с на две попытки и ни одного JSON — не «медленно», а
             «режима нет».

  vision     Задержка наблюдения по одному кадру тем же промптом и той же формой
             запроса, что в `app/perception/vision.py::_look`.

  prices     Цена ролей: живой каталог OpenRouter `/api/v1/models` плюс реальный
             расход токенов, снятый с ответа провайдера (поле `usage`).

КАК ЭТОТ ПРИБОР МОГ БЫ СОВРАТЬ — И ЧТО ЭТОМУ МЕШАЕТ. В этом репозитории приборы
уже трижды мерили сами себя, и каждый раз ошибка ЛЬСТИЛА (разбор — в конце
`docs/latency.md`). Поэтому здесь:

  1. Часы снимаются ПОСЛЕ события, отдельным оператором. Не
     `queue.put((perf_counter(), await ws.recv()))`: кортеж вычисляется слева
     направо, и такая строка датирует событие временем ПРЕДЫДУЩЕГО.

  2. Быстрый отказ не становится хорошим числом. В список задержек попадают
     только УДАВШИЕСЯ вызовы, а рядом с каждой медианой всегда печатается
     `ответов N/K`. Модель, которой нет у провайдера, отвечает 404 за 200 мс —
     без этой пары она выглядела бы рекордсменом. Ноль ответов печатается как
     отказ и медианы не получает вовсе.

  3. Пустой ответ не считается репликой. `sanitize("")` возвращает None, и такой
     ход идёт в брак, а не в «прошло санитайзер». TTFT берётся с первого
     НЕПУСТОГО куска.

  4. Видно, что вызов вообще состоялся. Для потока печатается число чанков, для
     обычного вызова — токены из `usage`. Полностью сломанное измерение даёт
     нули в этих колонках, а не красивую медиану.

  5. Модели сравниваются на ОДНИХ И ТЕХ ЖЕ входах: тот же сценарий, те же
     реплики, тот же порядок, то же число повторов.

  6. Наличие модели в каталоге проверяется ДО замера. «Модели больше нет у
     провайдера» — это результат, и он должен называться так, а не превращаться
     в «не ответила».

ЗАПУСК. Ключ живёт в `services/gateway/.env` и в командную строку не попадает:

    cd services/gateway
    .venv/bin/python tools/bakeoff.py --role prices
    .venv/bin/python tools/bakeoff.py --role opponent --k 3
    .venv/bin/python tools/bakeoff.py --role judge --k 3 --n 3
    .venv/bin/python tools/bakeoff.py --role reasoning --k 3
    .venv/bin/python tools/bakeoff.py --role vision --k 3
    .venv/bin/python tools/bakeoff.py --role all --json > /tmp/bakeoff.json

`--models` перекрывает набор по умолчанию (через запятую). Число живых вызовов
печатается последней строкой — прогон стоит денег, и цена обязана быть видна.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import os
import statistics
import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))   # рядом лежит judge_spread

import httpx  # noqa: E402

from app import engine, views  # noqa: E402
# `app/ai/__init__.py` переэкспортирует ФУНКЦИЮ sanitize под именем
# модуля, поэтому `from app.ai import sanitize` даёт функцию, а не модуль.
from app.ai.sanitize import _BREAK_MARKERS, _FOREIGN_SCRIPT_RE, sanitize  # noqa: E402
from app.ai import scenario_gen as SG  # noqa: E402
from app.ai.prompts import build_prompts  # noqa: E402
from app.perception import vision as V  # noqa: E402
from app.providers.openrouter import chat as orchat  # noqa: E402
from app.providers.routing import _DEFAULTS  # noqa: E402

import judge_spread as JS  # noqa: E402

# --------------------------------------------------------------------------
# Счётчик живых вызовов. Печатается в конце каждого прогона: замер стоит денег,
# и «сколько это стоило» — часть результата, а не примечание.
# --------------------------------------------------------------------------
CALLS = 0


def _tick(n: int = 1) -> None:
    global CALLS
    CALLS += n


# --------------------------------------------------------------------------
# Наборы моделей. Не «все подряд», а те, про которые документ что-то утверждает,
# плюс те, что стоят в коде сегодня. Пять на роль — потолок: прогон платный.
# --------------------------------------------------------------------------
MODELS = {
    "opponent": [
        "google/gemini-3.5-flash-lite",          # дефолт сегодня
        "google/gemini-3.1-flash-lite",
        "mistralai/mistral-nemo",                # победитель ТОГО бейк-оффа
        "qwen/qwen3-30b-a3b-instruct-2507",      # «резерв» из документа
        "inclusionai/ling-3.0-flash",            # наследник исчезнувшей ling-2.6
    ],
    "judge": [
        "google/gemini-3.5-flash-lite",          # дефолт сегодня
        "google/gemini-3.1-flash-lite",
        "mistralai/mistral-nemo",
        "google/gemini-2.5-flash-lite",          # «не различает спам» — проверяем
    ],
    "reasoning": [
        "google/gemini-3.5-flash-lite",          # дефолт сегодня
        "google/gemini-3.1-flash-lite",
        "mistralai/mistral-nemo",
        "z-ai/glm-5.3",                          # «142 с и ни одного JSON» — проверяем
    ],
    "vision": [
        "google/gemini-3.1-flash-lite",          # дефолт сегодня
        "google/gemini-3.5-flash-lite",
        "google/gemini-2.5-flash-lite",
    ],
}

#: Реплики игрока для роли оппонента. Взяты из живого сценария `rent`, по одной
#: с каждой ступени: вопрос об интересах, объективный критерий, размен. Одинаковы
#: для всех моделей — иначе колонки таблицы несравнимы.
OPPONENT_LINES = [
    "Здравствуйте. Скажите, что для вас важнее всего при сдаче этой квартиры?",
    "По рынку такие квартиры идут дешевле — давайте опираться на объективные данные.",
    "Если мы возьмём на себя мелкий ремонт, вы сможете подвинуться по цене?",
]

#: Ситуации для «своей сделки». `dir` известен заранее и проверяется: «кто платит
#: — хочет меньше». Перевёрнутое направление торга делает игру неиграбельной,
#: и это отказ, а не помарка.
GEN_SITUATIONS: list[tuple[str, str]] = [
    ("Я закупщик сети кофеен, торгуюсь с обжарщиком о цене за килограмм зерна.",
     "lower_is_better"),
    ("Я разработчик, обсуждаю с работодателем свою зарплату на новой позиции.",
     "higher_is_better"),
    ("Я снимаю офис и договариваюсь с арендодателем о ставке за квадратный метр.",
     "lower_is_better"),
]

#: Насколько балл объективного критерия обязан оторваться от балла пустышки,
#: чтобы судья считался различающим их. Порог не из воздуха: движок разводит
#: ходы по `arg_quality >= 35`, то есть разница меньше этого шага вообще не
#: меняет игру. Пятнадцать — половина шага, заведомо снисходительно.
SPAM_GAP_MIN = 15

#: Поля, без которых сценарий не собирается. Проверять «json.loads не упал» мало:
#: `{}` — валидный JSON и полностью бесполезный сценарий.
GEN_REQUIRED = ("title", "counterpart_name", "dir", "opponent_open",
                "opponent_reservation", "player_target", "player_reservation",
                "hidden_interests")

#: Кадр берётся из репозитория, а не из веб-камеры: замер про ЗАДЕРЖКУ, а она
#: определяется размером картинки в токенах, а не тем, кто на ней. Размер и
#: качество — те же, что шлёт клиент (`media-provider.ts`: 320 px, q≈0.6).
FRAME_SOURCE = _ROOT.parents[1] / "design" / "immersion" / "karl-idle.png"
FRAME_WIDTH = 320
FRAME_QUALITY = 60

#: Потолок ожидания в замере. Больше боевого (`GEN_BUDGET_S = 22 с`) намеренно:
#: прибор обязан УВИДЕТЬ, что модель отвечает за 40 с, а не записать её в
#: «не ответила». Превышение боевого бюджета печатается отдельной пометкой.
PROBE_TIMEOUT_S = 90.0


def _stats(values: list[float]) -> dict:
    if not values:
        return {}
    return {
        "n": len(values),
        "min": round(min(values)),
        "median": round(statistics.median(values)),
        "max": round(max(values)),
        "spread": round(max(values) - min(values)),
    }


def _med(values: list[float], answered: int, total: int) -> str:
    """Медиана всегда идёт в паре с «ответов N/K».

    Без этой пары быстрый отказ — 404 за двести миллисекунд — выглядит рекордом.
    Ноль ответов медианы не получает вовсе.
    """
    if not values:
        return f"— (ответов {answered}/{total})"
    s = _stats(values)
    return (f"{s['median']:>6} мс [{s['min']}..{s['max']}]  "
            f"(ответов {answered}/{total})")


# --------------------------------------------------------------------------
# Каталог и цены
# --------------------------------------------------------------------------

_CATALOG: dict[str, dict] | None = None


def catalog() -> dict[str, dict]:
    """Живой каталог OpenRouter. Один раз на прогон.

    Нужен ДО замера: «модели больше нет у провайдера» — самостоятельный
    результат, и путать его с «не ответила» нельзя.
    """
    global _CATALOG
    if _CATALOG is None:
        r = httpx.get("https://openrouter.ai/api/v1/models", timeout=30.0)
        r.raise_for_status()
        _CATALOG = {m["id"]: m for m in r.json()["data"]}
    return _CATALOG


def price_of(model: str) -> tuple[float, float] | None:
    """($/M вход, $/M выход) или None, если модели в каталоге нет."""
    m = catalog().get(model)
    if not m:
        return None
    p = m.get("pricing") or {}
    try:
        return round(float(p["prompt"]) * 1e6, 4), round(float(p["completion"]) * 1e6, 4)
    except (KeyError, TypeError, ValueError):
        return None


def _known(models: list[str]) -> tuple[list[str], list[str]]:
    """Разделить набор на «есть в каталоге» и «исчезла у провайдера»."""
    cat = catalog()
    return [m for m in models if m in cat], [m for m in models if m not in cat]


# --------------------------------------------------------------------------
# Один вызов с честным расходом токенов
# --------------------------------------------------------------------------

async def _post(payload: dict, timeout: float = PROBE_TIMEOUT_S) -> tuple[str | None, dict, float]:
    """Один нестриминговый вызов: (текст | None, usage, мс).

    Токены берутся из ответа провайдера, а не считаются здесь по символам:
    придуманная цена хуже отсутствующей. Пустой `usage` печатается нулями — и
    это признак, что вызова не было.
    """
    _tick()
    t0 = time.perf_counter()
    try:
        r = await asyncio.wait_for(
            orchat._get_client().post("/chat/completions", json=payload), timeout=timeout)
        # Часы — ПОСЛЕ ожидания, отдельным оператором. См. пункт 1 в шапке.
        elapsed = (time.perf_counter() - t0) * 1000
        r.raise_for_status()
        body = r.json()
        if "choices" not in body:
            # OpenRouter отвечает 200 с телом-ошибкой (429 у апстрима, отказ
            # провайдера). `raise_for_status` такое пропускает, и без этой
            # ветки отказ выглядел бы как `KeyError` без объяснения.
            err = (body.get("error") or {})
            return None, {"error": "200 без choices",
                          "body": str(err.get("message") or body)[:200]}, \
                (time.perf_counter() - t0) * 1000
        choice = body["choices"][0]
        text = (choice["message"].get("content") or "").strip()
        usage = dict(body.get("usage") or {})
        # Почему ответ пуст, видно только здесь. `finish_reason == "length"` при
        # нулевом видимом тексте и ненулевых reasoning-токенах — это не «модель
        # молчит», а «лимит токенов ушёл в рассуждение». Ровно этот отказ
        # документ приписывал gpt-5-nano и gpt-oss-20b.
        usage["_finish"] = choice.get("finish_reason")
        usage["_reasoning"] = ((usage.get("completion_tokens_details") or {})
                               .get("reasoning_tokens"))
    except httpx.HTTPStatusError as exc:           # noqa: BLE001 — отказ это результат
        elapsed = (time.perf_counter() - t0) * 1000
        # Код и первые строки тела — единственное, что отличает «модель у
        # провайдера сломана» от «мы неправильно спросили». Без них отказ
        # выглядит одинаково во всех случаях, и чинить нечего.
        body = (exc.response.text or "")[:200].replace("\n", " ")
        return None, {"error": f"HTTP {exc.response.status_code}", "body": body}, elapsed
    except Exception as exc:                       # noqa: BLE001
        elapsed = (time.perf_counter() - t0) * 1000
        return None, {"error": type(exc).__name__, "body": str(exc)[:200]}, elapsed
    return text or None, usage, elapsed


def _usage_line(usage: dict, model: str) -> str:
    """Токены вызова и его цена по живому каталогу."""
    pin = usage.get("prompt_tokens")
    pout = usage.get("completion_tokens")
    if pin is None or pout is None:
        why = usage.get("error")
        if why:
            return f"вызов не прошёл: {why} {usage.get('body', '')}".strip()
        return "usage не пришёл — цена вызова не считается"
    extra = ""
    if usage.get("_reasoning"):
        # Токены, за которые платят и которых человек не видит.
        extra = f" (из них {usage['_reasoning']} т. рассуждения)"
    if usage.get("_finish") == "length" and not usage.get("_reasoning") is None and pout:
        extra += f", finish_reason=length"
    # Цену считает сам провайдер и присылает её в `usage.cost` — это факт, а не
    # наша арифметика по каталогу. Каталог остаётся запасным путём.
    cost = usage.get("cost")
    source = "по счёту провайдера"
    if cost is None:
        pr = price_of(model)
        if pr is None:
            return f"вход {pin} т., выход {pout} т.{extra}; цены в каталоге нет"
        cost = (pin * pr[0] + pout * pr[1]) / 1e6
        source = "по каталогу"
    return (f"вход {pin} т., выход {pout} т.{extra}  →  ${cost:.6f} за вызов "
            f"(${cost * 1000:.3f} за 1000, {source})")


# --------------------------------------------------------------------------
# Роль opponent
# --------------------------------------------------------------------------

def _opponent_facts(scenario_id: str, lang: str) -> dict:
    """Факты боевого хода: настоящий движок, настоящий сценарий.

    Промпт собирается той же `build_prompts`, что в бою. Синтетический словарь
    мерил бы промпт, которого в продукте нет.
    """
    sess = engine.create_session(scenario_id, lang)
    sess.turn += 1
    text = OPPONENT_LINES[0]
    result = engine.apply_move(sess, engine.analyze(text), text)
    facts = views.build_facts(sess, result)
    facts["fallback"] = engine.render_line(sess, result.reaction, result.closed)
    return facts


def _reject_reason(raw: str) -> str:
    """Почему санитайзер отверг реплику. Три причины из его шапки — врозь.

    «Не прошла» без причины не даёт решения: чужой алфавит лечится другой
    моделью, а выход из роли — другим промптом.
    """
    low = raw.lower()
    if _FOREIGN_SCRIPT_RE.search(raw):
        return "чужой алфавит"
    if any(mk in low for mk in _BREAK_MARKERS):
        return "выход из роли"
    if not raw.strip():
        return "пустой ответ"
    return "пусто после чистки markdown"


async def role_opponent(models: list[str], k: int, scenario: str, lang: str,
                        repeat: int = 1) -> dict:
    facts = _opponent_facts(scenario, lang)
    # Сеть шумит сильнее модели: на одной реплике медиана TTFT у одной и той же
    # модели гуляла втрое между прогонами. Поэтому каждая реплика меряется
    # `repeat` раз, и в таблицу идёт медиана по ВСЕМ замерам с разбросом рядом.
    lines = OPPONENT_LINES[:k] * max(1, repeat)
    alive, gone = _known(models)
    out: dict = {"role": "opponent", "scenario": scenario, "lang": lang,
                 "lines": len(lines), "repeat": repeat, "missing": gone, "rows": []}

    for model in gone:
        print(f"  {model:<38} ИСЧЕЗЛА У ПРОВАЙДЕРА (нет в /api/v1/models)")

    for model in alive:
        ttfts: list[float] = []
        totals: list[float] = []
        chunks_total = 0
        clean_ok = 0
        rejects: list[str] = []
        markdown_fixed = 0
        answered = 0

        for line in lines:
            turn_facts = {**facts, "player_text": line}
            system, user = build_prompts(turn_facts)
            _tick()
            t0 = time.perf_counter()
            ttft: float | None = None
            pieces: list[str] = []
            async for chunk in orchat.stream(system, user, role="opponent", model=model,
                                             max_tokens=220, temperature=0.8):
                # Часы — ПОСЛЕ прихода куска, отдельным оператором.
                now = time.perf_counter()
                chunks_total += 1
                # Первый токен — первый НЕПУСТОЙ. Провайдеры открывают поток
                # пустой дельтой роли; засчитать её значило бы измерить
                # рукопожатие и назвать это скоростью модели.
                if ttft is None and chunk.strip():
                    ttft = (now - t0) * 1000
                pieces.append(chunk)
            total = (time.perf_counter() - t0) * 1000

            raw = "".join(pieces)
            if ttft is None:
                continue                       # ни одного токена — это не задержка
            answered += 1
            ttfts.append(ttft)
            totals.append(total)
            clean = sanitize(raw)
            if clean:
                clean_ok += 1
                if clean != raw.strip().strip('"«»').strip():
                    markdown_fixed += 1
            else:
                rejects.append(_reject_reason(raw))

        # Отдельная проба на цену: поток не приносит `usage`, а выдумывать
        # токены по символам — это придуманная цена.
        payload = {"model": model,
                   "messages": [{"role": "system", "content": build_prompts(facts)[0]},
                                {"role": "user", "content": build_prompts(facts)[1]}],
                   "max_tokens": 220, "temperature": 0.8}
        _text, usage, _ms = await _post(payload)

        row = {"model": model, "answered": answered, "of": len(lines),
               "sanitized_ok": clean_ok, "rejects": rejects,
               "markdown_fixed": markdown_fixed, "chunks": chunks_total,
               "ttft_ms": _stats(ttfts), "total_ms": _stats(totals),
               "usage": usage, "price_per_m": price_of(model)}
        out["rows"].append(row)

        verdict = ("НЕ ОТВЕТИЛА" if answered == 0
                   else f"санитайзер прошли {clean_ok}/{answered}")
        print(f"  {model:<38} {verdict}")
        print(f"      TTFT   {_med(ttfts, answered, len(lines))}   чанков {chunks_total}")
        print(f"      целиком{_med(totals, answered, len(lines))}")
        if answered < len(lines):
            # Пустой поток — это не «пропущенное измерение». В бою на месте
            # такого хода играет шаблонная реплика движка, то есть модель молча
            # выпала из игры. Считать это надо как отказ, а не как «нет данных».
            print(f"      пустой поток: {len(lines) - answered}/{len(lines)} ходов — "
                  f"в бою на их месте играет шаблон движка")
        if rejects:
            print(f"      брак: {', '.join(rejects)}")
        if markdown_fixed:
            print(f"      markdown чинился санитайзером: {markdown_fixed}")
        print(f"      цена: {_usage_line(usage, model)}")
    return out


# --------------------------------------------------------------------------
# Роль judge — через существующий прибор, а не заново
# --------------------------------------------------------------------------

async def role_judge(models: list[str], k: int, n: int, scenario: str, lang: str,
                     temperature: float) -> dict:
    alive, gone = _known(models)
    out: dict = {"role": "judge", "scenario": scenario, "lang": lang,
                 "k": k, "n": n, "temperature": temperature,
                 "missing": gone, "rows": []}

    for model in gone:
        print(f"  {model:<38} ИСЧЕЗЛА У ПРОВАЙДЕРА (нет в /api/v1/models)")

    saved = os.environ.get("NEGO_MODEL_JUDGE")
    try:
        for model in alive:
            os.environ["NEGO_MODEL_JUDGE"] = model
            JS.LATENCIES.clear()
            print(f"  {model}")
            res = await JS.mode_turns(scenario, lang, k, n, [temperature])
            lat = [v * 1000 for v in JS.LATENCIES]
            _tick(len(JS.LATENCIES))

            rows = res["rows"]
            total = len(rows) * k
            answered = sum(r["answered"] for r in rows)
            # Разброс балла на ОДНОЙ И ТОЙ ЖЕ реплике — худший по набору, а не
            # средний: пороги движка (35 и 55) пересекает худшая реплика, а не
            # средняя.
            spreads = [r["score"]["spread"] for r in rows if r["score"]]
            crossings = [r["source"] for r in rows if r["crosses_35"] or r["crosses_55"]]
            # «Различает ли спам от сути» — то самое, что документ вменял
            # gemini-2.5-flash-lite. Считаем разницу медиан пассивной реплики и
            # реплики с объективным критерием.
            med = {r["source"]: (r["score"]["median"] if r["score"] else None) for r in rows}
            gap = (None if med.get("passive") is None or med.get("alternating") is None
                   else med["alternating"] - med["passive"])

            row = {"model": model, "valid_json": answered, "of": total,
                   "latency_ms": _stats(lat),
                   "worst_spread": max(spreads) if spreads else None,
                   "crosses_thresholds": crossings,
                   "medians": med, "spam_gap": gap,
                   "price_per_m": price_of(model)}

            # Цена: одна проба тем же промптом, чтобы взять настоящий `usage`.
            ctx, interests, secondary = JS._session_context(scenario, lang)
            system, user = JS.build_prompts(ctx, JS.TURN_LINES[0][1], lang,
                                            interests, secondary)
            _t, usage, _ms = await _post({"model": model,
                                          "messages": [{"role": "system", "content": system},
                                                       {"role": "user", "content": user}],
                                          "max_tokens": 300, "temperature": temperature})
            row["usage"] = usage
            out["rows"].append(row)

            print(f"      валидный JSON {answered}/{total}   "
                  f"задержка {_med(lat, answered, total)}")
            print(f"      худший разброс балла: "
                  f"{row['worst_spread'] if row['worst_spread'] is not None else '—'}"
                  + (f"   ПЕРЕСЕКАЕТ ПОРОГ: {', '.join(crossings)}" if crossings else ""))
            print(f"      спам vs объективный критерий: "
                  + ("не измерен" if gap is None else
                     f"{med['passive']:.0f} против {med['alternating']:.0f} "
                     f"(разница {gap:.0f})"
                     + ("   ← НЕ РАЗЛИЧАЕТ" if gap < SPAM_GAP_MIN else "")))
            print(f"      цена: {_usage_line(usage, model)}")
    finally:
        if saved is None:
            os.environ.pop("NEGO_MODEL_JUDGE", None)
        else:
            os.environ["NEGO_MODEL_JUDGE"] = saved
    return out


# --------------------------------------------------------------------------
# Роль reasoning
# --------------------------------------------------------------------------

def _gen_valid(raw: str | None, expect_dir: str) -> tuple[bool, str]:
    """Валиден ли сгенерированный сценарий. Не «json.loads не упал».

    `{}` — валидный JSON и полностью непригодный сценарий; перевёрнутый `dir`
    даёт игру, в которой игрок торгуется против себя.
    """
    if not raw:
        return False, "нет ответа"
    d = SG._extract_json(raw)
    if not d:
        return False, "JSON не извлечён"
    missing = [f for f in GEN_REQUIRED if d.get(f) in (None, "", [])]
    if missing:
        return False, "нет полей: " + ", ".join(missing)
    got = str(d.get("dir"))
    if got not in ("lower_is_better", "higher_is_better"):
        return False, f"dir={got!r} — не из словаря"
    if got != expect_dir:
        return False, f"dir перевёрнут ({got}, ожидался {expect_dir})"
    return True, "ок"


async def role_reasoning(models: list[str], k: int, lang: str) -> dict:
    situations = GEN_SITUATIONS[:k]
    alive, gone = _known(models)
    out: dict = {"role": "reasoning", "lang": lang, "situations": len(situations),
                 "budget_s": SG.GEN_BUDGET_S, "missing": gone, "rows": []}

    for model in gone:
        print(f"  {model:<38} ИСЧЕЗЛА У ПРОВАЙДЕРА (нет в /api/v1/models)")

    system = SG._sys_prompt(lang)
    for model in alive:
        oks: list[float] = []
        attempts: list[dict] = []
        usage_seen: dict = {}
        over_budget = 0

        for situation, expect_dir in situations:
            text, usage, ms = await _post({"model": model,
                                           "messages": [{"role": "system", "content": system},
                                                        {"role": "user", "content": situation}],
                                           "max_tokens": 1400, "temperature": 0.7})
            ok, why = _gen_valid(text, expect_dir)
            if ok:
                oks.append(ms)
                usage_seen = usage or usage_seen
            if ms > SG.GEN_BUDGET_S * 1000:
                over_budget += 1
            attempts.append({"ms": round(ms), "valid": ok, "why": why,
                             "over_budget": ms > SG.GEN_BUDGET_S * 1000})

        row = {"model": model, "valid": len(oks), "of": len(situations),
               "ms_valid_only": _stats(oks),
               "all_ms": [a["ms"] for a in attempts],
               "attempts": attempts, "over_budget": over_budget,
               "usage": usage_seen, "price_per_m": price_of(model)}
        out["rows"].append(row)

        if not oks:
            # Ключевая строка прибора. Модель без единого валидного JSON не
            # получает медианы: усреднить её провалы значило бы сказать
            # «медленная» там, где верно «режима нет».
            print(f"  {model:<38} НЕ РАБОТАЕТ В ЭТОЙ РОЛИ: валидного JSON 0/{len(situations)}")
        else:
            print(f"  {model:<38} валидный JSON {len(oks)}/{len(situations)}")
        print(f"      задержка (только валидные) {_med(oks, len(oks), len(situations))}")
        print(f"      все попытки, мс: {[a['ms'] for a in attempts]}")
        for a in attempts:
            if not a["valid"]:
                print(f"      · провал за {a['ms']} мс — {a['why']}")
        if over_budget:
            print(f"      ПРЕВЫСИЛА БОЕВОЙ БЮДЖЕТ ГЕНЕРАЦИИ ({SG.GEN_BUDGET_S:.0f} с): "
                  f"{over_budget}/{len(situations)} — в бою это «не удалось сгенерировать»")
        print(f"      цена: {_usage_line(usage_seen, model)}")
    return out


# --------------------------------------------------------------------------
# Роль vision
# --------------------------------------------------------------------------

def frame_b64() -> str:
    """Кадр того же размера и качества, что шлёт клиент."""
    from PIL import Image

    img = Image.open(FRAME_SOURCE).convert("RGB")
    h = max(1, round(img.height * FRAME_WIDTH / img.width))
    img = img.resize((FRAME_WIDTH, h))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=FRAME_QUALITY)
    return base64.b64encode(buf.getvalue()).decode("ascii")


async def role_vision(models: list[str], k: int, lang: str) -> dict:
    b64 = frame_b64()
    alive, gone = _known(models)
    out: dict = {"role": "vision", "lang": lang, "looks": k,
                 "frame_b64_chars": len(b64), "frame_source": str(FRAME_SOURCE),
                 "missing": gone, "rows": []}

    for model in gone:
        print(f"  {model:<38} ИСЧЕЗЛА У ПРОВАЙДЕРА (нет в /api/v1/models)")

    print(f"  кадр: {FRAME_SOURCE.name}, {FRAME_WIDTH} px, q{FRAME_QUALITY}, "
          f"{len(b64)} знаков base64")
    for model in alive:
        lat: list[float] = []
        answers: list[str] = []
        usage_seen: dict = {}
        for _ in range(k):
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": V._SYSTEM.get(lang, V._SYSTEM["ru"])},
                    {"role": "user", "content": [
                        {"type": "text",
                         "text": "Что видно?" if lang == "ru" else "What is visible?"},
                        {"type": "image_url",
                         "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                    ]},
                ],
                "max_tokens": 80, "temperature": 0.2,
            }
            text, usage, ms = await _post(payload, timeout=V._LOOK_TIMEOUT_S)
            if text:
                lat.append(ms)
                answers.append(text.replace("\n", " ")[:70])
                usage_seen = usage or usage_seen

        row = {"model": model, "answered": len(lat), "of": k, "ms": _stats(lat),
               "samples": answers[:2], "usage": usage_seen,
               "price_per_m": price_of(model)}
        out["rows"].append(row)
        print(f"  {model:<38} наблюдение {_med(lat, len(lat), k)}")
        for a in answers[:1]:
            print(f"      «{a}»")
        print(f"      цена: {_usage_line(usage_seen, model)}")
    return out


# --------------------------------------------------------------------------
# Цены
# --------------------------------------------------------------------------

def role_prices(models: list[str]) -> dict:
    rows = []
    print(f"  {'модель':<38} {'вход $/M':>10} {'выход $/M':>11}   роли по умолчанию")
    # Одна модель стоит на нескольких ролях сразу — словарь «модель → роль»
    # потерял бы две из трёх. Профиль сегодня именно такой.
    reverse: dict[str, list[str]] = {}
    for r, m in _DEFAULTS.items():
        reverse.setdefault(m, []).append(r)
    for model in models:
        pr = price_of(model)
        role = ", ".join(reverse.get(model, []))
        if pr is None:
            print(f"  {model:<38} {'—':>10} {'—':>11}   ИСЧЕЗЛА У ПРОВАЙДЕРА")
            rows.append({"model": model, "present": False})
            continue
        print(f"  {model:<38} {pr[0]:>10.4f} {pr[1]:>11.4f}   {role}")
        rows.append({"model": model, "present": True, "in": pr[0], "out": pr[1],
                     "default_role": role})
    return {"role": "prices", "rows": rows}


# --------------------------------------------------------------------------

def main() -> int:
    JS._load_dotenv()                       # секрет из .env, не из командной строки
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--role", default="all",
                    choices=("all", "opponent", "judge", "reasoning", "vision", "prices"))
    ap.add_argument("--models", default="", help="через запятую; перекрывает набор роли")
    ap.add_argument("--k", type=int, default=3,
                    help="реплик/ситуаций/взглядов на модель (judge: повторов на реплику)")
    ap.add_argument("--n", type=int, default=3, help="реплик судье")
    ap.add_argument("--repeat", type=int, default=1,
                    help="повторов каждой реплики/взгляда: сеть шумит сильнее модели")
    ap.add_argument("--scenario", default="supplier")
    ap.add_argument("--lang", default="ru")
    ap.add_argument("--temperature", type=float, default=0.0,
                    help="температура судьи (в бою 0, см. docs/judge-reproducibility.md)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if not orchat.available():
        print("Нет ключа или NEGO_AI=off — живой замер невозможен. "
              "Ключ берётся из services/gateway/.env.", file=sys.stderr)
        return 2

    picked = [m.strip() for m in args.models.split(",") if m.strip()]
    roles = (["opponent", "judge", "reasoning", "vision"] if args.role == "all"
             else [args.role])

    async def run() -> list[dict]:
        results: list[dict] = []
        try:
            for role in roles:
                # Для цен набор шире: туда обязаны попасть ВСЕ дефолты кода,
                # включая роль asr, которую живым вызовом здесь не мерят.
                models = picked or MODELS.get(role) or sorted(
                    set(sum(MODELS.values(), [])) | set(_DEFAULTS.values()))
                print(f"\n=== {role} ===")
                if role == "prices":
                    results.append(role_prices(models))
                elif role == "opponent":
                    results.append(await role_opponent(models, args.k, args.scenario,
                                                      args.lang, args.repeat))
                elif role == "judge":
                    results.append(await role_judge(models, args.k, args.n, args.scenario,
                                                    args.lang, args.temperature))
                elif role == "reasoning":
                    results.append(await role_reasoning(models, args.k, args.lang))
                elif role == "vision":
                    results.append(await role_vision(models, args.k, args.lang))
        finally:
            await orchat.aclose()
        return results

    started = time.perf_counter()
    results = asyncio.run(run())
    print(f"\nживых вызовов: {CALLS}   всего времени: "
          f"{time.perf_counter() - started:.0f} с")
    if args.json:
        print(json.dumps({"calls": CALLS, "results": results},
                         ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
