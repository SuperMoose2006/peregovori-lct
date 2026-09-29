"""_check.py — проверка материалов уроков: форма, язык и ДВИЖОК.

Запуск: `cd services/gateway && .venv/bin/python -m app.course.lessons._check`.
Печатает время чтения каждого урока и все найденные дефекты; код выхода 1, если
дефект есть. С именами файлов (`... _check foundations_1 spin_ladder_4`)
проверяет только их. При подключении каталога к курсу это же становится тестом
(см. README.md рядом): `problems()` обязан вернуть пустой список.

ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ.

* Скелет. Шесть частей урока — не пожелание: 3–5 фраз, 2–3 ошибки, у каждой
  границы приёма есть «что делать вместо», у диалога есть и плохая, и хорошая
  ветка.
* Движок. Каждая фраза и каждая реплика игрока в диалоге прогоняются через
  `analyze()` на обоих языках: заявленные приёмы обязаны найтись. Хорошая
  реплика НЕ смеет читаться как грубость, ультиматум, уступка или закрытие
  сделки, если урок этого не заявил: «Ок, давайте обсудим сроки» движок читает
  как уступку, «договорились обсудить» — как рукопожатие на чужой цене. Не смеет
  она и класть на стол вашу цену хуже вашей же красной линии: движок берёт
  ПЕРВОЕ число реплики, и «цифру 1200 я услышал, но…» становится вашим
  предложением 1200. Вопрос с пометкой `reveals` обязан вскрыть интерес на
  столе урока — иначе урок учит вопросу, на который в игре придёт переспрос и
  +5 вместо +24.
* Язык. Ни одного эмодзи (требование владельца), ни одного оборота-воды из
  списка ниже, в английской половине нет кириллицы, чужие собеседники не
  названы по имени.
* Объём. Урок читается за три-пять минут; считаем по 180 слов в минуту.
"""

from __future__ import annotations

import importlib
import re
import sys

from app.course.blocks import BLOCKS
from app.course.lessons import load_all
from app.course.lessons._model import Dialog, LessonMaterial, Loc
from app.course.simulate import seeded
from app.engine.engine import _plausible_offer, apply_move, create_session
from app.engine.scenarios import MIRRORS, SCENARIOS, by_id
from app.engine.techniques import analyze

LANGS = ("ru", "en")

#: Приёмы, которые в хорошей реплике появляться не смеют, если их не заявили.
#: Каждый из них стоит партии: грубость и ультиматум жгут доверие, уступка
#: отдаёт цену даром, `accept` закрывает сделку НА ЦЕНЕ ОППОНЕНТА.
DANGEROUS = frozenset({"hostile", "threat", "concession", "accept"})

#: Обороты, из-за которых коллега сказал «материалов нет». Список открытый.
WATER = {
    "ru": ("важно помнить", "в современном мире", "ключевым фактором",
           "ключевой фактор", "играет важную роль", "не секрет, что",
           "следует отметить", "необходимо понимать", "стоит отметить",
           "является неотъемлемой", "в наше время"),
    "en": ("it is important to remember", "in today's world", "in the modern world",
           "key factor", "plays an important role", "it goes without saying",
           "it is worth noting", "needless to say"),
}

#: Эмодзи и пиктограммы. Стрелки и математические знаки сюда не входят.
_EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]")
_CYRILLIC = re.compile("[А-Яа-яЁё]")

WORDS_PER_MINUTE = 180
MIN_WORDS, MAX_WORDS = 3 * WORDS_PER_MINUTE - 140, 5 * WORDS_PER_MINUTE + 100


def _names() -> dict[str, tuple[str, str]]:
    """Собеседник каждого стола: русская основа и английское имя.

    Правило основы то же, что в `tests/test_course_bank.py`: срезать конечную
    гласную, чтобы «Наталье» и «Натальи» ловились вместе с «Натальей».
    """
    out = {}
    for sc in (*SCENARIOS, *MIRRORS):
        ru = sc.counterpart.name["ru"].split(",")[0].strip()
        en = sc.counterpart.name["en"].split(",")[0].strip()
        out[sc.id] = (ru[:-1] if ru[-1] in "аяйь" else ru, en)
    return out


def _locs(m: LessonMaterial) -> list[Loc]:
    """Все двуязычные строки урока — в порядке чтения."""
    d = m.dialog
    out: list[Loc] = [m.technique, m.why, m.core]
    for p in m.phrases:
        out.append(p.text)
        if p.when:
            out.append(p.when)
    out.append(d.setup)
    out += [line.text for line in (*d.opening, *d.bad)]
    out.append(d.bad_why)
    out += [line.text for line in d.good]
    out.append(d.good_why)
    for x in m.mistakes:
        out += [x.title, x.why]
    for x in m.limits:
        out += [x.when, x.instead]
    return out


def word_count(m: LessonMaterial, lang: str) -> int:
    return sum(len(loc.get(lang, "").split()) for loc in _locs(m))


def minutes(m: LessonMaterial, lang: str) -> float:
    return word_count(m, lang) / WORDS_PER_MINUTE


def _form(m: LessonMaterial) -> list[str]:
    out = []
    if not 3 <= len(m.phrases) <= 5:
        out.append(f"фраз {len(m.phrases)}, нужно 3–5")
    if not 2 <= len(m.mistakes) <= 3:
        out.append(f"ошибок {len(m.mistakes)}, нужно 2–3")
    if not 1 <= len(m.limits) <= 3:
        out.append(f"границ {len(m.limits)}, нужно 1–3")
    d = m.dialog
    for name, branch in (("bad", d.bad), ("good", d.good)):
        if not any(line.who == "you" for line in branch):
            out.append(f"в ветке {name} нет ни одной вашей реплики")
    for line in (*d.opening, *d.bad, *d.good):
        if line.who not in ("you", "them"):
            out.append(f"реплика с непонятным автором {line.who!r}")
    for i, loc in enumerate(_locs(m)):
        for lang in LANGS:
            if not isinstance(loc.get(lang), str) or not loc[lang].strip():
                out.append(f"строка №{i}: нет текста на {lang}")
    lessons = {(b.id, l.idx) for b in BLOCKS for l in b.lessons}
    if m.key not in lessons:
        out.append(f"урока {m.key} нет в blocks.py")
    if by_id(m.scenario_id) is None:
        out.append(f"стола {m.scenario_id} нет в scenarios.py")
    return out


def _language(m: LessonMaterial) -> list[str]:
    out = []
    names = _names()
    allowed = {m.scenario_id, *m.also_tables}
    for loc in _locs(m):
        for lang in LANGS:
            text = loc.get(lang, "")
            if _EMOJI.search(text):
                out.append(f"эмодзи ({lang}): {text[:60]!r}")
            low = text.lower()
            for phrase in WATER[lang]:
                if phrase in low:
                    out.append(f"вода «{phrase}» ({lang}): {text[:60]!r}")
            if lang == "en" and _CYRILLIC.search(text):
                out.append(f"кириллица в английской половине: {text[:60]!r}")
            for sid, (ru_stem, en_name) in names.items():
                if sid in allowed:
                    continue
                if re.search(ru_stem, text) or re.search(rf"\b{en_name}\b", text):
                    out.append(f"назван чужой собеседник {en_name} ({sid}), "
                               f"а стол урока {m.scenario_id}: {text[:60]!r}")
    return out


#: Приёмы, при которых число реплики ложится на стол как ВАША цена
#: (то же условие, что в `engine.apply_move`).
_PRICING = frozenset({"offer", "anchor", "concession", "accept", "tradeoff"})


def _priced_beyond_red_line(scenario_id: str, text: str) -> float | None:
    """Цена, которую реплика кладёт на стол, если она хуже вашей красной линии.

    Ловит то, что не видно глазами: движок берёт ПЕРВОЕ число реплики, и
    «цифру 1200 я услышал, но цены на такие машины…» записывает вам предложение
    1200 — при красной линии 1130. Реплика против якоря сама принимает якорь.
    """
    a = analyze(text)
    if a.number is None or not _PRICING & set(a.moves):
        return None
    sc = by_id(scenario_id)
    priced = _plausible_offer(sc, a.number)
    if priced is None:
        return None
    lower_better = sc.headline.dir == "lower_is_better"
    worse = priced > sc.player_reservation if lower_better else priced < sc.player_reservation
    return priced if worse else None


def _moves_problems(where: str, text: str, lang: str, expect: tuple[str, ...],
                    good: bool, scenario_id: str) -> list[str]:
    a = analyze(text)
    out = [f"{where} ({lang}): движок не видит {mv}, видит {a.moves}: {text!r}"
           for mv in expect if mv not in a.moves]
    if good:
        bad = sorted((DANGEROUS - set(expect)) & set(a.moves))
        if bad:
            out.append(f"{where} ({lang}): хорошая реплика читается как {bad}: {text!r}")
        priced = _priced_beyond_red_line(scenario_id, text)
        if priced is not None:
            out.append(f"{where} ({lang}): хорошая реплика кладёт на стол вашу цену "
                       f"{priced:g} — хуже вашей красной линии: {text!r}")
    return out


def _engine(m: LessonMaterial) -> list[str]:
    out = []
    for i, p in enumerate(m.phrases, 1):
        for lang in LANGS:
            text = p.text[lang]
            out += _moves_problems(f"фраза {i}", text, lang, p.moves, good=True,
                                   scenario_id=m.scenario_id)
            if p.reveals:
                sess = create_session(m.scenario_id, lang)
                r = apply_move(sess, analyze(text), text)
                if r.reaction != "opened_up":
                    out.append(f"фраза {i} ({lang}): вопрос не вскрыл интерес на столе "
                               f"{m.scenario_id} (реакция {r.reaction}): {text!r}")
    out += _dialog(m.scenario_id, m.dialog)
    return out


def _dialog(scenario_id: str, d: Dialog) -> list[str]:
    out = []
    for name, branch in (("плохая", d.bad), ("хорошая", d.good)):
        good = name == "хорошая"
        for lang in LANGS:
            sess = seeded(scenario_id, lang, d.state)
            for n, line in enumerate((*d.opening, *branch), 1):
                if line.who != "you":
                    continue
                text = line.text[lang]
                where = f"диалог, {name} ветка, реплика {n}"
                out += _moves_problems(where, text, lang, line.moves,
                                       good=good or line in d.opening,
                                       scenario_id=scenario_id)
                sess.turn += 1
                r = apply_move(sess, analyze(text), text)
                if line.reveals and r.reaction != "opened_up":
                    out.append(f"{where} ({lang}): вопрос не вскрыл интерес "
                               f"(реакция {r.reaction}): {text!r}")
            if good and sess.state.status == "breakdown":
                out.append(f"диалог, хорошая ветка ({lang}): партия сорвалась")
    return out


def problems_of(m: LessonMaterial) -> list[str]:
    out = _form(m) + _language(m) + _engine(m)
    words = word_count(m, "ru")
    if not MIN_WORDS <= words <= MAX_WORDS:
        out.append(f"объём {words} слов по-русски — это {words / WORDS_PER_MINUTE:.1f} мин, "
                   f"нужно {MIN_WORDS}–{MAX_WORDS}")
    return out


def problems() -> list[str]:
    """Все дефекты всех материалов каталога, с ключом урока в начале строки."""
    out = []
    for key, m in sorted(load_all().items()):
        out += [f"{key[0]}/{key[1]}: {p}" for p in problems_of(m)]
    return out


def missing() -> list[tuple[str, int]]:
    """Уроки программы, к которым материала ещё нет."""
    have = load_all()
    return [(b.id, l.idx) for b in BLOCKS for l in b.lessons if (b.id, l.idx) not in have]


def _only(names: list[str]) -> int:
    """Проверить только названные файлы, не трогая остальные.

    Недописанный соседний урок с синтаксической ошибкой роняет `load_all()`, а
    вместе с ним — проверку всего каталога. Пока уроки пишут параллельно, каждый
    проверяет своё.
    """
    found = 0
    for name in names:
        m = importlib.import_module(f"app.course.lessons.{name.removesuffix('.py')}").MATERIAL
        print(f"{m.block}/{m.lesson:<3} ru {word_count(m, 'ru'):>4} сл. "
              f"{minutes(m, 'ru'):.1f} мин · en {word_count(m, 'en'):>4} w. · "
              f"{m.technique['ru']}")
        for p in problems_of(m):
            print("  ДЕФЕКТ", p)
            found += 1
    return 1 if found else 0


def main() -> int:
    if len(sys.argv) > 1:
        return _only(sys.argv[1:])
    have = load_all()
    for key, m in sorted(have.items(), key=lambda kv: (
            [b.id for b in BLOCKS].index(kv[0][0]), kv[0][1])):
        print(f"{key[0]}/{key[1]:<3} ru {word_count(m, 'ru'):>4} сл. {minutes(m, 'ru'):.1f} мин · "
              f"en {word_count(m, 'en'):>4} w. {minutes(m, 'en'):.1f} min · "
              f"{m.technique['ru']}")
    gaps = missing()
    print(f"\nматериалов {len(have)}, уроков без материала {len(gaps)}")
    found = problems()
    for p in found:
        print("  ДЕФЕКТ", p)
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
