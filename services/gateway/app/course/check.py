"""check.py — детерминированные проверки упражнений.

ПОЧЕМУ БЕЗ ИИ. Зачёт обязан работать офлайн: это тот же инвариант, что «без сети
продукт полностью играбелен». Судья (`NEGO_JUDGE`) может добавить КОММЕНТАРИЙ к
свободному ответу, но никогда не решает, зачтено ли упражнение. Поэтому здесь
только чистые функции над `analyze()` и над состоянием партии.

ЧЕСТНОЕ ОГРАНИЧЕНИЕ. Предикат `freeform` ловит ФОРМУ, а не смысл: реплика с
«если … то» пройдёт как размен, даже если разменивается ерунда. Смягчается
порогами (`min_words`, `min_arg`), запретами (`forbid_moves`) и требованием
попасть во вторичный вопрос (`require_secondary`). Для тренажёра этого
достаточно, и это прозрачно — в отличие от «оценил ИИ, а почему — неизвестно».

Зеркало на TypeScript: `frontend/src/lib/course.ts`. Менять синхронно.
"""

from __future__ import annotations

from app.engine.engine import _match_secondary_issues
from app.engine.scenarios import by_id
from app.engine.techniques import Analysis, analyze, norm

OPS = {
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
    ">=": lambda a, b: a >= b,
    "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b,
    "<": lambda a, b: a < b,
}


def check_choice(item: dict, picked: int) -> bool:
    return picked == item["answer"]


def check_order(item: dict, order: list[str]) -> bool:
    return list(order) == list(item["answer"])


def order_hits(item: dict, order: list[str]) -> int:
    """Сколько элементов на своих местах. Для подсветки, НЕ для зачёта."""
    answer = item["answer"]
    return sum(1 for i, x in enumerate(order[: len(answer)]) if x == answer[i])


def check_match(item: dict, pairs: dict[str, str]) -> bool:
    return dict(pairs) == dict(item["answer"])


def check_numeric(item: dict, value: float | None, expected: float | None = None) -> bool:
    if value is None:
        return False
    target = item["answer"]["value"] if expected is None else expected
    return abs(float(value) - float(target)) <= float(item["answer"].get("tolerance", 0)) + 1e-9


def check_pick(item: dict, picked: str) -> bool:
    """`reaction` и `meters`: сверка строкового ответа."""
    return picked == item["answer"]


def check_freeform(item: dict, text: str, lang: str = "ru",
                   analysis: Analysis | None = None) -> dict:
    """Зачёт свободного ответа + причины отказа (их показывает разбор упражнения).

    Причины — закрытый словарь ключей, а не свободный текст: они переводятся в
    i18n и одинаковы на обеих сторонах.
    """
    spec = item.get("check", {})
    a = analysis or analyze(text)
    reasons: list[str] = []

    for move in spec.get("require_moves", []):
        if move not in a.moves:
            reasons.append(f"missing:{move}")
    require_any = spec.get("require_any", [])
    if require_any and not any(m in a.moves for m in require_any):
        reasons.append("missing_any:" + "|".join(require_any))
    for move in spec.get("forbid_moves", []):
        if move in a.moves:
            reasons.append(f"forbidden:{move}")
    if a.words < int(spec.get("min_words", 0)):
        reasons.append("too_short")
    if a.arg_quality < int(spec.get("min_arg", 0)):
        reasons.append("weak_argument")
    if spec.get("require_number") and a.number is None:
        reasons.append("no_number")

    secondary = spec.get("require_secondary")
    if secondary:
        # `judge=None` — а не пустой контейнер: непустой judge для движка значит
        # «смысл уже прочитан моделью», и ключевые слова тогда не смотрятся вовсе.
        # Курс судит офлайн, поэтому здесь всегда ключевые слова. Возвращаются
        # САМИ SecondaryIssue, не их индексы.
        sc = by_id(item["scenario_id"])
        hits = _match_secondary_issues(sc, norm(text), lang, None)
        if secondary not in [iss.id for iss in hits]:
            reasons.append(f"missing_term:{secondary}")

    return {"ok": not reasons, "reasons": reasons, "moves": list(a.moves),
            "arg_quality": a.arg_quality}


def check_drill(item: dict, view: dict) -> dict:
    """Капстоун: предикат над состоянием партии.

    Поля берутся ТОЛЬКО из публичного состояния движка. Ни один сигнал слоёв
    (голос, камера, зрение) сюда не входит — тот же инвариант, что и у оценки.
    """
    failed = []
    # Лимит ходов — часть задания: сделка на двенадцатом ходу там, где просили
    # шесть, условия не выполняет. Зеркало: lib/course.ts::checkDrill.
    if item.get("max_turns") and view.get("turn", 0) > item["max_turns"]:
        failed.append("max_turns")
    for cond in item["pass"]:
        actual = view.get(cond["field"])
        if actual is None or not OPS[cond["op"]](actual, cond["value"]):
            failed.append(cond["field"])
    return {"ok": not failed, "failed": failed}
