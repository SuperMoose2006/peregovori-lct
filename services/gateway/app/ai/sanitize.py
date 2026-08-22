"""sanitize.py — защита реплики оппонента от того, что модель выдала лишнего.

Извлечено из `chat_models.py` при удалении синхронного слоя бэкендов. Сам слой
(обёртки над claude CLI, tmux, Agent SDK, ChatAnthropic, ChatOpenAI) стал
недостижим: живой путь ходит в OpenRouter через асинхронного провайдера. А эта
функция — нет: она оплачена живым бейк-оффом (docs/model-bakeoff.md) и остаётся
последним рубежом между дешёвой моделью и экраном на защите.

ТРИ ВЕЩИ, КОТОРЫЕ ОНА ЛОВИТ, И ПОЧЕМУ КАЖДАЯ ВАЖНА.

1. **Чужой алфавит.** Дешёвые мультиязычные модели роняют иероглифы посреди
   русской фразы: «для нас — 携手守护, и мы идём навстречу». Одна такая реплика на
   сцене читается как сломанный софт.

2. **Выход из роли.** «Как языковая модель, я не могу…» — оппонент ломает
   четвёртую стену. Лучше шаблонная реплика движка, чем это.

3. **Markdown и кавычки.** Модель оборачивает реплику в `**` или «…», и в пузыре
   чата появляется разметка вместо речи.

Отвергнутая реплика — не потеря: вызывающий берёт шаблонную линию движка,
которая всегда существует и всегда в характере.
"""

from __future__ import annotations

import re
from typing import Optional

#: Потолок длины реплики. Длиннее — это уже не реплика в переговорах.
MAX_LEN = 400

#: Маркеры выхода из роли. Только многословные фразы: одиночные слова ловили бы
#: законные реплики переговорщика.
_BREAK_MARKERS = (
    "я специализируюсь", "как ии", "как искусственный интеллект", "как языковая модель",
    "виртуальный ассистент", "чем могу помочь", "как ассистент", "я — ии", "я ии,",
    "as an ai", "i'm an ai", "i am an ai", "language model", "i cannot assist",
    "i'm claude", "i am claude", "i specialize in", "how can i help", "as an assistant",
)

#: Письменности, которых в игре не бывает: CJK, корейский, арабский.
_FOREIGN_SCRIPT_RE = re.compile(r"[一-鿿぀-ヿ가-힯؀-ۿ]")


def _script_ok(text: str) -> bool:
    return not _FOREIGN_SCRIPT_RE.search(text)


def sanitize(text: Optional[str]) -> Optional[str]:
    """Очистить реплику или отвергнуть её. None → вызывающий берёт шаблон движка."""
    if not text:
        return None
    s = text.replace("\r", "").strip()

    # Служебные строки (предупреждения, заметки, баннеры в скобках) — не речь.
    good = []
    for line in s.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if re.match(r"^(warning|note|error|\[)", stripped, re.IGNORECASE):
            continue
        good.append(stripped)
    s = " ".join(good).strip()

    # Markdown: заборы кода, выделение, заголовки, цитаты.
    s = s.replace("```", "")
    s = re.sub(r"[*_`]{1,3}", "", s)
    s = re.sub(r"^\s*#{1,6}\s*", "", s)
    s = re.sub(r"^\s*>+\s*", "", s)

    # Один слой обрамляющих кавычек, который модель любит добавлять.
    s = s.strip().strip("\"'«»").strip()
    if not s:
        return None

    low = s.lower()
    if any(mk in low for mk in _BREAK_MARKERS):
        return None
    if not _script_ok(s):
        return None

    if len(s) > MAX_LEN:
        s = re.sub(r"\s+\S*$", "", s[:MAX_LEN]) + "…"
    return s or None
