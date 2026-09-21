"""Контракт отвергает сломанные формы, не меняя ни одного ответа банка."""
from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.course.bank import BANK
from app.course.master import MASTER
from app.protocol import COURSE_EXERCISE

ALL = [*BANK, *MASTER]


@pytest.mark.parametrize('item', ALL, ids=lambda item: item['id'])
def test_bank_and_master_roundtrip(item):
    parsed = COURSE_EXERCISE.validate_python(item)
    assert parsed.model_dump(by_alias=True, exclude_unset=True) == item


@pytest.mark.parametrize('kind,required', [
    ('choice', 'options'), ('spot_error', 'fault_key'), ('order', 'items'),
    ('match', 'left'), ('numeric', 'answer'), ('freeform', 'check'),
    ('reaction', 'player_line'), ('meters', 'player_line'), ('face', 'answer'),
    ('drill', 'pass'),
])
def test_each_type_requires_its_own_fields(kind, required):
    item = deepcopy(next(i for i in ALL if i['type'] == kind))
    del item[required]
    with pytest.raises(ValidationError):
        COURSE_EXERCISE.validate_python(item)


@pytest.mark.parametrize('kind,field,bad', [
    ('choice', 'answer', 900), ('choice', 'answer', True),
    ('choice', 'answer', '1'), ('choice', 'type', 'invented'),
    ('spot_error', 'fault_key', 'invented'), ('order', 'answer', ['missing']),
    ('match', 'answer', {'missing': 'also-missing'}),
    ('numeric', 'answer', {'value': 1, 'tolerance': -1}),
    ('numeric', 'answer', {'value': float('nan'), 'tolerance': 0}),
    ('freeform', 'check', {'min_arg': 101}),
    ('reaction', 'answer', 'not-a-reaction'), ('face', 'answer', 'not-a-reaction'),
    ('meters', 'ask', 'sign_of:missing'), ('meters', 'answer', 'up'),
    ('drill', 'pass', [{'field': 'camera', 'op': '>=', 'value': 1}]),
    ('drill', 'pass', [{'field': 'deal', 'op': 'approximately', 'value': 1}]),
    ('drill', 'pass', [{'field': 'deal', 'op': '>=', 'value': 'one'}]),
    ('drill', 'pass', [{'field': 'status', 'op': '>', 'value': 'agreement'}]),
    ('choice', 'prompt', {'ru': 'Есть', 'en': ''}),
    ('choice', 'unsupported', 1),
])
def test_invalid_contract_is_rejected(kind, field, bad):
    item = deepcopy(next(i for i in ALL if i['type'] == kind))
    item[field] = bad
    with pytest.raises(ValidationError):
        COURSE_EXERCISE.validate_python(item)


def test_generator_rejects_bad_bank_before_emitting_typescript(monkeypatch):
    from tools import sync_course
    bad = deepcopy(BANK[0])
    bad['answer'] = 999
    monkeypatch.setattr(sync_course, 'BANK', [bad])
    with pytest.raises(ValidationError):
        sync_course.render_bank()
