"""Administrator context → a playable, deterministic scenario on the existing engine.

No model or separate scoring path: domain selects a tested scenario, difficulty
and style use existing engine inputs, and priorities change the bargaining floor
and the value of two explicit concessions. Preview uses the player-safe adapter.
"""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import replace
import hashlib
import json
import time
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictInt, ValidationError, field_validator

from app import views
from app.engine.difficulty import difficulty_name, normalize_difficulty
from app.engine.scenarios import (
    SCENARIOS, SecondaryIssue, Scenario, RuntimeRegistryFull, register_runtime_scenario,
)

Domain = Literal['procurement', 'career', 'property', 'investment', 'team', 'freelance']
Tone = Literal['collaborative', 'analytical', 'firm']
Goal = Literal['price', 'timing', 'certainty']


class AdminContext(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    domain: Domain
    topic: str = Field(min_length=3, max_length=120)
    difficulty: StrictInt = Field(ge=1, le=5)
    tone: Tone
    opponentRole: str = Field(min_length=2, max_length=80)
    opponentGoals: list[Goal] = Field(min_length=1, max_length=3)
    lang: Literal['ru', 'en'] = 'ru'

    @field_validator('difficulty')
    @classmethod
    def migrate_difficulty(cls, value: int) -> int:
        return normalize_difficulty(value)

    @field_validator('topic', 'opponentRole')
    @classmethod
    def no_controls(cls, value: str) -> str:
        if any(ord(c) < 32 or ord(c) == 127 for c in value):
            raise ValueError('control characters are not allowed')
        return value

    @field_validator('opponentGoals')
    @classmethod
    def unique_goals(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError('choose each priority once')
        return sorted(value)


_BASE = {'procurement': 'supplier', 'career': 'salary', 'property': 'rent',
         'investment': 'investor', 'team': 'conflict', 'freelance': 'freelance_rate'}
_STYLE = {'collaborative': 'relationship', 'analytical': 'analytical', 'firm': 'tough'}
_TONE_TEXT = {
    'collaborative': {'ru': 'Настроен на сотрудничество, ценит доверие и внимательное слушание.',
                      'en': 'Cooperative, values trust and attentive listening.'},
    'analytical': {'ru': 'Аналитичен: особенно внимательно относится к объективным критериям.',
                   'en': 'Analytical: pays particular attention to objective criteria.'},
    'firm': {'ru': 'Требователен, держит позицию и жёстче реагирует на давление.',
             'en': 'Firm, holds their position and reacts more strongly to pressure.'},
}
# Priorities are visible objectives, not the counterpart's three private reasons.
_GOALS = {'price': {'ru': 'защитить цену', 'en': 'protect the price'},
          'timing': {'ru': 'согласовать сроки', 'en': 'agree on timing'},
          'certainty': {'ru': 'получить гарантии', 'en': 'secure certainty'}}


def build_scenario(context: AdminContext) -> tuple[Scenario, Scenario]:
    base = next(s for s in SCENARIOS if s.id == _BASE[context.domain])
    canonical = context.model_dump(exclude={'lang'})
    signature = hashlib.sha256(json.dumps(canonical, sort_keys=True,
                                          ensure_ascii=False).encode()).hexdigest()[:24]
    goals = set(context.opponentGoals)
    # Preserve direction and reachability. Price-focused opponents leave a
    # smaller margin beyond the player's target, making concessions dearer.
    span = abs(base.opponent_open - base.player_target)
    reserve_fraction = 0.04 if 'price' in goals else 0.18
    beyond = max(0.01, span * reserve_fraction)
    floor = base.player_target + (-beyond if base.headline.dir == 'lower_is_better' else beyond)
    issues = [
        SecondaryIssue(
            id='admin_schedule',
            label={'ru': 'Подтверждённый график', 'en': 'Confirmed schedule'},
            keywords={'ru': ['подтвержденный график', 'подтвержденного графика', 'фиксированный график',
                             'гарантирую сроки', 'гарантируем сроки'],
                      'en': ['confirmed schedule', 'fixed schedule', 'guarantee the timing']},
            opp_value=0.9 if 'timing' in goals else 0.3, player_cost=0.3,
        ),
        SecondaryIssue(
            id='admin_commitment',
            label={'ru': 'Долгосрочная договорённость', 'en': 'Long-term commitment'},
            keywords={'ru': ['долгосроч', 'гарантия сотрудничества'],
                      'en': ['long-term', 'long term', 'continued cooperation']},
            opp_value=0.9 if 'certainty' in goals else 0.3, player_cost=0.3,
        ),
    ]
    # One promise must remain one concession. Adapt the matching authored issue
    # when the domain already offers it, retaining its domain-specific wording.
    aliases = {'supplier': {'admin_commitment': 'annual_contract'},
               'rent': {'admin_commitment': 'long_lease'},
               'freelance_rate': {'admin_schedule': 'priority_timeline'}}.get(base.id, {})
    secondary = list(base.secondary_issues)
    added = []
    for issue in issues:
        existing_id = aliases.get(issue.id)
        existing = next((i for i in secondary if i.id == existing_id), None)
        if existing:
            adapted = replace(existing, opp_value=issue.opp_value, keywords={
                lang: list(dict.fromkeys(existing.keywords[lang] + issue.keywords[lang]))
                for lang in ('ru', 'en')})
            secondary[secondary.index(existing)] = adapted
        else:
            secondary.append(issue)
            added.append(issue)
    roles, personas, briefings, names = {}, {}, {}, {}
    for lang in ('ru', 'en'):
        priorities = ', '.join(_GOALS[g][lang] for g in context.opponentGoals)
        names[lang] = context.opponentRole
        personas[lang] = _TONE_TEXT[context.tone][lang]
        if lang == 'ru':
            roles[lang] = f'{base.role[lang]} Тема встречи: {context.topic}.'
            intro = (f'Тема: {context.topic}. Собеседник: {context.opponentRole}. '
                     f'Его заявленные цели: {priorities}. ')
        else:
            roles[lang] = f'{base.role[lang]} Meeting topic: {context.topic}.'
            intro = (f'Topic: {context.topic}. Counterpart: {context.opponentRole}. '
                     f'Their stated objectives: {priorities}. ')
        # Base briefing names its authored persona; use the role-oriented player
        # instructions and public numbers so adapted contexts stay consistent.
        target_sign = '≤' if base.headline.dir == 'lower_is_better' else '≥'
        briefings[lang] = intro + (
            f'Ваша цель: {target_sign} {base.player_target:g} {base.headline.unit[lang]}. '
            f'Красная линия: {base.player_reservation:g} {base.headline.unit[lang]}. '
            'Выясните интересы собеседника вопросами и предложите обмен уступками.'
            if lang == 'ru' else
            f'Your target: {target_sign} {base.player_target:g} {base.headline.unit[lang]}. '
            f'Your reservation: {base.player_reservation:g} {base.headline.unit[lang]}. '
            'Explore their interests with questions and exchange concessions.'
        )
    scenario = replace(
        base, id='admin_' + signature, difficulty=context.difficulty,
        title={lang: context.topic for lang in ('ru', 'en')}, role=roles,
        counterpart=replace(base.counterpart, name=names, persona=personas,
                            style=_STYLE[context.tone]),
        opponent_reservation=round(floor, 2), briefing=briefings,
        secondary_issues=secondary,
        tradeoffs={lang: list(base.tradeoffs[lang]) + [i.label[lang] for i in added]
                   for lang in ('ru', 'en')},
    )
    return scenario, base


def preview(context: AdminContext) -> dict:
    scenario, base = build_scenario(context)
    try:
        register_runtime_scenario(scenario)
    except RuntimeRegistryFull as exc:
        raise HTTPException(503, detail='scenario_capacity') from exc
    ru = context.lang == 'ru'
    effects = [
        (f'Режим «{difficulty_name(context.difficulty, context.lang)}» меняет сопротивление уступкам и порог доверия.' if ru else
         f'“{difficulty_name(context.difficulty, context.lang)}” changes concession resistance and the trust threshold.'),
        _TONE_TEXT[context.tone][context.lang],
        ('Приоритет цены сужает запас уступок сверх вашей цели.' if ru else
         'Price priority narrows the concession margin beyond your target.')
        if 'price' in context.opponentGoals else
        ('У собеседника больше запаса для уступок по цене.' if ru else
         'The counterpart has more room to concede on price.'),
    ]
    for goal, ru_text, en_text in [
        ('timing', 'Подтверждённый график ценится особенно высоко.', 'A confirmed schedule carries extra value.'),
        ('certainty', 'Долгосрочная договорённость ценится особенно высоко.', 'A long-term commitment carries extra value.'),
    ]:
        if goal in context.opponentGoals:
            effects.append(ru_text if ru else en_text)
    return {'scenario': views.scenario_view(scenario, context.lang).model_dump(),
            'context': context.model_dump(), 'sourceScenarioId': base.id,
            'sourceTitle': base.title[context.lang], 'effects': effects}


router = APIRouter(prefix='/api/admin/scenarios', tags=['context'])
_REQUEST_BYTES = 4096
_recent: OrderedDict[str, tuple[float, float]] = OrderedDict()


def _allow_preview(host: str) -> bool:
    # Bounded token bucket. Even the offline adapter allocates runtime records.
    now = time.monotonic()
    tokens, stamp = _recent.pop(host, (10.0, now))
    tokens = min(10.0, tokens + now - stamp)
    allowed = tokens >= 1
    _recent[host] = (tokens - 1 if allowed else tokens, now)
    while len(_recent) > 512:
        _recent.popitem(last=False)
    return allowed


@router.post('/preview')
async def preview_context(request: Request) -> dict:
    raw = bytearray()
    async for chunk in request.stream():
        if len(raw) + len(chunk) > _REQUEST_BYTES:
            raise HTTPException(413, detail='context_too_large')
        raw.extend(chunk)
    try:
        context = AdminContext.model_validate_json(raw)
    except ValidationError as exc:
        # No echo of submitted text or private goals in error responses.
        fields = ['.'.join(str(x) for x in err['loc']) for err in exc.errors()[:3]]
        raise HTTPException(422, detail='invalid_context: ' + ', '.join(fields)) from exc
    if not _allow_preview(request.client.host if request.client else ''):
        raise HTTPException(429, detail='preview_rate_limit', headers={'Retry-After': '1'})
    return preview(context)
