"""campaigns.py — narrative "career arc" sequences over existing scenarios.

A campaign (mode B) chains scenarios into a story. Between stages the player's
result carries as REPUTATION: a good performance nudges the next opponent's
starting trust up, a poor one down (applied in main.py — the engine stays the
source of truth; reputation is only an initial condition, never scoring).

Stages reference the same authored scenarios, so no new game logic is needed.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Stage:
    scenario_id: str
    act: dict[str, str]      # short act label, e.g. {"ru": "Акт I · Молодой специалист"}
    intro: dict[str, str]    # narrative setup shown before the stage


@dataclass(frozen=True)
class Campaign:
    id: str
    icon: str
    title: dict[str, str]
    tagline: dict[str, str]
    stages: list[Stage]


CAMPAIGNS: list[Campaign] = [
    Campaign(
        id="career",
        icon="🧗",
        title={"ru": "Восхождение", "en": "The Climb"},
        tagline={
            "ru": "Пройдите путь от junior до фаундера — четыре переговорки, и репутация тянется за вами.",
            "en": "From junior to founder — four negotiations, and your reputation follows you.",
        },
        stages=[
            Stage(
                scenario_id="salary",
                act={"ru": "Акт I · Первый оффер", "en": "Act I · First Offer"},
                intro={
                    "ru": "Вы только вышли на рынок. На столе — оффер. То, как вы проведёте этот разговор, задаст тон всей карьере.",
                    "en": "You are new to the market. An offer is on the table. How you handle this sets the tone for your whole career.",
                },
            ),
            Stage(
                scenario_id="conflict",
                act={"ru": "Акт II · Тимлид", "en": "Act II · Team Lead"},
                intro={
                    "ru": "Пару лет спустя вы ведёте команду. Смежный отдел сорвал сроки и валит вину на вас. Репутация уже работает — на вас или против.",
                    "en": "A couple of years on, you lead a team. A partner team missed a deadline and blames you. Your reputation now works for — or against — you.",
                },
            ),
            Stage(
                scenario_id="supplier",
                act={"ru": "Акт III · Закупки", "en": "Act III · Procurement"},
                intro={
                    "ru": "Вы отвечаете за закупки. Нужно сбить цену у надёжного поставщика, не сжигая отношения.",
                    "en": "You now own procurement. Drive a reliable supplier's price down without burning the relationship.",
                },
            ),
            Stage(
                scenario_id="investor",
                act={"ru": "Акт IV · Фаундер", "en": "Act IV · Founder"},
                intro={
                    "ru": "Финал пути: вы — фаундер за столом с инвестором. Всё, чему вы научились, решится здесь.",
                    "en": "The finale: you are a founder across from an investor. Everything you've learned comes to a head.",
                },
            ),
        ],
    ),
]


def campaign_by_id(cid: str) -> Campaign | None:
    for c in CAMPAIGNS:
        if c.id == cid:
            return c
    return None
