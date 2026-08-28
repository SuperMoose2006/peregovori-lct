#!/usr/bin/env python
"""gen_game_scores.py — счёт эталонных партий, посчитанный движком-источником.

ЗАЧЕМ. Инвариант 8 до сих пор проверялся на уровне ОДНОЙ реплики: фикстура
классификатора сверяла `analyze` в Python и в TS. Но партия — это не реплика:
уступка, откат, анти-гейминг и закрытие живут в `apply_move`, и разъехаться они
могли молча, оставив классификатор синхронным.

Здесь Python прогоняет партии из `games.json` целиком и записывает итог.
`frontend/test/games.test.ts` требует от браузерного зеркала ТЕ ЖЕ числа —
до балла и до строки сделки. Разошлось — сборка падает.

    python tools/gen_game_scores.py          # переписать фикстуру
    python tools/gen_game_scores.py --check  # только проверить (код 1, если стало)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import engine  # noqa: E402
from app.engine import analyze  # noqa: E402
from app.engine.format import format_deal  # noqa: E402

FIXTURES = Path(__file__).resolve().parents[3] / "frontend" / "test" / "fixtures"
GAMES = FIXTURES / "games.json"
TARGET = FIXTURES / "games.scores.json"


def _play(scenario_id: str, lines: list[str], lang: str) -> dict:
    sess = engine.create_session(scenario_id, lang)
    for text in lines:
        if sess.state.status != "active":
            break
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text)
        if sess.state.status == "active" and sess.turn >= sess.max_turns:
            sess.state.status = "breakdown"
    d = engine.score_session(sess)
    return {
        "overall": d["overall"],
        "grade": d["grade"],
        "economic": d["economic"],
        "relationship": d["relationship"],
        "technique": d["technique"],
        "deal_text": d["deal_text"],
        "status": d["status"],
        "interests_found": d["interests_found"],
        "offer_opp": sess.state.offer_opp,
        "deal": sess.state.deal,
        "turn": sess.turn,
    }


def render() -> str:
    games = json.loads(GAMES.read_text(encoding="utf-8"))
    principled = {k: v for k, v in games["principled"].items() if k != "note"}
    ladder = games["ladder"]

    def lines_of(game: dict, lang: str) -> list[str]:
        lines = game["lines"]
        if isinstance(lines, str) and lines.startswith("@principled."):
            return principled[lines.split(".", 1)[1]][lang]
        return lines

    out = {
        "source": "engine/engine.py::score_session",
        # Печать цифры сделки. Единицы у клиента короче (« ₽» против «₽/шт») —
        # это осознанное решение вёрстки, поэтому сверяется не строка разбора
        # целиком, а САМА ФУНКЦИЯ печати на одинаковых входах.
        "format": [
            {"value": v, "unit": u,
             "ru": format_deal(v, u, "ru"), "en": format_deal(v, u, "en")}
            for v, u in [(86, "₽/шт"), (91.57, "₽/шт"), (1060, "k ₽"), (99.87, "% аптайм"),
                         (1500000, "₽"), (6.5, "дней сдвига"), (230, "k ₽/мес"), (0.5, "%")]
        ],
        "ladder": {
            gid: _play(ladder["scenario"],
                       lines_of(next(g for g in ladder["games"] if g["id"] == gid), ladder["lang"]),
                       ladder["lang"])
            for gid in ladder["order"]
        },
        # Браузерное зеркало сверяется по русской половине: инвариант 8 — про
        # совпадение ДВУХ РЕАЛИЗАЦИЙ движка, а не двух языков. Английскую
        # половину проверяет бэкенд (test_reference_games.py) на обоих языках.
        "principled": {sid: _play(sid, g["ru"], "ru") for sid, g in sorted(principled.items())},
    }
    return json.dumps(out, ensure_ascii=False, indent=1) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    fresh = render()
    current = TARGET.read_text(encoding="utf-8") if TARGET.is_file() else ""
    if fresh == current:
        print("счёт эталонных партий синхронен")
        return 0
    if args.check:
        print(f"РАСХОЖДЕНИЕ: {TARGET} устарел — запустите tools/gen_game_scores.py")
        return 1
    TARGET.write_text(fresh, encoding="utf-8")
    print(f"обновлено: {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
