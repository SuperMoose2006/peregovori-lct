"""Документация против кода: устаревший документ — дефект, который никто не гоняет.

Начиналось с одного: ссылка на документ, которого нет, хуже отсутствия ссылки.
Пять мест в коде ссылались на `docs/modalities.md` как на источник правила про
оценку, и файла не было — инвариант ссылался сам на себя, а читатель видел
аккуратную ссылку и верил, что где-то лежит разбор.

Дальше выяснилось, что это частный случай общей беды. Документ не падает, его не
запускают, и расходится он с кодом МОЛЧА: страница выглядит одинаково
правдоподобно и когда она права, и когда врёт. Поэтому сюда переехало всё, что о
документации можно СПРОСИТЬ У КОДА, а не проверить глазами:

* ссылки на документы и снимки существуют;
* объём курса, набор слоёв, число столов и кампаний совпадают с банком и движком;
* деревья пакетов в README и CLAUDE.md называют все пакеты;
* ловушка `npx tsc --noEmit` описана, пока она есть, и не описана, когда исчезнет;
* КОМАНДА В ДОКУМЕНТЕ ЗАПУСКАЕТСЯ — `make preflight --live` четыре месяца стоял
  в правилах и выходил с нулём, ничего не делая;
* список событий протокола совпадает с закрытыми кортежами `realtime/events.py`;
* ни один документ не обещает сокета, которого гейтвей не открывает;
* словарь реакций движка назван целиком (их одиннадцать, а доклад писал «девять»);
* оба списка инвариантов — в CLAUDE.md и в докладе — это ОДИН список;
* режимы, где семантического судьи нет, названы списком, а не литерой;
* число миллисекунд подтверждено либо замером, либо константой конвейера.

ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. Свежести снимков и абсолютных размеров файлов: прибор,
краснеющий на исправном, обходится дороже пропущенной находки — по нему идут
чинить то, что работает, и в итоге перестают читать. По той же причине команды
ищутся только в блоках ```: в прозе про сломанную команду пишут именно её имя.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

#: Где ищем ссылки. Сборочные каталоги и чужой код не наши, их не судим.
_SKIP = {"node_modules", "dist", ".git", ".venv", "__pycache__", "vendor",
         ".upstream", ".claude", "dist-mock", "legacy-node"}
_SUFFIXES = {".py", ".ts", ".tsx", ".md", ".css"}

_LINK = re.compile(r"docs/[A-Za-z0-9_.-]+\.md")


def _sources():
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix not in _SUFFIXES:
            continue
        if any(part in _SKIP for part in path.parts):
            continue
        yield path


def test_every_doc_reference_resolves():
    missing: dict[str, list[str]] = {}
    for path in _sources():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for ref in set(_LINK.findall(text)):
            if not (ROOT / ref).exists():
                missing.setdefault(ref, []).append(str(path.relative_to(ROOT)))

    assert not missing, "ссылки на несуществующие документы:\n" + "\n".join(
        f"  {ref} ← {', '.join(sorted(where))}" for ref, where in sorted(missing.items()))


def test_the_layer_invariant_has_a_written_source():
    """Именно этот документ — тот, на который ссылается правило про оценку.

    Якорем была фраза «Экзамен фиксирует слои выключенными». Она перестала быть
    полной, когда зачётных режимов стало два (`protocol.REPRODUCIBLE_MODES`:
    экзамен и капстоун курса), поэтому якорь теперь — «фиксирует слои
    выключенными» без имени режима, а список режимов сверяет отдельный тест
    ниже. Якорь, привязанный к одному режиму, старел бы вместе с ним.
    """
    doc = ROOT / "docs" / "modalities.md"
    assert doc.exists()
    text = doc.read_text(encoding="utf-8")
    assert "score_session" in text
    assert "фиксирует слои выключенными" in text
    #: То же правило и в правилах репозитория: читатель CLAUDE.md не обязан
    #: открывать docs/, чтобы узнать, что слоёв на зачёте не бывает.
    assert "фиксирует слои выключенными" in (ROOT / "CLAUDE.md").read_text(encoding="utf-8")


# --------------------------------------------------------------- числа курса

#: Где документация называет объём курса. Числа здесь ГНИЮТ первыми: банк
#: растёт, а «54 упражнения» остаётся в README, в докладе и в продуктовом
#: описании — и на демонстрации звучит цифра, которой уже нет.
_VOLUME_DOCS = ("README.md", "docs/demo.md", "docs/product.md", "docs/course.md")

_STALE = re.compile(r"(\d+)\s+(?:упражнени\w*|exercises)")


def test_documented_exercise_count_matches_the_bank():
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.course.bank import BANK

    real = len(BANK)
    wrong: list[str] = []
    for name in _VOLUME_DOCS:
        path = ROOT / name
        if not path.exists():
            continue
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for match in _STALE.finditer(line):
                if int(match.group(1)) != real:
                    wrong.append(f"{name}:{line_no} говорит {match.group(1)}, в банке {real}")

    assert not wrong, "объём курса в документации разошёлся с банком:\n  " + "\n  ".join(wrong)


def test_documented_layers_are_the_layers_that_exist():
    """Список слоёв в докладе обязан совпадать с реальным.

    Слой, забытый в документе, — это возможность, о которой никто не узнает;
    слой, оставшийся в документе после удаления, — обещание, которого продукт
    не выполняет. Оба видны только сверкой, потому что таблица выглядит
    одинаково правдоподобно в обоих случаях.
    """
    import dataclasses
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.realtime.session import Layers

    doc = (ROOT / "docs" / "product.md").read_text(encoding="utf-8")
    #: Как слой называется в таблице докладной записки.
    names = {"probe": "Читай лицо", "voice": "Голосом", "camera": "Камера",
             "avatar": "Лицо оппонента", "pokerface": "Покерфейс"}

    real = {f.name for f in dataclasses.fields(Layers)}
    assert real == set(names), (
        "список слоёв изменился — обновите и таблицу в docs/product.md, "
        f"и этот тест: {sorted(real ^ set(names))}")
    for layer, title in names.items():
        assert title in doc, f"слой «{layer}» ({title}) не назван в docs/product.md"


def test_documented_table_and_campaign_counts_are_real():
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.engine.campaigns import CAMPAIGNS
    from app.engine.scenarios import SCENARIOS

    doc = (ROOT / "docs" / "product.md").read_text(encoding="utf-8")
    words = {8: "восемь", 9: "девять", 2: "Две", 4: "четыре"}
    assert words[len(SCENARIOS)] in doc, f"столов {len(SCENARIOS)}, а в докладе иначе"
    assert words[len(CAMPAIGNS)] in doc, f"кампаний {len(CAMPAIGNS)}, а в докладе иначе"
    for c in CAMPAIGNS:
        assert len(c.stages) == 4, f"{c.id}: актов {len(c.stages)}, доклад обещает четыре"


def test_maps_of_the_repo_list_every_backend_package():
    """Оба дерева — в README и в CLAUDE.md — обязаны называть все пакеты.

    `course/` не был перечислен ни в одном ни дня с момента появления — а это
    девять блоков, банк упражнений и половина продукта. Дерево, которому можно
    не верить, хуже отсутствующего: читатель считает его картой и не идёт
    смотреть сам. CLAUDE.md здесь важнее README: по нему ориентируется тот, кто
    правит код.
    """
    app = ROOT / "services" / "gateway" / "app"
    packages = {d.name for d in app.iterdir()
                if d.is_dir() and (d / "__init__.py").exists() and d.name != "vendor"}
    for name in ("README.md", "CLAUDE.md"):
        text = (ROOT / name).read_text(encoding="utf-8")
        missing = sorted(pkg for pkg in packages if f"{pkg}/" not in text)
        assert not missing, f"{name} не называет пакеты: {missing}"


def test_readme_does_not_advertise_routes_that_were_removed():
    """Ручка /ws удалена вместе с протоколом «запрос-ответ»."""
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "WS /ws" not in readme, "README обещает удалённую ручку /ws"


def test_the_typecheck_trap_is_written_down():
    """`npx tsc --noEmit` во фронтенде всегда возвращает ноль — и это ловушка.

    Корневой tsconfig.json содержит `"files": []` и только ссылки на проекты,
    поэтому в обычном (не `-b`) режиме компилятору не передан ни один файл: он
    отвечает «чисто» на код, который не собирается. На эту команду тянет руку у
    каждого, кто работал с другими репозиториями, а ошибка тихая.

    Тест сторожит две вещи сразу: что предупреждение не выпало из CLAUDE.md, и
    что причина никуда не делась (появится в корневом конфиге настоящий список
    файлов — предупреждение станет ложью, и его надо будет убрать).
    """
    import json

    config = json.loads((ROOT / "frontend" / "tsconfig.json").read_text(encoding="utf-8"))
    trap_still_there = config.get("files") == [] and config.get("references")
    doc = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    warned = "npx tsc --noEmit" in doc and "npm run typecheck" in doc

    if trap_still_there:
        assert warned, "ловушка на месте, а предупреждения в CLAUDE.md нет"
    else:
        assert not warned, "ловушки больше нет — предупреждение стало ложью, уберите его"


def test_docs_do_not_reference_missing_screenshots():
    """Ссылка на несуществующий снимок — сломанная картинка в докладе.

    СВЕЖЕСТЬ снимков здесь НЕ проверяется, и это осознанно: сравнение по времени
    правки styles.css краснеет от любой, даже несвязанной правки оформления, и
    тест, который краснеет не по делу, приучает себя не читать. Свежесть
    напоминает `make preflight` — там она и нужна, перед показом.
    """
    import re

    referenced: set[str] = set()
    for doc in (ROOT / "docs").glob("*.md"):
        referenced |= set(re.findall(r"screenshots/([A-Za-z0-9_.-]+\.png)",
                                     doc.read_text(encoding="utf-8")))
    shots = ROOT / "docs" / "screenshots"
    missing = sorted(name for name in referenced if not (shots / name).exists())
    assert not missing, f"документация ссылается на несуществующие снимки: {missing}"


# ------------------------------------------------------- команды, которых нет

#: Команда в документе — это обещание: читатель её КОПИРУЕТ. Сломанная команда
#: дороже отсутствующей ровно тем, чем сломанный прибор дороже отсутствующего:
#: по ней идут и получают ответ, которому верят.
#:
#: Живой случай, ради которого это написано: в CLAUDE.md четыре месяца стояло
#: `make preflight --live`. Цель `preflight` аргументов не принимала, поэтому
#: `--live` перехватывал сам `make`, печатал свою справку и выходил С НУЛЁМ —
#: команда выглядела успешной и не делала НИЧЕГО. Ни один тест на это не
#: смотрел, потому что тесты смотрят на код, а обещание стояло в тексте.
_MAKE_IN_CODE = re.compile(r"^\s*make ([a-z][a-z0-9-]*)(.*)$", re.MULTILINE)


def _makefile_targets() -> set[str]:
    text = (ROOT / "Makefile").read_text(encoding="utf-8")
    return set(re.findall(r"^([a-zA-Z][a-zA-Z0-9_-]*):", text, re.MULTILINE))


def _doc_code_regions(text: str) -> str:
    """ТОЛЬКО блоки ```: то, что копируют целиком, не читая вокруг.

    Проза и одиночные `обратные кавычки` пропускаются НАМЕРЕННО, и это не
    послабление, а условие полезности прибора. В прозе про сломанную команду
    пишут именно её имя — «`make preflight --live` съедает сам make» — то есть
    первым, на кого прибор наругался бы, оказался бы текст, объясняющий эту
    самую ошибку. Плюс в upstream-code-map.md лежит текст чужой лицензии со
    словами «make available» и «make it different». Прибор, краснеющий на
    исправном, обходится дороже пропущенной находки: по нему идут чинить то,
    что работает, и в итоге перестают читать.

    Исходный дефект жил ровно в блоке ``` в разделе «Команды» CLAUDE.md.
    """
    return "\n".join(re.findall(r"^```[a-z]*\n(.*?)^```", text, re.MULTILINE | re.DOTALL))


def test_make_commands_promised_by_docs_actually_run():
    targets = _makefile_targets()
    wrong: list[str] = []
    for name in ("CLAUDE.md", "README.md", *(f"docs/{p.name}" for p in (ROOT / "docs").glob("*.md"))):
        path = ROOT / name
        if not path.exists():
            continue
        region = _doc_code_regions(path.read_text(encoding="utf-8"))
        for match in _MAKE_IN_CODE.finditer(region):
            target = match.group(1) or match.group(3)
            tail = (match.group(2) or match.group(4) or "").strip()
            # Комментарий после команды — не аргумент.
            tail = tail.split("#", 1)[0].strip()
            if target not in targets:
                wrong.append(f"{name}: `make {target}` — такой цели в Makefile нет")
            elif tail and not tail.startswith(("ARGS=", "VAR=")):
                # `make preflight --live`: флаг съедает сам make, печатает свою
                # справку и выходит с нулём. Аргументы передаются через ARGS=.
                wrong.append(
                    f"{name}: `make {target} {tail}` — make перехватит «{tail}» "
                    f"как свой флаг или цель и выйдет с нулём, ничего не сделав")

    assert not wrong, "документация обещает команды, которые не работают:\n  " + "\n  ".join(wrong)


# ------------------------------------------------------------------ протокол

def test_documented_protocol_events_are_the_real_ones():
    """Раздел «Протокол» в CLAUDE.md — карта, по которой пишут клиентов.

    Событие, забытое в разделе, — возможность, о которой никто не узнает;
    событие, оставшееся после удаления, — обещание, которого сервер не
    выполняет. Оба вида расхождения выглядят одинаково правдоподобно, поэтому
    списки сверяются с ЗАКРЫТЫМИ кортежами `realtime/events.py`, а не глазами.
    """
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.realtime.events import CLIENT_EVENTS, SERVER_EVENTS

    doc = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    section = doc.split("## 🔌 Протокол")[1].split("\n---")[0]
    #: Раздел пишет пары одним именем: `judge.started|completed`. Сокращение
    #: механическое и однозначное, поэтому разворачивается здесь, а не
    #: запрещается там: заставлять документ писать длиннее ради прибора значит
    #: чинить документ под тест.
    section = re.sub(r"([a-z][a-z_.]*)\.([a-z_]+)\|([a-z_]+)", r"\1.\2 \1.\3", section)

    missing = [e for e in (*CLIENT_EVENTS, *SERVER_EVENTS) if e not in section]
    assert not missing, f"CLAUDE.md не называет события протокола: {missing}"

    #: `session.init` и прочие пишутся в тексте как `имя.событие`; ищем всё,
    #: что выглядит событием, и требуем, чтобы сервер его знал.
    named = set(re.findall(r"`([a-z]+\.[a-z_.]+)[ `{]", section))
    real = set(CLIENT_EVENTS) | set(SERVER_EVENTS)
    #: Не события: поля и файлы, названные в том же разделе.
    not_events = {"realtime.events", "response.output", "input.audio"}
    ghosts = sorted(named - real - not_events)
    assert not ghosts, f"CLAUDE.md обещает события, которых сервер не шлёт: {ghosts}"


def test_no_doc_advertises_a_websocket_route_the_gateway_does_not_serve():
    """Обобщение теста про `WS /ws` с README на ВСЮ документацию.

    Ручка `/ws` была удалена вместе с протоколом «запрос-ответ», и README про
    это узнал, а схема архитектуры в product.md — нет: она рисовала два сокета
    там, где остался один. Проверка ручки в одном файле сторожит один файл.
    """
    main = (ROOT / "services" / "gateway" / "app" / "main.py").read_text(encoding="utf-8")
    served = set(re.findall(r"@app\.websocket\(\"([^\"]+)\"\)", main))
    assert served, "в main.py не нашлось ни одного websocket-маршрута — тест ослеп"

    wrong: list[str] = []
    for path in [ROOT / "README.md", ROOT / "CLAUDE.md", *(ROOT / "docs").glob("*.md")]:
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for route in re.findall(r"\bWS (/[A-Za-z0-9_/]+)", line):
                if route not in served:
                    wrong.append(f"{path.relative_to(ROOT)}:{line_no} обещает WS {route}")

    assert not wrong, ("документация обещает сокеты, которых гейтвей не открывает "
                       f"(реальные: {sorted(served)}):\n  " + "\n  ".join(wrong))


# ------------------------------------------------------------------ реакции

def test_documented_reactions_are_the_engine_reactions():
    """Словарь реакций в докладе обязан совпадать с движковым.

    Реакций было девять, стало десять, теперь одиннадцать — и доклад всё это
    время писал «Девять реакций», перечисляя десять имён. Ошибка не украшение:
    именно реакцию слой «Читай лицо» просит человека угадать, и `probe_vague`
    (одиннадцатая) — та самая, на которой держится тезис «общий вопрос интерес
    не вскрывает». Слой на ней молчал, доклад её не называл, и обе беды жили
    ровно потому, что список нигде не сверялся.
    """
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.views import _MOODS

    real = set(_MOODS["ru"])
    assert set(_MOODS["en"]) == real, "русский и английский словари реакций разошлись"

    doc = (ROOT / "docs" / "product.md").read_text(encoding="utf-8")
    named = set(re.findall(r"`([a-z_]+)`", doc)) & (real | {"agreement"})

    missing = sorted(real - named)
    assert not missing, f"docs/product.md не называет реакции движка: {missing}"


# --------------------------------------------------------------- инварианты

def test_both_documents_carry_the_same_invariants():
    """Список инвариантов в CLAUDE.md и в докладе — один список, не два.

    В докладе их было восемь, в CLAUDE.md девять: правило «правильный ответ в
    упражнении обязан быть правильным в игре» жило только в одном из двух
    файлов. Инвариант, который знает половина читателей, — это инвариант,
    который нарушат вторые.

    Сверяются НОМЕРА и ЯКОРЯ, а не текст: формулировки в докладе длиннее
    намеренно, он объясняет, а CLAUDE.md предписывает.
    """
    #: Что обязано быть в каждом пункте обоих списков. Меняется инвариант —
    #: правится и якорь: заметить это здесь дешевле, чем в двух документах.
    anchors = {
        1: ("floor",), 2: ("A/B",), 3: ("overall",), 4: ("RU/EN",),
        5: ("без сети",), 6: ("score_session",), 7: ("оос",),
        8: ("на сервере",), 9: ("упражнении",),
    }

    def numbered(text: str) -> dict[int, str]:
        out: dict[int, str] = {}
        for line in text.splitlines():
            m = re.match(r"(\d)\. (.+)", line)
            if m:
                out[int(m.group(1))] = m.group(2)
        return out

    claude = numbered((ROOT / "CLAUDE.md").read_text(encoding="utf-8")
                      .split("## 🧩 Инварианты")[1].split("\n---")[0])
    product = numbered((ROOT / "docs" / "product.md").read_text(encoding="utf-8")
                       .split("### Инварианты")[1].split("###")[0])

    assert set(claude) == set(anchors), f"CLAUDE.md: инвариантов {sorted(claude)}"
    assert set(product) == set(claude), (
        "списки инвариантов разошлись — "
        f"в CLAUDE.md {sorted(claude)}, в docs/product.md {sorted(product)}")

    for n, words in anchors.items():
        for word in words:
            if word == "оос":            # «один и тот же ход» — фраза, не слово
                assert "тот же ход" in claude[n] and "тот же ход" in product[n], n
                continue
            assert word in claude[n], f"CLAUDE.md, инвариант {n}: нет «{word}»"
            assert word in product[n], f"docs/product.md, инвариант {n}: нет «{word}»"


# ---------------------------------------------- где судьи нет: список, не буква

def test_docs_name_every_mode_where_the_judge_is_switched_off():
    """«На зачёте семантического судьи нет» — обещание, которое надо сверять.

    Оно уже один раз оказалось шире правды: правило стояло литерой
    `game_mode == "exam"`, а капстоун блока уходил в партию другим режимом — и
    два решающих очка экзамена блока (порог 10 из 12, капстоун весит 2) считала
    партия с ЖИВЫМ судьёй. Документ при этом обещал обратное, и заметить это
    можно было только чтением двух файлов подряд.

    Поэтому сверяется СПИСОК: каждый режим из `REPRODUCIBLE_MODES` обязан быть
    назван в докладе, и у каждого судья обязан быть выключен на самом деле.
    Расширят список третьим режимом — тест назовёт документ, который об этом не
    узнал.
    """
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.orchestrator.judge import judge_enabled_for
    from app.protocol import REPRODUCIBLE_MODES

    #: Как режим называется в докладе. Пары ведутся руками намеренно: связь
    #: «литера протокола → слово продукта» нигде в коде не записана, и выдумать
    #: её тест не может.
    words = {"exam": "Экзамен", "drill": "апстоун"}
    assert set(words) == set(REPRODUCIBLE_MODES), (
        "список воспроизводимых режимов изменился — обновите и docs/product.md, "
        f"и этот тест: {sorted(set(words) ^ set(REPRODUCIBLE_MODES))}")

    doc = (ROOT / "docs" / "product.md").read_text(encoding="utf-8")
    assert "REPRODUCIBLE_MODES" in doc, (
        "доклад обещает «на зачёте судьи нет» литерой режима, а правило живёт "
        "списком: назовите список, иначе документ снова разойдётся с кодом")
    for mode, word in words.items():
        assert word in doc, f"режим «{mode}» не назван в docs/product.md"
        assert not judge_enabled_for(mode), (
            f"доклад обещает, что в режиме «{mode}» судьи нет, а он включается")

    #: ОБРАТНАЯ СТОРОНА, и без неё проверка выше бессмысленна: она была бы
    #: довольна судьёй, выключенным ВЕЗДЕ, — то есть продуктом без судьи.
    #: Спрашивать `judge_enabled_for("practice")` тут нельзя: `conftest.py`
    #: принудительно ставит `NEGO_AI=off`, и ответ был бы «выключен» в любом
    #: случае — утверждение без зубов. Проверяется поэтому само правило.
    assert "practice" not in REPRODUCIBLE_MODES, (
        "практика попала в воспроизводимые режимы — судьи не осталось нигде")
    assert "campaign" not in REPRODUCIBLE_MODES, (
        "акт кампании — не зачётная партия: репутация это вход, а не оценка")


# --------------------------------------------------- задержки: число и прибор

#: Где числу задержки разрешено иметь источник. `latency.md` — измеренные
#: `tools/bench_latency.py`; шапка `openai_speech.py` — разовый прогон пары
#: edge / OpenAI, у которого прибора нет и это там написано прямо.
_LATENCY_SOURCES = ("docs/latency.md",
                    "services/gateway/app/providers/tts/openai_speech.py")

#: Настроенная КОНСТАНТА — не замер, и требовать от неё прибора неправильно:
#: окно тишины в 900 мс не измеряли, его выбрали. Такому числу нужен другой
#: источник — оно обязано совпадать с кодом, и совпадение проверяется здесь же.
_CONSTANT_SOURCES = ("services/gateway/app/perception",
                     "services/gateway/app/realtime",
                     "services/gateway/app/orchestrator")

_MS = re.compile(r"(?<![\d.,])(\d{3,4}) мс")


def test_millisecond_figures_in_the_rules_come_from_a_measurement():
    """Число задержки, переписанное в CLAUDE.md руками, гниёт молча.

    Живой случай: в разделе про голос стояло «первые слова на экране за 1.3 с
    от начала реплики». Веха с таким именем в latency.md есть, и она равна
    1697 мс; 1.3 с — это ДРУГАЯ веха, первый токен реплики ОППОНЕНТА. Два
    измерения слиплись в одно предложение, и перепроверить его можно было
    только открыв оба файла.

    Правило репозитория гласит: числа в latency.md руками не правятся,
    разошлись с реальностью — перезамерить. Отсюда следствие для соседей:
    цитировать можно только то, что там (или в шапке рядом с константой) и
    правда написано.
    """
    sources = "\n".join((ROOT / name).read_text(encoding="utf-8") for name in _LATENCY_SOURCES)
    for pkg in _CONSTANT_SOURCES:
        for path in (ROOT / pkg).glob("*.py"):
            sources += "\n" + path.read_text(encoding="utf-8")
    known = set(re.findall(r"(?<![\d.,])(\d{3,4})\b", sources))

    orphans: list[str] = []
    for name in ("CLAUDE.md", "README.md", "docs/product.md"):
        text = (ROOT / name).read_text(encoding="utf-8")
        for line_no, line in enumerate(text.splitlines(), 1):
            for value in _MS.findall(line):
                if value not in known:
                    orphans.append(f"{name}:{line_no} — «{value} мс» нет ни в одном замере")

    assert not orphans, (
        "число миллисекунд не подтверждено ничем: его нет ни среди замеров "
        f"({', '.join(_LATENCY_SOURCES)}), ни среди констант конвейера "
        f"({', '.join(_CONSTANT_SOURCES)}):\n  " + "\n  ".join(orphans))
