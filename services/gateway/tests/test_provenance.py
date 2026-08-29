"""Правило про шапки перенесённого кода — единственная конвенция без теста.

CLAUDE.md требует: «Перенесённый upstream-код несёт шапку с источником,
лицензией и коммитом». Проверялось это глазами — и именно поэтому раздел карты
провенанса четыре месяца описывал файлы, УДАЛЁННЫЕ из репозитория, а нынешний
фундамент голосового слоя в карте отсутствовал целиком.

Здесь проверяется не стиль, а три вещи, каждая из которых уже ломалась:
  1. у файла в каталоге vendor/ есть шапка с источником, лицензией и коммитом;
  2. карта не ссылается на файлы, которых нет;
  3. лицензия в шапке не противоречит лицензии в сводной таблице карты.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MAP = ROOT / "docs" / "upstream-code-map.md"

#: Каталоги перенесённого кода. Не «всё, где встретилось слово vendor», а те, что
#: объявлены в CLAUDE.md как таковые.
VENDOR_DIRS = (
    ROOT / "frontend" / "src" / "realtime" / "vendor",
    ROOT / "services" / "gateway" / "app" / "vendor",
)
CODE = (".py", ".ts", ".tsx", ".js")


def _vendor_files() -> list[Path]:
    """Файлы, которые действительно НЕСУТ перенесённый код.

    Пустые `__init__.py` исключены намеренно: они помечают пакет, а не переносят
    чужую работу, и требовать от них провенанс значило бы приучать ставить шапку
    ради теста.
    """
    out: list[Path] = []
    for folder in VENDOR_DIRS:
        if not folder.is_dir():
            continue
        for path in folder.rglob("*"):
            if path.suffix not in CODE or not path.is_file():
                continue
            body = [ln for ln in path.read_text(encoding="utf-8", errors="replace").splitlines()
                    if ln.strip() and not ln.lstrip().startswith(("#", "//", "*", '"""', "║", "╔", "╚"))]
            if len(body) < 5:
                continue
            out.append(path)
    return out


def test_every_vendored_file_names_its_source_licence_and_commit():
    """Шапка обязана отвечать на три вопроса: откуда, по какой лицензии, какой коммит.

    Без коммита провенанс бесполезен: апстрим переписывают, и «взято из проекта
    X» через полгода не указывает ни на что проверяемое.
    """
    missing: list[str] = []
    for path in _vendor_files():
        head = "\n".join(path.read_text(encoding="utf-8", errors="replace").splitlines()[:40])
        rel = str(path.relative_to(ROOT))
        # ИСТОЧНИК — ЭТО ИМЯ ПРОЕКТА, А НЕ ОБЯЗАТЕЛЬНО ССЫЛКА. Первая версия
        # этого теста требовала URL и объявила «без провенанса» шесть файлов с
        # полными, образцовыми шапками. Ложная находка стоит дороже пропущенной:
        # по ней идут чинить исправное.
        if not re.search(r"Источник|Source", head):
            missing.append(f"{rel}: нет источника")
        elif not re.search(r"licen|лиценз|MIT|Apache|BSD|ISC|GPL", head, re.I):
            missing.append(f"{rel}: нет лицензии")
        elif not re.search(r"\b[0-9a-f]{7,40}\b", head):
            missing.append(f"{rel}: нет коммита")
    assert not missing, "перенесённый код без провенанса:\n  " + "\n  ".join(missing)


def test_the_map_does_not_point_at_files_that_are_gone():
    """§12 четыре месяца описывал удалённый рендерер липсинка.

    Карта, ссылающаяся на несуществующий файл, хуже отсутствующей: читатель
    считает её описанием системы и ищет там, где ничего нет.
    """
    if not MAP.is_file():
        return
    text = MAP.read_text(encoding="utf-8")
    # Пути в обратных кавычках, похожие на наши исходники.
    paths = set(re.findall(r"`((?:services|frontend|design)/[A-Za-z0-9_./-]+\.(?:py|ts|tsx|js|json))`", text))
    # ПУТИ ЧУЖОГО РЕПОЗИТОРИЯ — НЕ НАШИ ФАЙЛЫ. Карта перечисляет, из каких файлов
    # апстрима перенесён каждый кусок, и у MiniCPM-o путь начинается с
    # `frontend/mobile/` — как у нас. Первая версия теста объявила такую строку
    # «ссылкой на несуществующий файл». Отличаем по каталогу верхних двух
    # уровней: наш существует, чужой — нет.
    ours = {p for p in paths if (ROOT / "/".join(p.split("/")[:2])).is_dir()}

    # УПОМИНАНИЕ УДАЛЁННОГО ФАЙЛА — ЭТО НЕ ССЫЛКА НА НЕГО. Карта прямо
    # рассказывает, что LiveTalking удалён вместе с GPU-провайдером, и называет
    # исчезнувшие пути, чтобы читатель узнал их в старых заметках. Это ровно то
    # поведение документа, которого мы хотим; запретить его значило бы заставить
    # карту молчать об удалениях.
    #
    # (Третье ложное срабатывание этого теста за один заход. Прибор, который
    #  ловит исправное, обходится дороже пропущенной находки — по нему идут
    #  чинить то, что работает.)
    dead_marker = re.compile(r"больше нет|не существует|удал[её]н", re.I)
    gone = []
    for candidate in sorted(ours):
        if (ROOT / candidate).exists():
            continue
        at = text.find(candidate)
        around = text[max(0, at - 400):at + 400]
        if not dead_marker.search(around):
            gone.append(candidate)
    assert not gone, "карта провенанса ссылается на несуществующие файлы:\n  " + "\n  ".join(gone)


def test_a_licence_with_extra_conditions_is_never_called_plain():
    """Ловушка, на которой уже попались: «Apache-2.0» там, где Apache + условия.

    У ten-vad лицензия — «Apache License v2.0 with additional conditions», и
    среди условий запрет на конкуренцию с правообладателем. Сводная таблица
    карты писала это верно, а построчные записи и докстринги — просто
    «Apache-2.0». Читатель верит той половине, что попалась первой.
    """
    guarded = {"ten-vad", "ten_vad", "TEN Framework"}
    offenders: list[str] = []
    for folder in (ROOT / "services" / "gateway" / "app", ROOT / "frontend" / "src"):
        for path in folder.rglob("*"):
            if path.suffix not in CODE or not path.is_file():
                continue
            head = "\n".join(path.read_text(encoding="utf-8", errors="replace").splitlines()[:40])
            if not any(name in head for name in guarded):
                continue
            if "Apache" not in head:
                continue
            # Достаточно любого признака оговорки рядом с названием лицензии.
            if not re.search(r"доп\.?\s*услов|additional condition|Agora|неконкур", head, re.I):
                offenders.append(str(path.relative_to(ROOT)))
    assert not offenders, (
        "лицензия названа простой Apache-2.0 там, где у неё есть дополнительные "
        "условия:\n  " + "\n  ".join(offenders))


def test_shipped_fonts_carry_their_licence():
    """SIL OFL требует, чтобы КАЖДАЯ копия несла уведомление и текст лицензии.

    Шрифт уезжает каждому пользователю. Это не несовместимость — OFL разрешает
    и продажу, — но условие 2 обязательно, и выполняется оно одним файлом рядом.
    """
    fonts = ROOT / "frontend" / "public" / "fonts"
    if not fonts.is_dir() or not any(fonts.glob("*.woff2")):
        return
    notices = [p for p in fonts.iterdir()
               if p.is_file() and "OFL" in p.read_text(encoding="utf-8", errors="replace")[:4000]]
    assert notices, "шрифты раздаются без текста лицензии OFL рядом с ними"
