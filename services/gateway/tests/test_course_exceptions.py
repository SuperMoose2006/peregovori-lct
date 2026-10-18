"""Исключения прежнего одиночного теста проверяются своим сценарием."""
import pytest

from app import engine
from app.course.bank import BY_ID
from app.course.simulate import seeded


@pytest.mark.parametrize('lang', ['ru', 'en'])
def test_cold_question_needs_trust_before_reveal(lang):
    item = BY_ID['fo-08']
    line = item['player_line'][lang]
    cold = seeded(item['scenario_id'], lang, item['state'])
    out = engine.apply_move(cold, engine.analyze(line), line)
    assert not cold.state.interests_found
    assert out.deltas['info'] == 5
    warm = seeded(item['scenario_id'], lang, {**item['state'], 'trust': 40})
    out = engine.apply_move(warm, engine.analyze(line), line)
    assert warm.state.interests_found
    assert out.deltas['info'] == 24


@pytest.mark.parametrize('lang', ['ru', 'en'])
def test_repeated_course_argument_loses_its_force(lang):
    item = BY_ID['pd-04']
    sess = seeded(item['scenario_id'], lang)
    line = item['bad_line'][lang]
    outcomes = []
    for _ in range(2):
        sess.turn += 1
        analysis = engine.analyze(line)
        result = engine.apply_move(sess, analysis, line)
        outcomes.append((analysis.arg_quality, result.reaction, abs(result.deltas['offer_opp'])))
    assert outcomes[0][0] > 12
    assert outcomes[0][1] == 'persuaded'
    assert outcomes[0][2] > 0
    assert outcomes[1][0] <= 12
    assert outcomes[1][2] < outcomes[0][2] * 0.4


@pytest.mark.parametrize('lang', ['ru', 'en'])
def test_active_listening_explanation_matches_the_actual_question(lang):
    item = BY_ID['al-01']
    line = item['options'][item['answer']][lang]
    sess = seeded(item['scenario_id'], lang)
    result = engine.apply_move(sess, engine.analyze(line), line)
    assert len(sess.state.interests_found) == 1
    assert result.reaction == 'opened_up'
    assert result.deltas['info'] == 24
    explanation = item['explain'][lang]
    # Сам факт вскрытия проверен выше; здесь заперт именно пользовательский
    # текст, который обещал обратное при зелёном тесте largest_delta.
    assert ('Информация +24' if lang == 'ru' else 'Information +24') in explanation
    assert ('интерес вскрыт' if lang == 'ru' else 'interest is uncovered') in explanation


def test_secondary_issue_matches_from_word_start_like_offline_core():
    """Найдено после аудита 17.10: сервер искал ключ условия подстрокой, и
    «годов» находилось в «полугодовой контракт» — годовой контракт засчитывался
    на сервере и не засчитывался офлайн (`has`, с начала слова). Инвариант 8."""
    from app.engine.engine import _match_secondary_issues
    from app.engine.scenarios import by_id
    from app.engine.techniques import _has, norm

    sc = by_id("supplier")
    for line in ["Если подпишем полугодовой контракт, сможете подвинуться по цене за штуку?",
                 "Если дадим годовой контракт, сможете подвинуться по цене за штуку?"]:
        t = norm(line)
        server = [i.id for i in _match_secondary_issues(sc, t, "ru", None)]
        offline = [i.id for i in sc.secondary_issues if _has(t, i.keywords["ru"])]
        assert server == offline, line
