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
* число миллисекунд подтверждено либо замером, либо константой конвейера;
* МОДЕЛЬ В ТАБЛИЦЕ — та, что подставит `providers/routing.py` (судью сняли
  замером с 3.5 на 2.5, и две таблицы разъехались между собой);
* объём курса — все ТРИ числа, а не одни упражнения: блоки и уроки двинул
  одиннадцатый блок, и сторожа у них не было;
* зеркальных столов столько, сколько записей в `scenarios.MIRRORS`;
* переменная окружения из документа КЕМ-ТО ЧИТАЕТСЯ (`OPENAI_BASE_URL` в
  примере `.env` не читал никто, и переставивший её на свой шлюз не узнал бы);
* раздел «Команды» называет все цели Makefile, помеченные `##` — живые проверки
  слоёв появились и в него не попали;
* число реакций рядом с их именами (§9 доклада писал «девять», §2 — «одиннадцать»);
* цвет токена совпадает со `styles.css` — опечатка в одном разряде переписывает
  вывод о контрасте;
* число, приписанное `docs/latency.md`, там и правда есть (719 мс пережило
  перезамер только в цитате);
* размер словаря приёмов, помеченный «сегодня»;
* у каждого инварианта назван ФАЙЛ ТЕСТА, и он существует;
* «четыре состояния» — ровно у тех слоёв, которым есть чему не подняться;
* конвенция STUB/MOCK/CONTRACT держится и на питоне, а не только во фронтенде.

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


def _prose() -> list[str]:
    """Все документы, за которые репозиторий отвечает, в устойчивом порядке.

    Правила, обзор и весь `docs/`. Список собирается, а не перечисляется, чтобы
    новый документ попадал под все проверки ниже сам: перечисленный руками, он
    попадал бы под них ровно до первого забытого имени — а забывают внести
    именно тот файл, который только что написали и ещё ни разу не сверяли.
    """
    return ["README.md", "CLAUDE.md",
            *(f"docs/{p.name}" for p in sorted((ROOT / "docs").glob("*.md")))]


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
            target = match.group(1)
            # Регулярное выражение имеет две группы. Пустой хвост команды
            # допустим; обращение к прежней четвёртой группе давало IndexError.
            tail = match.group(2).strip()
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
            m = re.match(r"(\d+)\. (.+)", line)   # `\d+`: с одной цифрой десятый пункт невидим
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


# ------------------------------------------------- модель на роль: имя и дефолт

#: Строка таблицы «роль → переменная → дефолт» в любом документе. Дефолт берём
#: только из backtick'ов: имя модели в прозе — это рассказ о выборе, а в
#: таблице — обещание «вот что запустится, если ничего не трогать».
_MODEL_ROW = re.compile(
    r"^\|[^|]+\|\s*`(NEGO_[A-Z_]+)`\s*\|\s*`([^`]+)`\s*\|", re.MULTILINE)


def test_documented_model_defaults_are_the_real_defaults():
    """Имя модели в таблице документа обязано быть тем, что подставит код.

    ЭТО УЖЕ РАЗЪЕХАЛОСЬ. Судью сняли с `google/gemini-3.5-flash-lite` замером
    (он оценивал русский объективный критерий медианой 10 из 100 — ниже
    `CRITERIA_EVENT_MIN`, то есть цена не двигалась), поставили
    `2.5-flash-lite`, и таблицы в двух файлах разъехались между собой: README
    успел, правила — нет. Заметить это можно было только положив рядом три
    файла, потому что обе строки выглядят одинаково правдоподобно.

    Цена ошибки не косметическая: по этой таблице человек ставит переменную
    окружения, а на демонстрации по ней отвечают, какой моделью говорит
    оппонент. Строка «дефолт» — единственное место, где документ обещает
    ПОВЕДЕНИЕ ПО УМОЛЧАНИЮ, и проверить его можно ровно одним способом —
    спросить у `providers/routing.py`.

    Сверяются ДЕФОЛТЫ, а не `model_for()`: переменная окружения, случайно
    оставшаяся в оболочке, не должна ни красить тест зелёным, ни красным.
    """
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.providers.routing import _DEFAULTS, _ENV

    #: Переменные, живущие не в `routing.py`: голосовой путь идёт через OpenAI
    #: отдельным поставщиком, и его дефолты лежат рядом с кодом, который их
    #: читает. Значение берётся из модуля, а не переписывается сюда.
    from app.perception.realtime_voice import MODEL as _REALTIME_ASR
    from app.providers.tts.openai_speech import MODEL as _OPENAI_TTS

    real = {env: _DEFAULTS[role] for role, env in _ENV.items()}
    real["NEGO_REALTIME_ASR_MODEL"] = _REALTIME_ASR
    real["NEGO_OPENAI_TTS_MODEL"] = _OPENAI_TTS

    wrong: list[str] = []
    seen: set[str] = set()
    for name in _prose():
        path = ROOT / name
        if not path.exists():
            continue
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for match in _MODEL_ROW.finditer(line + "\n"):
                env, documented = match.group(1), match.group(2).strip()
                seen.add(env)
                if env not in real:
                    wrong.append(f"{name}:{line_no} — переменной `{env}` в коде нет вовсе")
                elif documented != real[env]:
                    wrong.append(f"{name}:{line_no} — `{env}` обещает `{documented}`, "
                                 f"код подставит `{real[env]}`")

    assert not wrong, "таблица моделей разошлась с `providers/routing.py`:\n  " + "\n  ".join(wrong)

    #: Обратная сторона: роль, которой нет ни в одной таблице, — это модель,
    #: молча выбранная за читателя. Без этой половины тест был бы доволен
    #: документом, где таблицы нет совсем.
    forgotten = sorted(set(real) - seen)
    assert not forgotten, (
        "роль есть в коде, но ни один документ не называет её модель: "
        f"{forgotten}")


# -------------------------------------------- объём курса: блоки и уроки тоже

#: Числительные, которыми документы пишут количество блоков. Нужен именно
#: словарь: «Одиннадцать блоков» человек читает лучше, чем «11 блоков», и
#: заставлять документ писать цифрой ради прибора значило бы чинить документ
#: под тест.
#: Падежные формы перечислены наравне с именительным: русский текст ставит
#: числительное в тот падеж, которого требует фраза («у ДВУХ слоёв», «из
#: ОДИННАДЦАТИ блоков»), и прибор, знающий только именительный, краснел бы на
#: правильном русском — проверено на «у двух слоёв их три».
_NUMERALS = {
    1: ("один", "одна", "одного", "одной"),
    2: ("два", "две", "двух"), 3: ("три", "трёх", "трех"),
    4: ("четыре", "четырёх", "четырех"), 5: ("пять", "пяти"),
    6: ("шесть", "шести"), 7: ("семь", "семи"), 8: ("восемь", "восьми"),
    9: ("девять", "девяти"), 10: ("десять", "десяти"),
    11: ("одиннадцать", "одиннадцати"), 12: ("двенадцать", "двенадцати"),
    13: ("тринадцать", "тринадцати"),
}

#: «<числительное> блоков, 47 уроков» — ровно та фраза, которой документы
#: объявляют объём. Хвост «, NN уроков» здесь обязателен НАМЕРЕННО: без него
#: регулярка ловила бы и рассказ о прошлом («Десять блоков учили тому, что
#: происходит ЗА столом» — верное предложение про то, как было до
#: одиннадцатого блока), и тест краснел бы на исправном тексте.
_VOLUME = re.compile(r"([А-Яа-яЁё]+)\s+блок(?:ов|а)?,\s*(\d+)\s+урок(?:ов|а)?\b", re.IGNORECASE)

#: Одиночное «NN уроков» цифрой — во ВСЕХ падежных формах, которые даёт
#: русское число: «47 уроков», но «42 урока» и «41 урок». Первая редакция
#: знала только форму на «-ов» и молча пропускала правку 47 → 42, потому что
#: вместе с числом меняется окончание. Количество уроков словом документы не
#: пишут нигде; начнут — тест промолчит, и это честнее, чем гадать по падежам.
_LESSONS = re.compile(r"(?<![\d.,])(\d+)\s+урок(?:ов|а)?\b")


def test_documented_course_volume_counts_blocks_and_lessons_too():
    """Объём курса — три числа, а сторож стоял только у третьего.

    `test_documented_exercise_count_matches_the_bank` сверяет упражнения. Блоки
    и уроки не сверял никто — и это ровно те два числа, которые двинулись,
    когда появился одиннадцатый блок «Подготовка к столу»: десять блоков стало
    одиннадцать, сорок два урока — сорок семь. Фраза «Десять блоков, 42 урока»
    осталась бы в пяти файлах и звучала бы на показе, потому что выглядит она
    так же убедительно, как правда.

    Проверяются ОБА направления одной фразой: числительное перед «блоков» и
    цифра перед «уроков» берутся из одного предложения, поэтому документ,
    поправивший половину, краснеет так же, как не поправивший ничего.
    """
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.course.blocks import BLOCKS
    from app.course.bank import BANK

    blocks = len(BLOCKS)
    lessons = sum(len(b["lessons"]) if isinstance(b, dict) else len(b.lessons) for b in BLOCKS)

    #: Банк и карта блоков — два разных файла, и разъехаться они могут молча:
    #: упражнение, оставшееся в банке от удалённого урока, нигде не всплывёт.
    assert {e["block"] for e in BANK} == {
        (b["id"] if isinstance(b, dict) else b.id) for b in BLOCKS}, (
        "банк упражнений ссылается не на те блоки, что перечисляет blocks.py")
    assert len({(e["block"], e["lesson"]) for e in BANK}) == lessons, (
        "в банке упражнений уроков не столько, сколько в карте блоков")

    words = _NUMERALS.get(blocks, ())
    assert words, f"блоков стало {blocks} — добавьте числительное в _NUMERALS"

    wrong: list[str] = []
    checked = 0
    for name in _prose():
        path = ROOT / name
        if not path.exists():
            continue
        #: Документы переносят фразу через строку — склеиваем, иначе половина
        #: объявлений объёма невидима прибору.
        text = re.sub(r"\s+", " ", path.read_text(encoding="utf-8"))
        for match in _VOLUME.finditer(text):
            checked += 1
            if match.group(1).lower() not in words:
                wrong.append(f"{name}: «{match.group(1)} блоков», а блоков {blocks}")
            if int(match.group(2)) != lessons:
                wrong.append(f"{name}: «{match.group(2)} уроков», а уроков {lessons}")
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for value in _LESSONS.findall(line):
                if int(value) != lessons:
                    wrong.append(f"{name}:{line_no}: «{value} уроков», а уроков {lessons}")

    assert not wrong, "объём курса в документации разошёлся с картой блоков:\n  " + "\n  ".join(wrong)
    assert checked, ("ни один документ не объявляет объём курса фразой "
                     "«<N> блоков, <M> уроков» — прибор ослеп, поправьте регулярку")


# ------------------------------------------------------------ зеркальные столы

def test_documented_mirror_tables_are_the_real_ones():
    """«Обратная сторона стола» — режим, о котором документы говорят числом.

    Зеркал три, а столов девять, и это НЕ описка: на зеркало нужна вторая
    сторона с собственной персоной и лицами, поэтому их ровно столько, сколько
    нарисовано. Число «три» напечатано в докладе и в сценарии показа, а
    держится оно на длине списка `scenarios.MIRRORS` — то есть на строке кода,
    которую правит тот, кто добавляет четвёртое зеркало и о документах не
    вспомнит.

    Заодно проверяется то, ради чего список вообще отдельный: зеркала НЕ лежат
    в `SCENARIOS`. Их длина входит в арифметику «стола дня» (`daily.py` выбирает
    из библиотеки по дате), и попади зеркало в библиотеку — расписание стола дня
    сдвинулось бы у всех, кто уже видел завтрашний.
    """
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.engine.scenarios import SCENARIOS, MIRRORS

    library = {s.id for s in SCENARIOS}
    assert not (library & {m.id for m in MIRRORS}), (
        "зеркало попало в библиотеку столов — сдвинется расписание «стола дня»")
    for m in MIRRORS:
        origin = getattr(m, "mirror_of", "")
        assert origin in library, (
            f"зеркало {m.id} отражает стол «{origin}», которого в библиотеке нет")

    words = _NUMERALS.get(len(MIRRORS), ())
    assert words, f"зеркал стало {len(MIRRORS)} — добавьте числительное в _NUMERALS"

    #: Где документ вообще говорит о режиме. Якорь именно такой, а не по корню
    #: «зеркал»: слово перегружено — в `judge-reproducibility.md` «зеркалами»
    #: зовутся сверочные фикстуры, и «все пять зеркал» там верно.
    _CTX = re.compile(r"scenarios\.MIRRORS|зеркальн\w*\s+стол|Обратная сторона стола",
                      re.IGNORECASE)

    #: ЧИСЛО СЧИТАЕТСЯ ТОЛЬКО РЯДОМ С СЛОВОМ «ЗЕРКАЛО». Две редакции подряд
    #: пытались ловить его рядом со словом «стол» — и обе оказались негодными.
    #: «Стол» — центральное слово продукта: в тех же абзацах живут «девять
    #: столов библиотеки», «четыре стола кампании», «девять столов и четыре
    #: условия взаимно просты». Прибор либо пропускал находку, либо звал чинить
    #: исправное, а третьего при таком якоре не выходит.
    #:
    #: Поэтому якорь сужен до зеркальной лексики, а ДОКУМЕНТ приведён к форме,
    #: которую можно проверить: доклад писал «Столов три», теперь — «Зеркальных
    #: столов шесть». Это не подгонка текста под тест: число без указания, чего
    #: именно оно считает, читателю ровно так же двусмысленно, как прибору.
    #: `\w*`, а не список окончаний: родительный МНОЖЕСТВЕННОГО — «зеркал» —
    #: это голая основа без суффикса, и перечисление окончаний её теряло.
    #: Проверено: «Зеркал шесть» в README проходило мимо прибора молча.
    _MIRROR_WORD = r"зеркал\w*"
    _COUNT = re.compile(
        rf"(?:(?P<before>[А-Яа-яЁё]+)\s+{_MIRROR_WORD}(?:\s+стол\w*)?"
        rf"|{_MIRROR_WORD}(?:\s+стол\w*)?\s+(?P<after>[А-Яа-яЁё]+))",
        re.IGNORECASE)

    #: Сколько символов вокруг упоминания режима считается «про зеркала».
    _MIRROR_NEAR = 1000

    #: ЗАКОННЫХ ЧИСЕЛ ДВА, и оба осмысленны в одном абзаце: зеркал шесть, а
    #: библиотечных столов девять — «шесть из девяти» и есть довод режима.
    legal = {len(MIRRORS), len(SCENARIOS)}
    numerals = {w: n for n, words in _NUMERALS.items() for w in words}

    wrong: list[str] = []
    named = 0
    anchors = 0
    for name in _prose():
        path = ROOT / name
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        if "MIRRORS" in text or "Обратная сторона стола" in text:
            named += 1
        #: ОКНО, А НЕ АБЗАЦ: довод и ссылка на `scenarios.MIRRORS` стоят в
        #: разных абзацах одного раздела, и считать единицей абзац значит
        #: верить, что автор не нажмёт Enter.
        flat = re.sub(r"\s+", " ", text)
        for anchor in _CTX.finditer(flat):
            anchors += 1
            near = flat[max(0, anchor.start() - _MIRROR_NEAR):anchor.end() + _MIRROR_NEAR]
            for match in _COUNT.finditer(near):
                word = (match.group("before") or match.group("after") or "").lower()
                value = numerals.get(word)
                if value is not None and value not in legal:
                    wrong.append(
                        f"{name}: «{match.group(0).strip()}» — это {value}, "
                        f"а зеркал {len(MIRRORS)} при {len(SCENARIOS)} столах библиотеки")

    assert not wrong, "число зеркальных столов в документации неверно:\n  " + "\n  ".join(wrong)
    assert anchors, ("ни одно место в документах не описывает зеркальные столы — "
                     "прибор ослеп, поправьте контекстную регулярку")
    assert named, "ни один документ не называет режим «Обратная сторона стола»"


# ------------------------------------------- переменные окружения: имя и адрес

#: Имя переменной окружения продукта. Отрицательный просмотр назад обязателен:
#: без него `OPENTALKING_STT_OPENAI_BASE_URL` (переменная ЧУЖОГО процесса,
#: настоящая) читалась бы как наша `OPENAI_BASE_URL`, и прибор врал бы в обе
#: стороны сразу.
_ENV_NAME = re.compile(r"(?<![A-Z_])((?:NEGO|OPENROUTER|OPENAI)_[A-Z][A-Z0-9_]*)")

#: Где переменной положено читаться. `tools/` включён намеренно: прибор — тоже
#: код продукта, и переменная, которую читает только он, всё равно настоящая.
_ENV_READERS = ("services/gateway/app", "services/gateway/tools", "adapters")

#: Переменные, которые продукт НЕ читает и читать не должен, но называть
#: обязан. Исключение пишется словами и с причиной — иначе его дешевле «решить»
#: ослаблением регулярки, а ослабленный прибор молчит и про настоящие находки.
#:
#: ПОЧЕМУ НЕ «ИСКАТЬ ТОЛЬКО В БЛОКАХ ```». Так устроен сосед про `make`, и там
#: это верно: про сломанную команду в прозе пишут именно её имя. С переменными
#: наоборот — CLAUDE.md перечисляет `NEGO_JUDGE`, `NEGO_TURN_DETECT`,
#: `NEGO_HTTP_PASSWORD` строкой прозы, и прибор, читающий только блоки, не
#: увидел бы ни одной из них. Дешевле держать поимённый список мёртвых.
_ENV_ALLOWED_ABSENT: dict[str, str] = {
    "OPENAI_BASE_URL":
        "мёртвая, и README называет её ровно затем, чтобы это сказать: адрес "
        "шлюза — константа `_BASE_URL` в providers/openrouter/chat.py. Строка "
        "стояла в примере `.env` и молча ничего не делала. Оживёт (кто-нибудь "
        "прочитает её в chat.py) — уберите отсюда, и предупреждение в README "
        "станет ложью, которую надо будет убрать тоже",
}


def test_environment_variables_named_in_docs_are_read_by_the_code():
    """Переменная в документе — обещание «поставь это, и поведение изменится».

    ЖИВОЙ СЛУЧАЙ. README велел положить в `.env` строку
    `OPENAI_BASE_URL=https://openrouter.ai/api/v1` (пришла с `a7500c9`). Её не
    читает никто:
    `providers/openrouter/chat.py` держит адрес константой `_BASE_URL` и
    передаёт её в клиент явно. Строка не просто лишняя — она ВРЁТ в худшую
    сторону: человек, переставивший её на свой шлюз, получил бы запросы,
    по-прежнему уходящие в OpenRouter, и ни одной жалобы от продукта.

    Это тот же класс дефекта, что `make preflight --live`: команда, которая
    выглядит выполненной и не делает ничего. Разница лишь в том, что у флага
    хотя бы был выход с нулём, а у переменной нет и его.

    Проверяется ОДНА сторона — «названное существует». Обратная («всё, что
    код читает, названо») сюда не годится: у продукта есть внутренние ручки
    (`NEGO_CASINO_DIR`, `NEGO_STAND_URL`), которым место в коде, а не в
    правилах, и требовать их документации значило бы заставлять документ расти
    от каждой отладочной переменной.
    """
    read: set[str] = set()
    for pkg in _ENV_READERS:
        base = ROOT / pkg
        if not base.exists():
            continue
        for path in base.rglob("*.py"):
            if any(part in _SKIP for part in path.parts):
                continue
            read |= set(_ENV_NAME.findall(path.read_text(encoding="utf-8")))

    assert "NEGO_AI" in read, "прибор ослеп: в коде не нашлось даже `NEGO_AI`"

    #: Список исключений САМООЧИЩАЮЩИЙСЯ. Переменная, которую код начал читать,
    #: обязана уйти отсюда — иначе исключение переживёт свою причину и станет
    #: дырой, через которую тихо пройдёт следующая мёртвая переменная.
    revived = sorted(set(_ENV_ALLOWED_ABSENT) & read)
    assert not revived, (
        "переменную снова кто-то читает — уберите её из _ENV_ALLOWED_ABSENT, "
        f"и проверьте, не стало ли ложью предупреждение в документе: {revived}")

    orphans: list[str] = []
    for name in _prose():
        path = ROOT / name
        if not path.exists():
            continue
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for var in _ENV_NAME.findall(line):
                if var in read or var in _ENV_ALLOWED_ABSENT:
                    continue
                orphans.append(f"{name}:{line_no} — `{var}` не читает ни один файл продукта")

    assert not orphans, (
        "документация обещает переменные окружения, которые ни на что не влияют "
        f"(искали в {', '.join(_ENV_READERS)}):\n  " + "\n  ".join(sorted(set(orphans))))


#: Публичная цель — та, у которой в Makefile есть `## описание`. Так помечены
#: ровно те цели, которые предназначены человеку; `test-py`/`test-js` пометки не
#: несут, потому что их зовёт `test`, а не читатель.
_PUBLIC_TARGET = re.compile(r"^([a-z][a-z0-9_-]*):[^=]*##", re.MULTILINE)


def test_every_public_make_target_is_documented_somewhere():
    """Обратная сторона `test_make_commands_promised_by_docs_actually_run`.

    Тот тест ловит команду, которой нет в Makefile. Этот — цель, которой нет в
    документах, и это ровно тот дефект, что случился с живыми проверками слоёв:
    `preflight-voice`, `preflight-vision` и `preflight-layers` появились именно
    затем, чтобы голос и зрение можно было проверить ОДНОЙ КОМАНДОЙ, и раздел
    «Команды» в CLAUDE.md о них не узнал — они жили только в сценарии показа.
    Возможность, которую надо найти чтением Makefile, — это возможность,
    которой не пользуются.

    ПОЧЕМУ СПРАШИВАЕТСЯ ИМЕННО CLAUDE.md, А НЕ «ХОТЬ ОДИН ДОКУМЕНТ». Первая
    редакция требовала упоминания где угодно — и была довольна, потому что
    demo.md все три цели называл. То есть прибор молчал ровно про тот дефект,
    ради которого заводился. Раздел «Команды» в правилах — единственное место,
    которое ОБЪЯВЛЯЕТ СЕБЯ полным списком; неполный список хуже отсутствующего,
    потому что читатель принимает его за карту и дальше не идёт.

    Сверяются только помеченные `##` цели: пометка и есть заявление «это для
    человека». `test-py`/`test-js` её не несут, их зовёт `test`, а не читатель.
    """
    makefile = (ROOT / "Makefile").read_text(encoding="utf-8")
    public = set(_PUBLIC_TARGET.findall(makefile))
    assert public, "в Makefile не нашлось ни одной цели с `## описанием` — тест ослеп"

    rules = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    assert "## ▶️ Команды" in rules, "в CLAUDE.md пропал раздел «Команды»"
    section = rules.split("## ▶️ Команды")[1].split("\n---")[0]
    listed = set(re.findall(r"\bmake\s+([a-z][a-z0-9_-]*)", _doc_code_regions(section)))

    missing = sorted(public - listed)
    assert not missing, (
        "раздел «Команды» в CLAUDE.md объявляет себя списком команд, а этих "
        f"целей Makefile'а в нём нет: {missing}")

    #: Обратная сторона: цель, выпавшая из Makefile, но оставшаяся в списке,
    #: ловится соседним тестом (`..._promised_by_docs_actually_run`) — здесь она
    #: не проверяется намеренно, чтобы два прибора не спорили об одном.


#: «<числительное> реакций/реакции» — как документы называют размер словаря.
#:
#: Числительным фраза ограничена НАМЕРЕННО, и первая редакция на этом обожглась:
#: регулярка «любое слово + реакций» считала счётом «по реакции движка»,
#: «Покрытие реакций» и «Отображение реакции» — три попадания в исправный текст.
#: Прибор, краснеющий на верном, заставляет себя не читать, поэтому вопрос
#: задаётся только там, где перед словом действительно стоит число.
_COUNT_WORDS = {w for words in _NUMERALS.values() for w in words}
_REACTION_COUNT = re.compile(r"([А-Яа-яЁё]+)\s+реакци[йи]\b", re.IGNORECASE)


def test_documented_reaction_counts_match_the_engine():
    """Сосед сверяет ИМЕНА реакций, а рядом с ними стоит ЧИСЛО, и оно врало.

    `test_documented_reactions_are_the_engine_reactions` требует, чтобы доклад
    называл все одиннадцать реакций поимённо, — и он их называл. Но в §9 того
    же документа стояло «те же ДЕВЯТЬ реакций», то есть документ противоречил
    сам себе через пятьсот строк: §2 честно писал «Десять реакций на шкале
    теплоты… Одиннадцатая, `probe_vague`», а §9 обещал офлайн-ядру девять.
    Проверка имён этого не видела в принципе: имена были на месте, врало число.

    ЗАКОННЫХ ЧИСЕЛ ДВА, и это не послабление прибора, а устройство предмета.
    Шкала теплоты — `course.blocks.REACTION_LADDER`, по ней учат и по ней
    спрашивают в упражнениях, и на ней ДЕСЯТЬ состояний. Реакций у движка
    ОДИННАДЦАТЬ: `probe_vague` вне шкалы намеренно — она не «теплее» и не
    «холоднее», она означает «общий вопрос интерес не вскрыл», и на ней держится
    тезис продукта. Документ, назвавший любое третье число, ошибается.
    """
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.course.blocks import REACTION_LADDER
    from app.views import _MOODS

    moods = set(_MOODS["ru"])
    #: Ступень шкалы — кортеж «id, ярлык, …»; берём первый элемент, а строку
    #: пропускаем как есть, чтобы прибор пережил смену формы записи.
    ladder = [r if isinstance(r, str) else r[0] for r in REACTION_LADDER]
    assert set(ladder) < moods, (
        "шкала теплоты перестала быть подмножеством реакций движка — "
        f"лишние: {sorted(set(ladder) - moods)}")
    assert sorted(moods - set(ladder)) == ["probe_vague"], (
        "вне шкалы теплоты оказалась не только `probe_vague` — правило "
        f"«десять на шкале плюс переспрос» больше не описывает движок: "
        f"{sorted(moods - set(ladder))}")

    legal = {w for n in (len(ladder), len(moods)) for w in _NUMERALS.get(n, ())}
    assert legal, f"реакций {len(moods)}, шкала {len(ladder)} — пополните _NUMERALS"

    wrong: list[str] = []
    for name in _prose():
        path = ROOT / name
        if not path.exists():
            continue
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for match in _REACTION_COUNT.finditer(line):
                word = match.group(1).lower()
                if word not in _COUNT_WORDS or word in legal:
                    continue
                wrong.append(
                    f"{name}:{line_no} — «{match.group(0)}»: у движка реакций "
                    f"{len(moods)}, на шкале теплоты {len(ladder)}")

    assert not wrong, ("число реакций в документации разошлось с движком:\n  "
                       + "\n  ".join(wrong))


# ------------------------------------------------------ цвет: документ и токен

#: `--токен: #hex;` в объявлении темы. Берём только объявления, а не любое
#: шестнадцатеричное число в файле: цвет упоминается и в комментариях, где он
#: рассказывает историю, а не задаёт значение.
_CSS_TOKEN = re.compile(r"--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;")

#: `--токен` … `#hex` в одном предложении документа — то есть документ
#: УТВЕРЖДАЕТ значение токена, а не просто поминает цвет.
_DOC_TOKEN_CLAIM = re.compile(r"`--([a-z0-9-]+)`[^.\n]{0,80}?`(#[0-9a-fA-F]{3,8})`")


def test_colour_values_quoted_in_the_rules_are_the_values_in_the_stylesheet():
    """Опечатка в одном разряде цвета не видна глазом и меняет вывод о доступности.

    В CLAUDE.md стояло «`--brass` это тёмный `#3f8f00`». В `styles.css` токен
    равен `#387f00`. Разница в одном разряде, на глаз цвета неразличимы — а
    контраст под белым 4.09:1 против 5.0:1, то есть по одну сторону границы AA
    для обычного текста и по другую. Правило репозитория объясняет выбор цвета
    ЧЕРЕЗ КОНТРАСТ, поэтому неверный hex делает ложным весь довод, а не
    украшение.

    Сверяется первое (светлое) объявление токена: тёмная тема переопределяет
    те же имена намеренно, и требовать от документа обоих значений значило бы
    заставлять его пересказывать таблицу тем целиком.
    """
    css = (ROOT / "frontend" / "src" / "styles.css").read_text(encoding="utf-8")
    real: dict[str, str] = {}
    for token, value in _CSS_TOKEN.findall(css):
        real.setdefault(token, value.lower())
    assert "brass" in real, "в styles.css не нашлось токена --brass — тест ослеп"

    wrong: list[str] = []
    checked = 0
    for name in _prose():
        path = ROOT / name
        if not path.exists():
            continue
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for token, value in _DOC_TOKEN_CLAIM.findall(line):
                if token not in real:
                    wrong.append(f"{name}:{line_no} — токена `--{token}` в styles.css нет")
                    continue
                checked += 1
                if value.lower() != real[token]:
                    wrong.append(f"{name}:{line_no} — `--{token}` обещает `{value}`, "
                                 f"в styles.css `{real[token]}`")

    assert not wrong, "цвет в документации разошёлся с таблицей токенов:\n  " + "\n  ".join(wrong)
    assert checked, ("ни один документ не называет значение токена — прибор "
                     "ослеп, поправьте регулярку или уберите его")


#: Ссылка на документ замеров — в любом написании, каким её ставят в тексте.
_LATENCY_CITE = re.compile(r"(?:docs/)?latency\.md")

#: Сколько символов вокруг ссылки считается «рядом». Окно намеренно узкое:
#: абзац целиком захватывал бы соседние предложения с числами из ДРУГИХ
#: источников (сравнение edge / OpenAI берётся из шапки `openai_speech.py`, а
#: окно тишины — из константы конвейера), и прибор краснел бы на исправном.
_NEAR = 100

_MS_NEAR = re.compile(r"(?<![\d.,])(\d{2,5})\s*мс")


def test_numbers_attributed_to_the_latency_doc_are_actually_in_it():
    """Ссылка на замер — не украшение, а обещание «откройте и увидите».

    ЖИВОЙ СЛУЧАЙ. `docs/judge-reproducibility.md` писал настоящим временем:
    «`docs/latency.md` ОТВОДИТ на „судья прочитал + движок посчитал“ 719 мс».
    Числа 719 в latency.md нет ВООБЩЕ — оно осталось от прежнего судьи, а после
    перезамера веха равна 931 мс. Читатель, пошедший по ссылке проверить, не
    нашёл бы там ничего похожего.

    Дефект не косметический: на 719 стояла арифметика соседнего вывода («платить
    от половины до восьмидесяти процентов бюджета за усреднение»). От 931 те же
    добавки — треть и три пятых. Устаревший знаменатель тихо переписал вывод.

    ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ СОСЕДА. `..._figures_in_the_rules_come_from_a_measurement`
    спрашивает у трёх файлов, откуда у числа источник вообще. Здесь вопрос
    другой и задаётся ВСЕМ документам: если число приписано ИМЕННО latency.md,
    оно обязано там быть. Поэтому проверка не расширяет сосед на все документы —
    так она бы краснела на bakeoff.md и judge-reproducibility.md, которые сами
    себе приборы и записывают СВОИ замеры.

    Правило репозитория «числа в latency.md руками не правятся» делает эту
    проверку особенно нужной: раз файл меняется только перезамером, все, кто
    его цитируют, обязаны догонять его, а не наоборот.
    """
    latency = ROOT / "docs" / "latency.md"
    assert latency.exists(), "docs/latency.md пропал — цитировать стало нечего"
    known = set(re.findall(r"(?<![\d.,])(\d{2,5})\b", latency.read_text(encoding="utf-8")))
    assert known, "в docs/latency.md не нашлось ни одного числа — тест ослеп"

    wrong: list[str] = []
    cited = 0
    for name in _prose():
        path = ROOT / name
        if path == latency or not path.exists():
            continue
        #: Переносы строк схлопываем: предложение с ссылкой почти всегда
        #: перенесено, и без этого «рядом» означало бы «в той же строке».
        text = re.sub(r"\s+", " ", path.read_text(encoding="utf-8"))
        for match in _LATENCY_CITE.finditer(text):
            cited += 1
            near = text[max(0, match.start() - _NEAR):match.end() + _NEAR]
            for value in sorted(set(_MS_NEAR.findall(near))):
                if value not in known:
                    wrong.append(f"{name} — «{value} мс» стоит рядом со ссылкой на "
                                 f"latency.md, а такого числа там нет")

    assert cited, "ни один документ не ссылается на latency.md — прибор ослеп"
    assert not wrong, (
        "документ приписывает число замеру, которого в docs/latency.md нет "
        "(числа там правятся только перезамером — догонять обязан цитирующий):"
        "\n  " + "\n  ".join(sorted(set(wrong))))


# ------------------------------------------------- словарь приёмов: его размер

#: «словарь <...> N записей» / «все записи словаря (сегодня N)» — как документы
#: называют размер лексикона. Ловим только формы, где число ПРИВЯЗАНО к слову
#: «запис…»: число рядом со словом «словарь» бывает и номером группы.
_LEX_SIZE = re.compile(r"(?<![\d.,])(\d{3,4})\s+запис(?:ь|и|ей)", re.IGNORECASE)

#: Числа, которые документ вправе назвать, не имея в виду сегодняшний размер:
#: история словаря — часть довода, и запрещать её значило бы требовать от
#: документа забыть, откуда он пришёл. Поэтому историю разрешаем ЯВНЫМ и
#: КОРОТКИМ списком, а не подавлением проверки: каждое такое число названо
#: здесь поимённо, и когда оно перестанет быть историей, тест об этом скажет.
#:
#: Список держим минимальным намеренно. Лишняя запись — дыра: разреши сюда «480»
#: заранее, и словарь, усохший до 480, пройдёт с документом, который об этом не
#: узнал. Здесь ровно одно число, и вот откуда оно: `validation.md`, таблица
#: правок словаря, строка «456 записей проверены на совпадение с самими собой» —
#: отчёт о том, сколько их БЫЛО на момент той правки.
_LEX_HISTORY = {"456"}


def test_documented_lexicon_size_matches_the_lexicon():
    """Размер словаря приёмов — число, которое документы называют «сегодняшним».

    В `docs/validation.md` рядом жили три: 456, «сегодня 477» и 526. Верное —
    526, а помечено как текущее было 477. Словарь рос четырьмя правками подряд
    (ложные закрытия, ты-формы), и каждая двигала число, оставляя предыдущее в
    соседнем абзаце. Читатель, которому нужен масштаб проверки, брал первое
    попавшееся.

    ИСТОРИЯ РАЗРЕШЕНА СПИСКОМ. Документ о валидации обязан говорить «480 → 526»,
    иначе он перестанет объяснять, что именно правка добавила. Поэтому прибор
    не запрещает старые числа, а требует, чтобы каждое было названо в
    `_LEX_HISTORY` — то есть чтобы кто-то один раз посмотрел и подтвердил, что
    это история, а не отставший счётчик.
    """
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.engine.techniques import LEX

    real = sum(len(words) for words in LEX.values())
    assert real > 100, f"словарь приёмов подозрительно мал ({real}) — тест ослеп"

    wrong: list[str] = []
    named = 0
    for name in _prose():
        path = ROOT / name
        if not path.exists():
            continue
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for value in _LEX_SIZE.findall(line):
                if int(value) == real:
                    named += 1
                elif value not in _LEX_HISTORY:
                    wrong.append(f"{name}:{line_no} — «{value} записей», "
                                 f"в словаре {real}; если это история, назовите "
                                 f"число в _LEX_HISTORY")

    assert not wrong, "размер словаря приёмов в документации разошёлся с кодом:\n  " + "\n  ".join(wrong)
    assert named, (f"ни один документ не называет нынешний размер словаря ({real}) — "
                   "прибор ослеп, поправьте регулярку")

    #: Список истории самоочищающийся: число, СНОВА ставшее настоящим, обязано
    #: уйти отсюда, иначе оно перестанет проверяться.
    assert str(real) not in _LEX_HISTORY, (
        f"{real} записей — это уже настоящее число, уберите его из _LEX_HISTORY")


# --------------------------------------------- внешняя поверхность: какие порты
#
# ЗДЕСЬ ТЕСТА НЕТ, И ЭТО РЕШЕНИЕ, А НЕ ЗАБЫВЧИВОСТЬ.
#
# Находка была настоящая: `docs/hosting.md` писал настоящим временем, что сторож
# «ругается на … раздачу наружу мимо портов 443 и 8443», тогда как
# `tools/listeners_check.py::SANCTIONED_EXTERNAL` разрешает ровно `{443}` — то
# есть документ описывал ровно то состояние сторожа, из-за которого второй
# uvicorn четыре дня смотрел в интернет с кодом позавчерашней сборки.
#
# Прибор написать пробовали, и он оказался НЕГОДНЫМ. Отличить утверждение
# «8443 смотрит наружу законно» от соседних, ВЕРНЫХ, — «сторож РАЗРЕШАЛ порты
# 443 и 8443» (история дефекта) и «из списка разрешённых наружу портов 8443
# УБРАН» (описание починки) — можно только по времени глагола и отрицанию.
# Первая редакция краснела на всех трёх, то есть звала чинить два исправных
# абзаца из трёх. Прибор, краснеющий на исправном, обходится дороже пропущенной
# находки: по нему идут править то, что работает, и в итоге перестают читать —
# то же соображение, по которому здесь нет проверки свежести снимков.
#
# Что сторожит это на самом деле: `SANCTIONED_EXTERNAL` — единственный список, и
# `listeners_check.py` сверяет его с ЖИВОЙ машиной, чего офлайновый тест не
# может по устройству. Документ остаётся на совести читающего.


# ------------------------------------- инвариант без теста — это декларация

#: Инвариант → файл(ы), где он ПРОВЕРЯЕТСЯ прогоном. Пары ведутся руками, и
#: иначе нельзя: связь «правило продукта → тест» нигде в коде не записана, а
#: выдумать её прибор не может. Зато он может требовать, чтобы связь была
#: НАЗВАНА, — и краснеть, когда названный файл исчез или переименован.
_INVARIANT_TESTS: dict[int, tuple[str, ...]] = {
    1: ("test_engine.py", "test_engine_edges.py"),
    2: ("test_reference_games.py",),
    3: ("test_scoring_formula.py",),
    4: ("test_bilingual_content.py",),
    5: ("test_resilience.py",),
    6: ("test_layers_never_score.py",),
    7: ("test_parity.py",),
    8: ("test_parity.py", "test_lex_parity.py"),
    9: ("test_course_bank.py",),
}


def test_every_invariant_is_backed_by_a_test_file_that_exists():
    """Первый принцип продукта кончается словами «проверяется тестом, а не
    декларируется». К списку инвариантов это относится в первую очередь.

    Список из девяти правил — самая цитируемая часть CLAUDE.md и единственная,
    которую правят, добавляя возможности. Десятый инвариант, дописанный без
    теста, выглядел бы в документе ровно так же убедительно, как девять
    работающих, — и был бы обещанием, за которым ничего не стоит. Ровно так
    четвёртое состояние слоя когда-то «существовало»: написано, не проверено.

    Прибор задаёт три вопроса, на которые может ответить честно:
    список инвариантов не разъехался с этой таблицей; каждый названный файл
    существует; каждый содержит хоть один тест. Чего он НЕ проверяет — что тест
    проверяет именно этот инвариант: судить о смысле теста по имени файла
    значит выдумывать связь, а выдуманная связь хуже отсутствующей, потому что
    выглядит как проверенная.

    Сосед `..._carry_the_same_invariants` следит, чтобы список был ОДИН в двух
    документах. Здесь — чтобы за каждым его пунктом стоял прогон.
    """
    section = (ROOT / "CLAUDE.md").read_text(encoding="utf-8") \
        .split("## 🧩 Инварианты")[1].split("\n---")[0]
    #: `\d+`, а не `\d`: с одной цифрой десятый инвариант («10. …») прибору
    #: НЕВИДИМ — проверено, дописанный десятым пункт проходил молча, то есть
    #: прибор слеп ровно к тому случаю, ради которого заведён.
    numbered = {int(m.group(1)) for m in re.finditer(r"^(\d+)\. ", section, re.MULTILINE)}

    assert numbered == set(_INVARIANT_TESTS), (
        "список инвариантов в CLAUDE.md разошёлся с таблицей «инвариант → тест»: "
        f"{sorted(numbered ^ set(_INVARIANT_TESTS))}. Инвариант без прогона — "
        "декларация; допишите тест и назовите его здесь")

    tests_dir = Path(__file__).resolve().parent
    missing: list[str] = []
    for number, files in sorted(_INVARIANT_TESTS.items()):
        for name in files:
            path = tests_dir / name
            if not path.exists():
                missing.append(f"инвариант {number}: файла tests/{name} нет")
                continue
            if "def test_" not in path.read_text(encoding="utf-8"):
                missing.append(f"инвариант {number}: в tests/{name} нет ни одного теста")

    assert not missing, ("инвариант обещан документом, а прогона за ним нет:\n  "
                         + "\n  ".join(missing))


# ---------------------------------- сколько состояний у слоя: четыре или три

#: Строка `detectLayers`: `probe: { id: "probe", available: true, reason: null }`.
#: Нас интересует ТРЕТЬЕ поле — литерал `true` означает «отказать нечему»,
#: любое выражение (`media`) означает, что состояние «включён, но недоступен»
#: достижимо.
_LAYER_AVAILABILITY = re.compile(
    r"(\w+):\s*\{\s*id:\s*\"(\w+)\",\s*available:\s*([A-Za-z_][\w.]*)")

#: Как документ объявляет число трёхсоставных слоёв: «у двух слоёв их три».
_THREE_STATE_CLAIM = re.compile(r"у\s+([А-Яа-яЁё]+)\s+слоёв\s+их\s+три", re.IGNORECASE)


def test_the_four_states_promise_matches_which_layers_can_refuse():
    """«У КАЖДОГО слоя ровно четыре честных состояния» было неправдой.

    Четыре состояния — выключен · включён, но недоступен · работает и молчит ·
    работает и говорит — держатся на втором, а второе бывает только у слоя с
    ВНЕШНИМ РЕСУРСОМ: микрофоном, камерой, ключом к модели. У «читай лицо» и у
    лица оппонента ресурса нет: оба считаются на месте от реакции движка, и
    `detectLayers` отдаёт им `available: true` ЛИТЕРАЛОМ, а не выражением.
    Отказать там нечему, состояний три.

    Почему это не придирка. Весь раздел — иллюстрация второго принципа («не
    заявлять того, чего нет»), и заголовок над ним заявлял состояние, которого
    у двух слоёв из пяти не существует. Документ о честности интерфейса врал
    ровно тем способом, который сам и запрещает; таблица под заголовком при
    этом была права («недоступным не бывает»), то есть документ спорил сам с
    собой на соседних строках.

    Прибор считает слои, которым отказать нечему, ПО КОДУ и требует, чтобы
    документ назвал это число словом. Судить, правильно ли документ объясняет
    ПРИЧИНУ, он не берётся — это читается глазами.
    """
    layers_ts = (ROOT / "frontend" / "src" / "lib" / "layers.ts").read_text(encoding="utf-8")
    found = _LAYER_AVAILABILITY.findall(layers_ts)
    assert found, "не разобрался в lib/layers.ts — прибор ослеп, поправьте регулярку"

    always: set[str] = set()
    for key, ident, availability in found:
        assert key == ident, f"ключ `{key}` и id `{ident}` разошлись в layers.ts"
        if availability == "true":
            always.add(key)

    #: Сверка с сервером: гасить слой по слову сервера клиент может только тем,
    #: что читает из `capabilities`. Слой, которого там нет, недоступным не
    #: станет никогда — и это вторая, независимая причина того же вывода.
    transport = (ROOT / "frontend" / "src" / "realtime" / "transport.ts").read_text(encoding="utf-8")
    honoured = set(re.findall(r"capabilities\.(\w+)\s*===\s*false", transport))
    assert honoured, "transport.ts не читает ни одного поля capabilities — тест ослеп"

    import dataclasses
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.realtime.session import Layers
    real_layers = {f.name for f in dataclasses.fields(Layers)}
    assert set(k for k, _, _ in found) == real_layers, (
        "список слоёв в lib/layers.ts разошёлся с `realtime.session.Layers`: "
        f"{sorted(set(k for k, _, _ in found) ^ real_layers)}")

    words = _NUMERALS.get(len(always), ())
    assert words, f"слоёв без внешнего ресурса {len(always)} — пополните _NUMERALS"

    doc = (ROOT / "docs" / "modalities.md").read_text(encoding="utf-8")
    claims = _THREE_STATE_CLAIM.findall(re.sub(r"\s+", " ", doc))
    assert claims, (
        "docs/modalities.md не говорит, у скольких слоёв состояний три. Раньше "
        "он обещал четыре У КАЖДОГО, и это было неправдой для "
        f"{sorted(always)} — напишите число словом, оно проверяется")
    for word in claims:
        assert word.lower() in words, (
            f"docs/modalities.md: «у {word} слоёв их три», а отказать нечему "
            f"у {len(always)}: {sorted(always)}")

    #: И сами слои обязаны быть названы: числа без имён читателю не помогают.
    for layer in always:
        assert layer in doc, (
            f"слой `{layer}` считается на месте и недоступным не бывает, "
            "а docs/modalities.md его не называет")


# ------------------------------------- конвенция пометок: и на питоне тоже

#: Пометка незавершённого: `STUB(область):`, `MOCK(область):`, `CONTRACT(...)`.
_MARKER = re.compile(r"\b(STUB|MOCK|CONTRACT)\(([a-z0-9-]+)\)\s*:")

#: Голый `TODO`/`FIXME` — то, что конвенция и заменяет.
_BARE_TODO = re.compile(r"\b(TODO|FIXME)\b")

#: «Чем оно станет» — половина пометки, ради которой конвенция и заведена.
#: Формулировки те же, что принимает фронтендовый близнец
#: (`frontend/test/markers.test.ts`): списки обязаны совпадать, иначе одна и та
#: же пометка проходит на одном языке и валится на другом.
_SAYS_WHY = re.compile(r"Настоящим станет|Real when|Станет настоящим|станет|when:",
                       re.IGNORECASE)

#: Где живёт питон продукта. Тесты исключены намеренно: пометка в тесте
#: описывает пробел ПРОВЕРКИ, а не продукта, и правило про «чем станет» к ней
#: не применяется.
_PY_ROOTS = ("services/gateway/app", "adapters", "services/gateway/tools")


def _python_sources():
    for pkg in _PY_ROOTS:
        base = ROOT / pkg
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.py")):
            if any(part in _SKIP for part in path.parts):
                continue
            yield path


def test_the_marker_convention_holds_on_the_python_side_too():
    """CLAUDE.md объявляет конвенцию пометок правилом РЕПОЗИТОРИЯ, а проверял
    её только фронтенд.

    `frontend/test/markers.test.ts` обходит `frontend/src` и ничего больше.
    Правило же написано без оговорок: «Безликий TODO гниёт… каждый обязан нести
    две вещи — чего нет и чем оно станет», и ниже — «Конвенция проверяется
    тестом: тег без строки „чем станет“ валит сборку, голый TODO/FIXME
    запрещён». На питоне не валило ничего: пометка `MOCK(avatar-motion)` в
    `app/avatar/presence.py` держалась на добросовестности автора, а голый
    `TODO` прошёл бы молча.

    Это тот же дефект, за которым охотится весь файл, только в зеркальную
    сторону: обычно документ обещает больше, чем делает код, — здесь документ
    обещал больше, чем делает ПРОВЕРКА. Заявленное правило без прибора на
    половине репозитория — такая же декларация, как инвариант без теста.

    Тесты из обхода исключены: пометка в тесте говорит о пробеле проверки, а не
    продукта, и требовать от неё «чем станет» значило бы чинить тест под тест.
    """
    bad: list[str] = []
    bare: list[str] = []
    found = 0

    for path in _python_sources():
        rel = path.relative_to(ROOT)
        lines = path.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            match = _MARKER.search(line)
            if match:
                found += 1
                #: Объяснение вправе занимать несколько строк комментария —
                #: столько же, сколько разрешает фронтендовый близнец.
                block = " ".join(lines[i:i + 6])
                if not _SAYS_WHY.search(block):
                    bad.append(f"{rel}:{i + 1} — {match.group(1)}({match.group(2)}) "
                               "не говорит, чем оно станет")
            elif _BARE_TODO.search(line):
                bare.append(f"{rel}:{i + 1}")

    assert not bad, ("пометка обязана нести ОБЕ половины — чего нет и чем "
                     "станет:\n  " + "\n  ".join(bad))
    assert not bare, ("голый TODO/FIXME запрещён, конвенция его заменяет "
                      "(STUB/MOCK/CONTRACT):\n  " + "\n  ".join(bare))

    #: Без этого прибор был бы доволен репозиторием, в котором пометок нет
    #: вовсе, — то есть молчал бы и когда конвенцию соблюдают, и когда её
    #: перестали применять.
    assert found, ("на питоне не нашлось ни одной пометки STUB/MOCK/CONTRACT — "
                   "либо конвенцию перестали применять, либо прибор смотрит "
                   f"не туда ({', '.join(_PY_ROOTS)})")


# ------------------------------------------------- лица: сколько их на самом деле

#: «N картинок (M персонажей × K состояний)» — как документ описывает набор лиц.
_FACES = re.compile(
    r"(\d+)\s+картин\w+\s*\((\d+)\s+персонаж\w*\s*[×x]\s*(\d+)\s+состояни\w*\)")


def test_documented_face_inventory_matches_the_files_on_disk():
    """Число лиц — то, что легче всего забыть: картинки коммитятся, а строка нет.

    `docs/upstream-code-map.md` писал «72 картинки (8 персонажей × 9 состояний),
    1.8 МБ». На диске 135 у 15 персонажей: девять столов библиотеки плюс шесть
    зеркальных, у каждого зеркала своё лицо, потому что за ним сидит вторая
    сторона. Число отстало на два поколения столов сразу и не могло не отстать:
    лица добавляются вместе со столом, а строка в провенансе — отдельным
    движением руки.

    Проверять это ДЕШЕВО и надёжно, в отличие от большинства чисел в том
    документе: файлы лежат в репозитории, их можно посчитать. Поэтому здесь и
    сверяются все три множителя сразу — картинки, персонажи и состояния: любой
    один совпал бы случайно, все три вместе — нет.

    Размер в мегабайтах НЕ сверяется. Он зависит от кодировщика webp и поплывёт
    от перегенерации одного лица, а красный тест на исправном наборе стоит
    дороже пропущенной десятой доли мегабайта.
    """
    avatars = ROOT / "frontend" / "public" / "avatars"
    assert avatars.is_dir(), "каталог лиц пропал — сверять нечего"

    personas = sorted(d for d in avatars.iterdir() if d.is_dir())
    assert personas, "в каталоге лиц нет ни одного персонажа — тест ослеп"
    per_persona = {d.name: len(list(d.glob("*.webp"))) for d in personas}
    states = set(per_persona.values())
    assert len(states) == 1, (
        "у персонажей разное число лиц — набор неполный, и документ про это "
        f"не расскажет: {sorted((v, k) for k, v in per_persona.items())}")

    pictures = sum(per_persona.values())
    faces_each = states.pop()

    #: Лица есть у КАЖДОГО стола, включая зеркальные: у зеркала своя вторая
    #: сторона. Без этой сверки набор мог бы отстать от библиотеки молча —
    #: новый стол показывал бы рисованный портрет вместо девяти состояний.
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from app.engine.scenarios import SCENARIOS, MIRRORS
    tables = {s.id for s in (*SCENARIOS, *MIRRORS)}
    without = sorted(tables - set(per_persona))
    assert not without, f"у этих столов нет набора лиц: {without}"

    wrong: list[str] = []
    checked = 0
    for name in _prose():
        path = ROOT / name
        if not path.exists():
            continue
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for total, who, each in _FACES.findall(line):
                checked += 1
                if (int(total), int(who), int(each)) != (pictures, len(per_persona), faces_each):
                    wrong.append(
                        f"{name}:{line_no} — обещает {total} картинок "
                        f"({who} × {each}), на диске {pictures} "
                        f"({len(per_persona)} × {faces_each})")

    assert not wrong, "набор лиц в документации разошёлся с диском:\n  " + "\n  ".join(wrong)
    assert checked, ("ни один документ не описывает набор лиц числом — прибор "
                     "ослеп, поправьте регулярку или уберите его")
