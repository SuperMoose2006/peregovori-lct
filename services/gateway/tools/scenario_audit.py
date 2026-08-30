#!/usr/bin/env python3
"""scenario_audit.py — пригоден ли стол к игре? Прибор, а не мнение.

ARCHITECTURE.md ставит планку НОВОМУ сценарию: «запись с 3 скрытыми интересами и
корректной ZOPA; проверить оба направления и добавить лица». Девять столов из
`app/engine/scenarios.py` этой планкой не проверялись ни разу — она писалась для
будущих. Здесь она применена к существующим, и применена ПРОГОНОМ ДВИЖКА:
«интерес достижим» значит «нашлась реплика, после которой движок его вскрыл», а
не «в словаре лежат ключевые слова».

ЧТО МЕРЯЕТСЯ

  1. Калибровка. Прибор сперва воспроизводит `games.scores.json` балл в балл.
     Не воспроизвёл — дальше не идёт и сообщает, что сломан ОН, а не движок.
  2. Карточка стола: три интереса на двух языках и все три ДОСТИЖИМЫ поодиночке
     — вопрос по теме и вопрос по КАЖДОМУ из ~40 ключевых слов стола обязаны
     вскрыть ИМЕННО свой интерес, а не чужой; слова обязаны пережить `norm`;
     ZOPA непуста и измерена в шагах цены; направление шкалы согласовано с
     числами; бриф не расходится с углами стола; BATNA не противоречит красной
     линии; вторичные условия дают реальный выигрыш в цене; билингвальность;
     лица на месте — файлом, а не записью в манифесте.
  3. Две партии на каждом столе и КАЖДОМ языке: принципиальная (инвариант 2 —
     A/B) и агрессивная (инвариант 2 — срыв или F).
  4. Инвариант 1 ПЕРЕБОРОМ, а не одной партией: все 63 подмножества реплик
     принципиальной партии × 2 языка × 9 столов = 1134 игры, и в каждой цена
     оппонента и цена сделки проверяются на пересечение floor после КАЖДОГО
     хода. Метод взят из `grade_spread.py`: интерполяция между хорошей игрой и
     молчанием не требует генератора, а значит не измеряет сам себя.
  5. Перекос МЕЖДУ столами: доля A, средний overall, потолок экономики — и
     сходится ли измеренная трудность с полем `difficulty`.

ПОЧЕМУ ПОДМНОЖЕСТВА, А НЕ СЛУЧАЙНЫЕ ПАРТИИ. В `grade_spread.py` записана цена
ошибки: три редакции случайного генератора подряд «доказывали» пустоту полос
шкалы, и каждый раз доказывали себя — то не умели закрыть сделку, то хамили
независимо от уровня. Подмножество эталонной партии — настоящие реплики в
настоящем движке, придумывать нечего.

    .venv/bin/python tools/scenario_audit.py            # полный отчёт
    .venv/bin/python tools/scenario_audit.py --json     # то же машинно
    .venv/bin/python tools/scenario_audit.py --quick    # без перебора подмножеств
    .venv/bin/python tools/scenario_audit.py --only rent

Код возврата: 0 — все проверки пройдены, 1 — есть провалы (ПРОВАЛ в отчёте),
2 — сломан сам прибор (калибровка не сошлась).
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

os.environ.setdefault("NEGO_AI", "off")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.avatar.base import AVATAR_STATES  # noqa: E402
from app.engine import engine  # noqa: E402
from app.engine.scenarios import SCENARIOS, Scenario  # noqa: E402
from app.engine.techniques import analyze  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "frontend" / "test" / "fixtures"
GAMES = json.loads((FIXTURES / "games.json").read_text(encoding="utf-8"))
SCORES = json.loads((FIXTURES / "games.scores.json").read_text(encoding="utf-8"))
AVATARS = ROOT / "frontend" / "public" / "avatars"
LANGS = ("ru", "en")

#: Принципиальные партии: {scenario_id: {"ru": [...], "en": [...]}}.
PRINCIPLED = {k: v for k, v in GAMES["principled"].items() if k != "note"}

#: Агрессивная линия. Столонезависима намеренно: хамство в движке не зависит от
#: предметной области (LEX["hostile"] и LEX["threat"] общие), и подставлять сюда
#: сценарные слова значило бы мерить лексикон, а не инвариант 2. Реплики РАЗНЫЕ:
#: одинаковые попали бы под анти-повтор, и партия сорвалась бы медленнее, чем
#: должна, — то есть прибор занизил бы собственную строгость.
AGGRESSIVE = {
    "ru": [
        "Это просто смешно, вы издеваетесь.",
        "Вы некомпетентны и обманываете нас.",
        "Требую немедленно снизить, иначе разрываем.",
        "Позор. Вы врете, и это абсурд.",
    ],
    "en": [
        "This is ridiculous, you are lying.",
        "You people are incompetent, this is a joke.",
        "I demand you move right now or we walk away.",
        "Absurd and stupid — you have no choice here.",
    ],
}

#: Оправа тематического вопроса. Приём `interests_probe` обязан быть распознан,
#: иначе проверка мерила бы классификатор, а не достижимость интереса.
TOPIC_PROBE = {
    "ru": "Почему для вас важно {}? Что именно для вас там важнее всего?",
    "en": "Why does {} matter to you? What is most important to you there?",
}

OK, WARN, FAIL = "ok", "внимание", "ПРОВАЛ"


class Report:
    """Собиратель вердиктов. Печатает по ходу, помнит итог."""

    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str, str]] = []  # scenario, level, check, text

    def add(self, scenario: str, level: str, check: str, text: str) -> None:
        self.rows.append((scenario, level, check, text))

    def line(self, scenario: str, level: str, check: str, text: str) -> None:
        self.add(scenario, level, check, text)
        mark = {OK: "  ✓", WARN: "  ·", FAIL: "  ✗"}[level]
        print(f"{mark} {check:22} {text}")

    @property
    def failures(self) -> list[tuple[str, str, str, str]]:
        return [r for r in self.rows if r[1] == FAIL]

    @property
    def warnings(self) -> list[tuple[str, str, str, str]]:
        return [r for r in self.rows if r[1] == WARN]


# -----------------------------------------------------------------------------
# Прогон партии. Одна функция на весь файл — иначе прибор начнёт мерить свои
# редакции. Порядок ходов ровно такой же, как в gen_game_scores.py и в
# tests/test_reference_games.py: сначала turn += 1, потом apply_move.
# -----------------------------------------------------------------------------

def play(scenario_id: str, lines: list[str], lang: str):
    sess = engine.create_session(scenario_id, lang)
    for text in lines:
        if sess.state.status != "active":
            break
        sess.turn += 1
        engine.apply_move(sess, analyze(text), text)
        if sess.state.status == "active" and sess.turn >= sess.max_turns:
            sess.state.status = "breakdown"
    return sess, engine.score_session(sess)


def better(sc: Scenario, a: float, b: float) -> bool:
    """Число `a` лучше для ИГРОКА, чем `b`?"""
    return a < b if sc.headline.dir == "lower_is_better" else a > b


def crosses_floor(sc: Scenario, price: float) -> bool:
    """Цена ЗА дном оппонента — то, чего инвариант 1 не разрешает никогда.

    Допуск в тысячную: `_round2` и шаг цены считают в плавающей точке, и
    строгое сравнение ловило бы 83.99999999 как нарушение.
    """
    if sc.headline.dir == "lower_is_better":
        return price < sc.opponent_reservation - 0.001
    return price > sc.opponent_reservation + 0.001


# -----------------------------------------------------------------------------
# 1. КАЛИБРОВКА. Прибор с известным ответом на входе.
# -----------------------------------------------------------------------------

#: Поля, по которым прибор сверяется с эталоном. Если хоть одно разошлось —
#: считать дальше нечего: любая цифра ниже будет цифрой другой игры.
_CALIBRATION_FIELDS = ("overall", "grade", "economic", "relationship",
                       "technique", "status", "interests_found", "deal_text")


def calibrate() -> tuple[bool, list[str]]:
    """Воспроизводит ли прибор `games.scores.json` балл в балл?

    ЗАЧЕМ ЭТО ПЕРВЫМ. Прибор, который сам играет партии, обязан сначала
    доказать, что играет их ТАК ЖЕ, как продукт. Иначе он честно измерит
    собственную ошибку и назовёт её свойством сценария: ровно так генератор в
    `grade_spread.py` трижды «доказывал» пустоту полос шкалы.
    """
    bad: list[str] = []
    ref = SCORES["principled"]
    for sid, want in sorted(ref.items()):
        _, got = play(sid, PRINCIPLED[sid]["ru"], "ru")
        for field in _CALIBRATION_FIELDS:
            if got[field] != want[field]:
                bad.append(f"{sid}.{field}: прибор {got[field]!r}, эталон {want[field]!r}")
    # Вторая половина известного ответа: лестница качества на одном столе.
    ladder = GAMES["ladder"]
    # `mirror` — половина, по которой посчитан games.scores.json (у лестницы она
    # русская); калибровка обязана играть ИМЕННО её, иначе прибор сверяет
    # английскую партию с русским эталоном и объявляет сломанным движок.
    lad_lang = ladder.get("mirror") or ladder["lang"]
    for gid, want in SCORES["ladder"].items():
        game = next(g for g in ladder["games"] if g["id"] == gid)
        lines = game["lines"]
        if isinstance(lines, str) and lines.startswith("@principled."):
            # Ловушка, на которой прибор уже обжигался: строка-ссылка перебиралась
            # ПО БУКВАМ, и партия «@principled.supplier» превращалась в двадцать
            # ходов «@», «p», «r» — 12 F вместо 92 A.
            lines = PRINCIPLED[lines.split(".", 1)[1]][lad_lang]
        elif isinstance(lines, dict):
            lines = lines[lad_lang]
        _, got = play(ladder["scenario"], lines, lad_lang)
        for field in _CALIBRATION_FIELDS:
            if got[field] != want[field]:
                bad.append(f"ladder/{gid}.{field}: прибор {got[field]!r}, эталон {want[field]!r}")
    return not bad, bad


# -----------------------------------------------------------------------------
# 2. Карточка стола: статические проверки.
# -----------------------------------------------------------------------------

def _walk_bilingual(obj, path: str, out: list[str]) -> None:
    """Ищет словари с языковыми ключами и требует обе половины (инвариант 4)."""
    if isinstance(obj, dict):
        keys = set(obj)
        if "ru" in keys or "en" in keys:
            for lang in LANGS:
                if lang not in keys:
                    out.append(f"{path}: нет половины «{lang}»")
                elif not obj.get(lang):
                    out.append(f"{path}.{lang}: пусто")
            if keys - set(LANGS):
                out.append(f"{path}: лишние ключи {sorted(keys - set(LANGS))}")
            return
        for k, v in obj.items():
            _walk_bilingual(v, f"{path}.{k}", out)
    elif isinstance(obj, (list, tuple)):
        for i, v in enumerate(obj):
            _walk_bilingual(v, f"{path}[{i}]", out)
    elif hasattr(obj, "__dataclass_fields__"):
        for name in obj.__dataclass_fields__:
            _walk_bilingual(getattr(obj, name), f"{path}.{name}" if path else name, out)


def check_bilingual(sc: Scenario, rep: Report) -> None:
    problems: list[str] = []
    _walk_bilingual(sc, "", problems)
    # Списки, идущие парой, обязаны совпадать длиной: «три интереса по-русски и
    # два по-английски» — это не билингвальность, а разные игры на одном столе.
    for name in ("hidden_interests", "tradeoffs", "interest_topics",
                 "hidden_interest_keywords"):
        val = getattr(sc, name) or {}
        if val and len({len(val.get(l) or []) for l in LANGS}) > 1:
            problems.append(f"{name}: длины ru/en разошлись "
                            f"({[len(val.get(l) or []) for l in LANGS]})")
    if problems:
        rep.line(sc.id, FAIL, "билингвальность", "; ".join(problems))
    else:
        rep.line(sc.id, OK, "билингвальность", "все поля {ru, en} на месте")


def check_interests_shape(sc: Scenario, rep: Report) -> None:
    counts = {l: len(sc.hidden_interests.get(l) or []) for l in LANGS}
    if set(counts.values()) != {3}:
        rep.line(sc.id, FAIL, "три интереса", f"их {counts}, а планка — ровно три")
        return
    missing = []
    for lang in LANGS:
        if len((sc.interest_topics or {}).get(lang) or []) != 3:
            missing.append(f"тем {lang}")
        if len((sc.hidden_interest_keywords or {}).get(lang) or []) != 3:
            missing.append(f"ключевых слов {lang}")
    if missing:
        rep.line(sc.id, FAIL, "три интереса", "ровно три, но нет: " + ", ".join(missing))
    else:
        rep.line(sc.id, OK, "три интереса", "3 × 2 языка, темы и ключевые слова index-aligned")


def check_keywords_survive_norm(sc: Scenario, rep: Report) -> None:
    """Переживает ли ключевое слово нормализацию текста?

    Совпадение считается подстрокой в УЖЕ нормализованной реплике
    (`k in cur_norm`), а само слово из словаря не нормализуется ничем. Значит
    апостроф, кавычка или двойной пробел в словаре делают запись мёртвой
    навсегда — и мёртвой МОЛЧА: список выглядит богатым, а работает наполовину.
    Так и лежало `can't sustain`: `norm` меняет апостроф на пробел, и строка не
    совпадала ни с чем никогда.
    """
    from app.engine.techniques import norm
    dead: list[str] = []
    for lang in LANGS:
        for i, words in enumerate((sc.hidden_interest_keywords or {}).get(lang) or []):
            dead += [f"интерес {i}/{lang}: «{w}»" for w in words if norm(w) != w]
        for iss in sc.secondary_issues:
            dead += [f"{iss.id}/{lang}: «{w}»" for w in (iss.keywords.get(lang) or [])
                     if norm(w) != w]
    if dead:
        rep.line(sc.id, FAIL, "слова и норма",
                 f"{len(dead)} записей не переживают norm(): " + "; ".join(dead))
    else:
        rep.line(sc.id, OK, "слова и норма", "все ключевые слова совпадают с norm(себя)")


def check_zopa(sc: Scenario, rep: Report) -> dict:
    """ZOPA: есть ли зона согласия, насколько она широка, достижима ли цель."""
    lower = sc.headline.dir == "lower_is_better"
    step = engine.price_step(sc)
    # Направление: открытие оппонента обязано быть ХУЖЕ его дна для игрока,
    # а цель игрока — лучше его красной линии. Перевёрнутый стол не играется.
    wrong: list[str] = []
    if not better(sc, sc.opponent_reservation, sc.opponent_open):
        wrong.append("дно оппонента не лучше его открытия — торговаться некуда")
    if not better(sc, sc.player_target, sc.player_reservation):
        wrong.append("цель игрока не лучше его красной линии")
    # Сама ZOPA: между красной линией игрока и дном оппонента.
    width = abs(sc.opponent_reservation - sc.player_reservation)
    zopa_ok = better(sc, sc.opponent_reservation, sc.player_reservation)
    if not zopa_ok:
        wrong.append("ZOPA ПУСТА: дно оппонента хуже красной линии игрока")
    steps = width / step if step else 0.0
    # Потолок экономики: лучшее, что игрок может выторговать, — дно оппонента,
    # и меряется оно ТОЙ ЖЕ меркой, что в счёте (`engine.best_available`), а не
    # целью. Считать здесь целью значило бы мерить не ту игру, которую играет
    # продукт: на двух столах цель стоит не доходя до дна, и прибор рапортовал
    # бы потолок 67 там, где движок ставит 100.
    goal = engine.best_available(sc)
    ratio = ((sc.opponent_reservation - sc.player_reservation)
             / (goal - sc.player_reservation))
    econ_max = int(engine.clamp(round(ratio * 100)))
    target_reachable = engine.target_reachable(sc)
    lo, hi = ((sc.opponent_reservation, sc.player_reservation) if lower
              else (sc.player_reservation, sc.opponent_reservation))
    text = (f"[{lo:g} … {hi:g}] ширина {width:g} = {steps:.0f} шагов по {step:g}; "
            f"потолок economic {econ_max}")
    if wrong:
        rep.line(sc.id, FAIL, "ZOPA", text + " — " + "; ".join(wrong))
    elif steps < 3:
        rep.line(sc.id, WARN, "ZOPA", text + " — уже трёх шагов: торга почти нет")
    elif not target_reachable:
        rep.line(sc.id, WARN, "ZOPA", text +
                 f" — ЦЕЛЬ {sc.player_target:g} ЗА ДНОМ оппонента ({sc.opponent_reservation:g}): "
                 f"её не взять ни при какой игре; экономика меряется от лучшего "
                 f"доступного ({sc.opponent_reservation:g}), и бриф обязан об этом "
                 f"предупреждать")
    else:
        rep.line(sc.id, OK, "ZOPA", text + " — цель достижима")
    return {"width": width, "steps": steps, "econ_max": econ_max,
            "target_reachable": target_reachable, "step": step}


_NUM = re.compile(r"-?\d+(?:[.,]\d+)?")


def check_briefing(sc: Scenario, rep: Report) -> None:
    """Числа в брифе обязаны совпасть с полями стола.

    Бриф — единственное место, где игрок читает свою цель и красную линию
    словами. Разъехавшееся число там дороже любой опечатки: человек закрывает
    сделку на цифре, которой у стола нет, и получает провал закрытия.
    """
    told = []
    for lang in LANGS:
        nums = {float(m.group(0).replace(",", ".")) for m in _NUM.finditer(sc.briefing[lang])}
        if not nums:
            continue
        told.append(lang)
        stale = nums - {float(sc.player_target), float(sc.player_reservation),
                        float(sc.opponent_open), float(sc.opponent_reservation)}
        if stale:
            rep.line(sc.id, FAIL, "числа в брифе",
                     f"{lang}: {sorted(stale)} нет ни в одном углу стола")
            return
    if not told:
        rep.line(sc.id, WARN, "числа в брифе",
                 "бриф не называет ни цели, ни красной линии — они едут только полями вида")
    else:
        rep.line(sc.id, OK, "числа в брифе", "совпадают с углами стола")


def check_batna(sc: Scenario, rep: Report) -> None:
    """BATNA не должна противоречить красной линии.

    Правило, а не вкусовщина: если в записке названа цифра ЛУЧШЕ красной линии,
    игроку рационально уйти к альтернативе, а не соглашаться, — и красная линия
    перестаёт что-то значить. Разрешено ровно одно исключение, и оно обязано
    быть НАПИСАНО: у альтернативы назван минус («но …» / «but …»), из-за
    которого её и не берут. Записка без минуса — это не BATNA, а лучший оффер,
    от которого игрок почему-то отказывается.
    """
    if not 0 <= sc.player_batna.strength <= 100:
        rep.line(sc.id, FAIL, "BATNA", f"strength {sc.player_batna.strength} вне 0..100")
        return
    verdicts = []
    for lang in LANGS:
        note = sc.player_batna.note[lang]
        nums = [float(m.group(0).replace(",", ".")) for m in _NUM.finditer(note)]
        # Проценты и «40 минут» — не цена. Берём число, лежащее в масштабе стола.
        corners = (sc.opponent_open, sc.opponent_reservation,
                   sc.player_target, sc.player_reservation)
        scale = [n for n in nums if min(corners) * 0.5 <= n <= max(corners) * 2]
        if not scale:
            verdicts.append((lang, None, None))
            continue
        alt = scale[0]
        caveat = ("но" in note.lower() or "but" in note.lower()
                  or "risk" in note.lower() or "риск" in note.lower())
        verdicts.append((lang, alt, caveat))
    problems = []
    for lang, alt, caveat in verdicts:
        if alt is None:
            continue
        if better(sc, alt, sc.player_reservation) and not caveat:
            problems.append(f"{lang}: альтернатива {alt:g} ЛУЧШЕ красной линии "
                            f"{sc.player_reservation:g}, а минуса у неё не названо")
    if problems:
        rep.line(sc.id, FAIL, "BATNA", "; ".join(problems))
    else:
        named = [f"{lang}:{alt:g}" for lang, alt, _ in verdicts if alt is not None]
        rep.line(sc.id, OK, "BATNA",
                 f"сила {sc.player_batna.strength}"
                 + (f", альтернатива {', '.join(named)} — с названным минусом" if named
                    else ", без цифры (альтернатива неценовая)"))


def check_tradeoffs(sc: Scenario, rep: Report) -> dict:
    """Даёт ли размен РЕАЛЬНЫЙ выигрыш, или это украшение брифа?

    Меряем движком: одна и та же партия с уступкой вторичного условия и без
    неё. Разница в итоговой цене — и есть цена размена в единицах стола.
    """
    if not sc.tradeoffs.get("ru"):
        rep.line(sc.id, FAIL, "размены", "список tradeoffs пуст")
        return {}
    if not sc.secondary_issues:
        rep.line(sc.id, WARN, "размены",
                 f"{len(sc.tradeoffs['ru'])} текстовых, но структурных нет: "
                 "плоская прибавка без второй оси")
        return {}
    gains: list[str] = []
    for iss in sc.secondary_issues:
        for lang in LANGS:
            kw = iss.keywords.get(lang) or []
            if not kw:
                rep.line(sc.id, FAIL, "размены", f"{iss.id}: нет ключевых слов {lang}")
                return {}
        # Реплика-размен, собранная ИЗ ЯРЛЫКА условия: что игрок читает, то и
        # предлагает. Своя формулировка рядом с ярлыком разъехалась бы с ним.
        offer = f"Если мы дадим {iss.label['ru'].lower()}, сможете подвинуться по цене?"
        plain = "Если мы пойдём вам навстречу, сможете подвинуться по цене?"
        with_iss, _ = play(sc.id, [offer], "ru")
        without, _ = play(sc.id, [plain], "ru")
        delta = with_iss.state.offer_opp - without.state.offer_opp
        moved = abs(delta) > 1e-9 and better(sc, with_iss.state.offer_opp, without.state.offer_opp)
        conceded = iss.id in with_iss.state.terms_conceded
        gains.append(f"{iss.id} (ценность {iss.opp_value:g}/цена {iss.player_cost:g}): "
                     f"{'засчитан' if conceded else 'НЕ ЗАСЧИТАН'}, "
                     f"цена {without.state.offer_opp:g}→{with_iss.state.offer_opp:g}")
        if not conceded or not moved:
            rep.line(sc.id, FAIL, "размены", "; ".join(gains) +
                     " — уступка условия не даёт выигрыша в цене")
            return {}
    rep.line(sc.id, OK, "размены", "; ".join(gains))
    return {}


def check_faces(sc: Scenario, rep: Report) -> None:
    """Лица на месте — и это ФАЙЛЫ, а не запись в манифесте.

    Каждое состояние из `AVATAR_STATES` обязано разрешаться в существующую
    картинку — прямо или через алиас. Иначе аватар молча покажет пустоту ровно
    в тот момент, когда движок посчитал реакцию.
    """
    folder = AVATARS / sc.id
    manifest = folder / "manifest.json"
    if not manifest.is_file():
        rep.line(sc.id, FAIL, "лица", f"нет {manifest.relative_to(ROOT)}")
        return
    man = json.loads(manifest.read_text(encoding="utf-8"))
    aliases = man.get("aliases") or {}
    missing = []
    for state in AVATAR_STATES:
        target = aliases.get(state, state)
        if not (folder / f"{target}.webp").is_file():
            missing.append(f"{state}→{target}")
    if missing:
        rep.line(sc.id, FAIL, "лица", "нет картинки для: " + ", ".join(missing))
        return
    name_ok = man.get("name") == sc.counterpart.name
    style_ok = man.get("style") == sc.counterpart.style
    if not (name_ok and style_ok):
        rep.line(sc.id, FAIL, "лица",
                 f"манифест разошёлся со столом: name={man.get('name')} "
                 f"style={man.get('style')}")
        return
    rep.line(sc.id, OK, "лица",
             f"{len(AVATAR_STATES)} состояний разрешаются в файлы; манифест сходится")


# -----------------------------------------------------------------------------
# 3. Достижимость интересов — прогоном движка.
# -----------------------------------------------------------------------------

def check_interest_reach(sc: Scenario, rep: Report) -> dict:
    """Каждый ли из трёх интересов вскрывается ОТДЕЛЬНОЙ репликой?

    Два независимых пути, и оба обязаны привести к ОДНОМУ И ТОМУ ЖЕ индексу:
      · вопрос по ТЕМЕ — то, что игрок читает чипом на столе;
      · вопрос по КАЖДОМУ ключевому слову — то, что записано в словаре стола.

    Требование «именно свой индекс» строже, чем «хоть какой-то»: если вопрос
    про оплату вскрывает интерес про производство, игрок получает секрет, о
    котором не спрашивал, а чип на столе врёт.

    ПОЧЕМУ ВСЕ КЛЮЧЕВЫЕ СЛОВА, А НЕ ПЕРВОЕ. Вскрытие идёт по списку сверху вниз
    и останавливается на первом совпадении — своя тема ИЛИ своё слово. Значит
    ярлык темы, стоящий выше, способен молча съесть слово соседнего интереса, и
    заметить это можно, только перебрав словарь целиком. Одно совпадение на
    столе (`rent`/en) так и нашлось: тема «Finding tenants» перехватывала
    «quiet tenant», то есть четыре слова из семи у второго интереса были мертвы.
    """
    detail: dict[str, list] = {}
    problems: list[str] = []
    dead = 0
    total = 0
    for lang in LANGS:
        topics = sc.interest_topics[lang]
        kws = sc.hidden_interest_keywords[lang]
        got_topic = []
        for i in range(3):
            sess, _ = play(sc.id, [TOPIC_PROBE[lang].format(topics[i])], lang)
            got_topic.append(list(sess.state.interests_found))
            if got_topic[-1] != [i]:
                problems.append(f"{lang}: вопрос по теме «{topics[i]}» вскрыл "
                                f"{got_topic[-1] or 'ничего'}, а должен [{i}]")
            for word in kws[i]:
                total += 1
                sess, _ = play(sc.id, [TOPIC_PROBE[lang].format(word)], lang)
                found = list(sess.state.interests_found)
                if found != [i]:
                    dead += 1
                    problems.append(f"{lang}: слово «{word}» вскрыло "
                                    f"{found or 'ничего'}, а должно [{i}]")
        detail[lang] = got_topic
    if problems:
        rep.line(sc.id, FAIL, "интересы достижимы",
                 f"мёртвых слов {dead} из {total}: " + "; ".join(problems[:6]))
    else:
        rep.line(sc.id, OK, "интересы достижимы",
                 f"3 темы × 2 языка и все {total} ключевых слов вскрывают свой интерес")
    return {"dead": dead, "total": total, "detail": detail}


# -----------------------------------------------------------------------------
# 4. Две партии: принципиальная и агрессивная.
# -----------------------------------------------------------------------------

def check_two_lines(sc: Scenario, rep: Report) -> dict:
    out: dict[str, dict] = {}
    princ_bad, aggr_bad = [], []
    for lang in LANGS:
        sess, d = play(sc.id, PRINCIPLED[sc.id][lang], lang)
        out[f"principled_{lang}"] = {
            "grade": d["grade"], "overall": d["overall"], "economic": d["economic"],
            "relationship": d["relationship"], "technique": d["technique"],
            "status": d["status"], "interests": d["interests_found"],
            "deal": sess.state.deal, "turns": sess.turn,
        }
        if d["grade"] not in ("A", "B"):
            princ_bad.append(f"{lang}: {d['grade']} ({d['overall']})")
        if d["status"] != "agreement":
            princ_bad.append(f"{lang}: {d['status']} вместо сделки")
        if d["interests_found"] != 3:
            princ_bad.append(f"{lang}: вскрыто {d['interests_found']} из 3")

        sess, d = play(sc.id, AGGRESSIVE[lang], lang)
        out[f"aggressive_{lang}"] = {
            "grade": d["grade"], "overall": d["overall"], "status": d["status"],
            "turns": sess.turn, "trust": round(sess.state.trust),
            "tension": round(sess.state.tension),
            "offer_opp": sess.state.offer_opp,
        }
        if not (d["status"] == "breakdown" or d["grade"] == "F"):
            aggr_bad.append(f"{lang}: {d['grade']} ({d['overall']}), {d['status']}")

    p = out["principled_ru"], out["principled_en"]
    txt = " · ".join(f"{l}: {out[f'principled_{l}']['grade']} "
                     f"{out[f'principled_{l}']['overall']} "
                     f"(эк {out[f'principled_{l}']['economic']}/"
                     f"от {out[f'principled_{l}']['relationship']}/"
                     f"тех {out[f'principled_{l}']['technique']}, "
                     f"сделка {out[f'principled_{l}']['deal']:g})"
                     for l in LANGS if out[f"principled_{l}"]["deal"] is not None)
    if princ_bad:
        rep.line(sc.id, FAIL, "принципиальная", "; ".join(princ_bad))
    else:
        # Расхождение языков меряется И по итогу, И по технике. Итог гасит
        # разницу: экономика на обоих языках упирается в потолок, и десять
        # очков техники превращаются в четыре балла overall. Но играют-то две
        # РАЗНЫЕ партии, и видно это только в технике.
        spread = abs(p[0]["overall"] - p[1]["overall"])
        tech_spread = abs(p[0]["technique"] - p[1]["technique"])
        level = WARN if (spread > 6 or tech_spread > 6) else OK
        rep.line(sc.id, level, "принципиальная",
                 txt + f"; расхождение языков {spread} по итогу, {tech_spread} по технике"
                 + (" — половины эталона играют разную игру"
                    if level == WARN else ""))
    if aggr_bad:
        rep.line(sc.id, FAIL, "агрессивная", "; ".join(aggr_bad))
    else:
        rep.line(sc.id, OK, "агрессивная",
                 " · ".join(f"{l}: {out[f'aggressive_{l}']['status']} на ходу "
                            f"{out[f'aggressive_{l}']['turns']}, "
                            f"{out[f'aggressive_{l}']['grade']} "
                            f"{out[f'aggressive_{l}']['overall']}" for l in LANGS))
    return out


# -----------------------------------------------------------------------------
# 5. Инвариант 1 перебором + распределение грейдов.
# -----------------------------------------------------------------------------

def sweep(sc: Scenario, rep: Report) -> dict:
    """Все подмножества принципиальной партии, оба языка.

    Проверяется НЕ итог, а каждый ход: цена оппонента после каждой реплики и
    цена сделки обязаны остаться по свою сторону от floor. Инвариант 1 — про
    ход торга, а не про финальную цифру, и одна партия его не доказывает.
    """
    grades: Counter = Counter()
    overalls: list[int] = []
    techniques: list[int] = []
    deals = 0
    #: Сделки, в которых игрок остался ПО СВОЮ СТОРОНУ красной линии. Голое
    #: «сделок 51%» на всех столах одинаково и потому бесполезно: закрытие
    #: зависит только от того, попала ли в подмножество закрывающая реплика.
    #: Осмысленно другое — сколько закрытий оказались не хуже красной линии.
    in_corridor = 0
    games = 0
    breaches: list[str] = []
    for lang in LANGS:
        lines = PRINCIPLED[sc.id][lang]
        for n in range(1, len(lines) + 1):
            for combo in itertools.combinations(range(len(lines)), n):
                subset = [lines[i] for i in combo]
                sess = engine.create_session(sc.id, lang)
                for text in subset:
                    if sess.state.status != "active":
                        break
                    sess.turn += 1
                    engine.apply_move(sess, analyze(text), text)
                    if crosses_floor(sc, sess.state.offer_opp):
                        breaches.append(f"{lang}/{combo}: offer_opp "
                                        f"{sess.state.offer_opp:g} за дном "
                                        f"{sc.opponent_reservation:g}")
                    if sess.state.deal is not None and crosses_floor(sc, sess.state.deal):
                        breaches.append(f"{lang}/{combo}: deal {sess.state.deal:g} "
                                        f"за дном {sc.opponent_reservation:g}")
                    if sess.state.status == "active" and sess.turn >= sess.max_turns:
                        sess.state.status = "breakdown"
                d = engine.score_session(sess)
                grades[d["grade"]] += 1
                overalls.append(d["overall"])
                techniques.append(d["technique"])
                if sess.state.status == "agreement":
                    deals += 1
                    if sess.state.deal is not None and not better(
                            sc, sc.player_reservation, sess.state.deal):
                        in_corridor += 1
                games += 1
    if breaches:
        rep.line(sc.id, FAIL, "инвариант 1",
                 f"{len(breaches)} нарушений из {games} партий: " + "; ".join(breaches[:3]))
    else:
        rep.line(sc.id, OK, "инвариант 1",
                 f"{games} партий (все подмножества × 2 языка), floor "
                 f"{sc.opponent_reservation:g} не перейдён ни разу")
    dist = " ".join(f"{g}:{grades.get(g, 0)}" for g in "ABCDF")
    mean = sum(overalls) / len(overalls)
    rep.line(sc.id, OK, "разброс подмножеств",
             f"{dist} · средний overall {mean:.1f} · лучший {max(overalls)} "
             f"· лучшая техника {max(techniques)} · сделок "
             f"{100 * deals / games:.0f}%, из них в коридоре "
             f"{100 * in_corridor / max(1, deals):.0f}%")
    return {"grades": dict(grades), "mean": mean, "games": games,
            "best": max(overalls), "best_technique": max(techniques),
            "deal_rate": deals / games, "corridor_rate": in_corridor / max(1, deals),
            "breaches": len(breaches), "a_share": grades.get("A", 0) / games}


# -----------------------------------------------------------------------------
# Сводка по банку.
# -----------------------------------------------------------------------------

def _spearman(xs: list[float], ys: list[float]) -> float:
    """Ранговая корреляция. Пирсон здесь не годится: `difficulty` — это точки на
    карточке (порядковая шкала), а не величина."""
    def ranks(v: list[float]) -> list[float]:
        order = sorted(range(len(v)), key=lambda i: v[i])
        out = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                out[order[k]] = avg
            i = j + 1
        return out
    rx, ry = ranks(xs), ranks(ys)
    n = len(xs)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return num / den if den else 0.0


def summary(data: dict, rep: Report, quick: bool) -> None:
    print("\n═══ БАНК ЦЕЛИКОМ ═══\n")
    print(f"  {'стол':16} {'d':>2} {'потолок':>7} {'принцип. ru/en':>15} "
          f"{'A%':>5} {'сред.':>6} {'лучш.':>6} {'в кор.':>7}  ZOPA")
    rows = []
    for sc in SCENARIOS:
        if sc.id not in data:
            continue
        d = data[sc.id]
        z, lines, sw = d["zopa"], d["lines"], d.get("sweep")
        pr = f"{lines['principled_ru']['overall']}/{lines['principled_en']['overall']}"
        a_share = f"{100 * sw['a_share']:.0f}%" if sw else "  —"
        mean = f"{sw['mean']:.1f}" if sw else "   —"
        best = f"{sw['best']}" if sw else "  —"
        corr = f"{100 * sw['corridor_rate']:.0f}%" if sw else "  —"
        print(f"  {sc.id:16} {sc.difficulty:>2} {z['econ_max']:>7} {pr:>15} "
              f"{a_share:>5} {mean:>6} {best:>6} {corr:>7}  {z['steps']:.0f} шагов")
        rows.append((sc, d))

    # Перекос по столам, названный числом.
    princ = [d["lines"]["principled_ru"]["overall"] for _, d in rows]
    spread = max(princ) - min(princ)
    best = max(rows, key=lambda r: r[1]["lines"]["principled_ru"]["overall"])[0].id
    worst = min(rows, key=lambda r: r[1]["lines"]["principled_ru"]["overall"])[0].id
    level = WARN if spread > 15 else OK
    rep.line("*", level, "перекос столов",
             f"одна и та же принципиальная линия даёт от {min(princ)} ({worst}) "
             f"до {max(princ)} ({best}) — размах {spread} баллов")

    # «Проверить оба направления» из ARCHITECTURE.md. Направление шкалы и есть сторона
    # стола: `lower_is_better` — игрок платит (покупатель, наниматель, арендатор),
    # `higher_is_better` — игрок просит (кандидат, подрядчик, заказчик гарантии).
    # Обе стороны обязаны быть и обязаны играться: движок считает уступку и
    # закрытие через знак, и перевёрнутый стол ломается молча.
    low = [sc.id for sc, _ in rows if sc.headline.dir == "lower_is_better"]
    high = [sc.id for sc, _ in rows if sc.headline.dir == "higher_is_better"]
    if not low or not high:
        rep.line("*", FAIL, "оба направления",
                 f"в банке только одно направление: ↓{len(low)} ↑{len(high)}")
    else:
        rep.line("*", OK, "оба направления",
                 f"игрок платит на {len(low)} столах ({', '.join(low)}), "
                 f"просит на {len(high)} ({', '.join(high)}); "
                 "принципиальная и агрессивная сыграны на каждом")

    caps = [d["zopa"]["econ_max"] for _, d in rows]
    unreachable = [(sc, d) for sc, d in rows if not d["zopa"]["target_reachable"]]
    if unreachable:
        # Что потолок экономики значит В ГРЕЙДЕ. `overall = 0.4·эк + 0.25·от +
        # 0.35·тех`, и при отношениях 100 требуемая техника считается точно.
        need = []
        for sc, d in unreachable:
            tech = (85 - 0.4 * d["zopa"]["econ_max"] - 25) / 0.35
            best_tech = d["sweep"]["best_technique"] if d.get("sweep") else None
            need.append(f"{sc.id}: A требует техники ≥ {tech:.0f}"
                        + (f" (лучшая измеренная на столе {best_tech})" if best_tech else ""))
        rep.line("*", WARN, "потолок экономики",
                 f"цель недостижима на {len(unreachable)} из {len(rows)} столов "
                 f"({', '.join(sc.id for sc, _ in unreachable)}): потолок economic "
                 f"{min(caps)}–{max(caps)}, потому что мерка там — лучшее доступное, "
                 f"а не цель (engine.best_available). " + "; ".join(need))
    else:
        rep.line("*", OK, "потолок экономики", "цель достижима на всех столах")

    if not quick:
        diffs = [float(sc.difficulty) for sc, _ in rows]
        means = [d["sweep"]["mean"] for _, d in rows]
        ashare = [d["sweep"]["a_share"] for _, d in rows]
        rho_mean = _spearman(diffs, means)
        rho_a = _spearman(diffs, ashare)
        # Ожидание: чем выше difficulty, тем НИЖЕ средний балл и доля A, то есть
        # корреляция обязана быть отрицательной и заметной.
        level = OK if rho_mean <= -0.5 else (WARN if rho_mean <= -0.2 else FAIL)
        rep.line("*", level, "difficulty ↔ замер",
                 f"ранговая корреляция сложности со средним баллом {rho_mean:+.2f}, "
                 f"с долей A {rho_a:+.2f} "
                 f"(ждём заметно отрицательную: точки на карточке обязаны "
                 f"что-то значить)")
        # Корреляция говорит «в целом сходится» и молчит о том, ГДЕ не сходится.
        # Инверсия — это стол, который заявлен легче соседа, а измерен труднее.
        order = sorted(rows, key=lambda r: r[1]["sweep"]["mean"])
        inversions = []
        for i, (a, da) in enumerate(order):
            for b, db in order[i + 1:]:
                if a.difficulty < b.difficulty:
                    inversions.append(
                        f"{a.id} (d={a.difficulty}, {da['sweep']['mean']:.1f}) труднее "
                        f"{b.id} (d={b.difficulty}, {db['sweep']['mean']:.1f})")
        print("\n  измеренный порядок трудности (по среднему баллу подмножеств):")
        for sc, d in order:
            print(f"    {d['sweep']['mean']:5.1f}  {sc.id:16} заявлено d={sc.difficulty}")
        if inversions:
            rep.line("*", WARN, "инверсии сложности",
                     f"{len(inversions)}: " + "; ".join(inversions))
        else:
            rep.line("*", OK, "инверсии сложности", "заявленный порядок совпал с измеренным")


# -----------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--only", action="append", help="только эти столы")
    ap.add_argument("--quick", action="store_true",
                    help="без перебора подмножеств (инвариант 1 не проверяется)")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--force", action="store_true",
                    help="считать даже при несошедшейся калибровке (для правок баланса, "
                         "когда зеркала ещё не перегенерированы)")
    args = ap.parse_args()

    rep = Report()
    print("\n═══ КАЛИБРОВКА ПРИБОРА ═══\n")
    ok, bad = calibrate()
    if ok:
        print(f"  ✓ {len(SCORES['principled'])} принципиальных + "
              f"{len(SCORES['ladder'])} партий лестницы воспроизведены "
              f"балл в балл по {len(_CALIBRATION_FIELDS)} полям")
    else:
        print(f"  ✗ ПРИБОР СЛОМАН: {len(bad)} расхождений с games.scores.json")
        for b in bad[:12]:
            print(f"      {b}")
        if not args.force:
            print("\n  Считать нечего: прибор играет не ту игру, которую играет продукт.\n"
                  "  Если баланс менялся намеренно — сперва tools/gen_game_scores.py, "
                  "потом сюда.\n")
            return 2

    ids = args.only or [s.id for s in SCENARIOS]
    data: dict[str, dict] = {}
    for sc in SCENARIOS:
        if sc.id not in ids:
            continue
        print(f"\n═══ {sc.id}  ({sc.icon} d={sc.difficulty} · "
              f"{sc.headline.dir} · {sc.counterpart.style} · "
              f"{sc.counterpart.name['ru']}) ═══\n")
        check_bilingual(sc, rep)
        check_interests_shape(sc, rep)
        check_keywords_survive_norm(sc, rep)
        zopa = check_zopa(sc, rep)
        check_briefing(sc, rep)
        check_batna(sc, rep)
        check_tradeoffs(sc, rep)
        check_faces(sc, rep)
        check_interest_reach(sc, rep)
        lines = check_two_lines(sc, rep)
        sw = None if args.quick else sweep(sc, rep)
        data[sc.id] = {"zopa": zopa, "lines": lines, "sweep": sw}

    if len(data) > 1:
        summary(data, rep, args.quick)

    print("\n═══ ИТОГ ═══\n")
    print(f"  проверок: {len(rep.rows)} · провалов: {len(rep.failures)} · "
          f"замечаний: {len(rep.warnings)}")
    for scenario, _, check, text in rep.failures:
        print(f"  ✗ {scenario:16} {check:22} {text}")
    for scenario, _, check, text in rep.warnings:
        print(f"  · {scenario:16} {check:22} {text}")
    print()

    if args.json:
        print(json.dumps({"calibrated": ok, "data": data,
                          "failures": [list(r) for r in rep.failures],
                          "warnings": [list(r) for r in rep.warnings]},
                         ensure_ascii=False, indent=1))
    return 1 if rep.failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
