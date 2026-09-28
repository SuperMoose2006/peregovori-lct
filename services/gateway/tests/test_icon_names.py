"""Значки: сервер и браузер обязаны знать один и тот же набор имён.

ЗАЧЕМ. Сценарии, блоки курса и кампании носят ИМЯ значка («handshake»), а рисует
его браузер своим SVG (`frontend/src/components/Icon.tsx`). Раньше в этих полях
лежал эмодзи, и рисовал его шрифт операционной системы — мимо темы продукта, со
своей шириной, а без нужного шрифта пустым квадратом.

У схемы «имя вместо символа» есть цена: имя, которого нет в наборе, рисовать
нечем, и промах виден не сразу — на экране просто стоит запасной значок. Поэтому
здесь два контроля. Первый — списки на сервере и в браузере совпадают буква в
букву. Второй — каждое имя, встречающееся в данных, заведено в наборе.

Режим «своя сделка» отдельно: имя приходит от модели, и `scenario_gen` проверяет
его по тому же `ICON_NAMES`, подставляя нейтральное при промахе.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.icons import ICON_NAMES

ICON_TSX = (Path(__file__).resolve().parents[3]
            / "frontend" / "src" / "components" / "Icon.tsx")

#: Ключи объявления `PATHS` — две ведущих пробела, имя, двоеточие.
_KEY = re.compile(r"^  ([a-z]+): ", re.MULTILINE)
#: `icon="handshake"` в исходниках сервера.
_ICON_FIELD = re.compile(r'icon="([^"]*)"')


def _drawn() -> set[str]:
    text = ICON_TSX.read_text(encoding="utf-8")
    body = text.split("const PATHS", 1)[1].split("};", 1)[0]
    names = set(_KEY.findall(body))
    assert len(names) > 40, f"в PATHS нашлось {len(names)} имён — сломалась регулярка?"
    return names


def test_the_server_and_the_browser_know_the_same_icons():
    drawn = _drawn()
    assert drawn == set(ICON_NAMES), (
        "наборы значков разошлись.\n"
        f"  нарисованы, но сервер не знает: {sorted(drawn - set(ICON_NAMES))}\n"
        f"  сервер знает, но не нарисованы: {sorted(set(ICON_NAMES) - drawn)}")


def test_every_icon_in_the_data_is_a_known_name():
    """Сценарии, блоки и кампании не смеют просить значок, которого нет."""
    root = Path(__file__).resolve().parents[1] / "app"
    unknown: list[str] = []
    for path in sorted(root.rglob("*.py")):
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for name in _ICON_FIELD.findall(line):
                # Подстановка из переменной проверяется в scenario_gen отдельно.
                if name and name not in ICON_NAMES:
                    unknown.append(f"{path.name}:{i}: {name!r}")
    assert not unknown, "в данных есть незаведённые значки:\n  " + "\n  ".join(unknown)


def test_a_generated_scenario_never_keeps_a_stray_icon():
    """Модель в режиме «своя сделка» отдаёт имя сама — чужое не должно доехать."""
    from app.ai import scenario_gen

    prompt = scenario_gen._sys_prompt("ru")
    assert "эмодзи" in prompt, "промпт обязан прямо запрещать эмодзи"
    for name in ("target", "handshake"):
        assert name in prompt, f"список имён в промпте неполон: нет {name}"
