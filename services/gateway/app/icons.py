"""icons.py — имена значков, общие для сервера и браузера.

ПОЧЕМУ ИМЕНА, А НЕ СИМВОЛЫ. Раньше сценарии, блоки курса и кампании носили
эмодзи прямо в данных, и его рисовал шрифт операционной системы: своя палитра
мимо темы продукта, своя ширина, а там, где глифа нет, — пустой квадрат. Теперь
данные несут ИМЯ, а интерфейс рисует его своим SVG (`frontend/src/components/Icon.tsx`).

Здесь список имён продублирован, потому что сервер обязан проверять то, что
пришло от модели в режиме «своя сделка»: имя вне набора нарисовать нечем.
Расхождение двух списков ловит `tests/test_icon_names.py` — он читает
`Icon.tsx` и сверяет построчно, так что забытое имя валит сборку, а не
всплывает пустым местом на экране.
"""

from __future__ import annotations

#: Полный набор. Пополняется вместе с `PATHS` в `Icon.tsx`.
ICON_NAMES: frozenset[str] = frozenset({
    "flame", "gem", "sun", "moon", "sound", "mute", "bulb", "lock", "unlock",
    "mountain", "scales", "masks", "cross", "send", "star", "crown", "cap",
    "flag", "dice", "refresh", "trophy", "print", "search", "chair", "mirror",
    "camera", "face", "ice", "mic", "smile", "target", "books", "book", "person",
    "tools", "shield", "clipboard", "sliders", "handshake", "door", "bolt",
    "climb", "ladder", "chart", "anchor", "bricks", "factory", "briefcase",
    "bank", "laptop", "building", "worried", "angry", "key", "box", "rocket",
    "house", "car", "satellite", "pen", "belt", "question", "map", "check",
    "warning", "chat", "clock",
})
