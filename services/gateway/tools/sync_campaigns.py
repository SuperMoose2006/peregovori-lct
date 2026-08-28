#!/usr/bin/env python3
"""Перенести кампании из Python-источника в зеркало для браузера.

ПОЧЕМУ ГЕНЕРАТОР, А НЕ РУКИ. `frontend/src/data/campaigns.ts` нёс комментарий
«Kept in sync with backend CAMPAIGNS (same ids/order/text)» — и ничего, кроме
этого комментария, синхронность не держало. Тест сравнивал только длину списка
на своей стороне. Добавленный акт или исправленная опечатка расходились молча,
а расходятся они в самом заметном месте: офлайн-ядро обязано играть ту же игру
(инвариант 8).

Ровно та же схема, что у курса (`sync_course.py`): источник — Python, зеркало
генерируется, `--check` валит сборку на расхождении.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.engine.campaigns import (  # noqa: E402
    CAMPAIGNS, REPUTATION_LINES, _EPILOGUE_BANDS)

OUT = (Path(__file__).resolve().parents[3]
       / "frontend" / "src" / "data" / "campaigns.generated.ts")

HEADER = """// СГЕНЕРИРОВАНО tools/sync_campaigns.py — РУКАМИ НЕ ПРАВИТЬ.
// Источник: services/gateway/app/engine/campaigns.py
//
// Офлайн-ядро обязано играть ту же игру, что сервер (инвариант 8), а «то же»
// начинается с одинакового текста актов. Расхождение валит tests/test_campaign_sync.py.
import type { Lang } from "../types";

type L = Record<Lang, string>;

export interface StageDef {
  scenario_id: string;
  act: L;
  intro: L;
}

export interface CampaignDef {
  id: string;
  icon: string;
  title: L;
  tagline: L;
  stages: StageDef[];
  /** Эпилог по итогу всей кампании: ключ репутации → текст. Оценку не трогает. */
  epilogue: Record<string, L>;
}

/**
 * Пороги полос эпилога. ЕДЕТ ИЗ PYTHON, а не переписан руками: пороги должны
 * совпадать и с `views.reputation_intro`, иначе оппонент в четвёртом акте
 * здоровается «наслышан, вы жёстки», а финал хвалит за отношения.
 */
export const EPILOGUE_BANDS: [number, string][] = """


def render() -> str:
    data = [
        {
            "id": c.id,
            "icon": c.icon,
            "title": c.title,
            "tagline": c.tagline,
            "stages": [
                {"scenario_id": s.scenario_id, "act": s.act, "intro": s.intro}
                for s in c.stages
            ],
            "epilogue": getattr(c, "epilogue", {}) or {},
        }
        for c in CAMPAIGNS
    ]
    bands = json.dumps([[t, k] for t, k in _EPILOGUE_BANDS], ensure_ascii=False)
    lines = json.dumps(REPUTATION_LINES, ensure_ascii=False, indent=2)
    body = json.dumps(data, ensure_ascii=False, indent=2)
    return (HEADER + bands + ";\n\n"
            + "/**\n"
              " * Чем оппонент здоровается, узнав репутацию из прошлых актов.\n"
              " *\n"
              " * Едет из Python вместе с порогами: приветствие в четвёртом акте и финал\n"
              " * обязаны описывать одного человека. Офлайн-ядро без этой таблицы применяло\n"
              " * сдвиг доверия молча — механика работала и была не видна.\n"
              " */\n"
              "export const REPUTATION_LINES: Record<string, Record<Lang, string>> = "
            + lines + ";\n\n"
            + "export const CAMPAIGN_DEFS: CampaignDef[] = " + body + ";\n")


def main() -> int:
    text = render()
    if "--check" in sys.argv:
        if not OUT.exists():
            print(f"зеркало кампаний отсутствует: {OUT}")
            return 1
        if OUT.read_text(encoding="utf-8") != text:
            print("зеркало кампаний отстало от источника — запустите "
                  "python3 services/gateway/tools/sync_campaigns.py")
            return 1
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"написано: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
