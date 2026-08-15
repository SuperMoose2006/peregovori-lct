# Дизайн: платформа-тренажёр переговоров «Диалог»

Дата: 2026-08-15 · Статус: в реализации (автономный режим)

## 1. Продукт (концепция A+B+C, единая система)

Тренажёр деловых переговоров. Исход зависит от стратегии, формулировок и аргументов игрока.
Методики: Гарвардский метод · SPIN · BATNA.

**Единый каркас:** одна система роста (дерево навыков + XP + репутация), два источника контента
(авторские сценарии/кампания + генерация «своей сделки»), одно ядро-петля (диалог → метрики → разбор).

**Режимы** (все переиспользуют одно ядро):
| Режим | Суть | Подсказки |
|---|---|---|
| 🥋 Практика | один сценарий из библиотеки | вкл |
| 📖 Кампания | сюжетная карьерная арка, последствия переносятся | частично |
| 🎯 Своя сделка | генерация сценария под ситуацию игрока | вкл |
| 🏆 Экзамен/Дуэль | без подсказок, оценка/сертификат/рейтинг | выкл |

**Дерево навыков:** ветки SPIN · Гарвард · BATNA/рычаг · Мягкие (слушание, напряжение). XP из любого режима.

## 2. Архитектура

Разделённые **backend (Python/FastAPI/LangGraph)** и **frontend (React/Vite/TS)**, общение по
модальностно-независимому протоколу «ход» (turn) поверх **WebSocket** (REST fallback). Голос (STT/TTS) —
будущие адаптеры на краях; ядро всегда текстовое.

**Главный инвариант:** состояние игры и оценку считает ДЕТЕРМИНИРОВАННЫЙ движок. ИИ (LangGraph) отвечает
только за текст реплик оппонента. Ошибка/таймаут ИИ → шаблонный фолбэк движка.

```
frontend/  React+Vite+TS      →  WS /ws (turn протокол)  →  backend/ FastAPI
  components: ScenarioPicker, Table(Meters+Chat), Debrief, ModePicker, SkillTree
backend/app/
  protocol.py     Pydantic-схемы сообщений (КОНТРАКТ — см. §3)
  engine/         ДЕТЕРМИНИРОВАННЫЙ движок (порт с legacy-node/engine/*.js)
    techniques.py · engine.py · scenarios.py
  ai/             LangGraph граф оппонента + chat_models (claude CLI | anthropic)
  session.py      хранилище сессий (in-memory)
  main.py         FastAPI: WS + REST fallback
```

## 3. Контракт движка (источник истины — все агенты выравниваются на это)

### Состояние (`GameState`)
- `trust: float` 0..100 · `tension: float` 0..100 · `info: float` 0..100 · `leverage: float` 0..100
- `offer_opp: float` — текущее число оппонента на столе
- `offer_player: float | None`
- `interests_found: list[int]` · `tradeoffs_used: list[int]`
- `deal: float | None` · `status: "active" | "agreement" | "breakdown"`

### Публичный API движка
- `analyze(text: str) -> Analysis` — `{moves, primary, number, arg_quality, spin, tags, flags}`
- `create_session(scenario_id, lang) -> Session`
- `apply_move(session, analysis) -> MoveResult` — `{reaction, deltas, closed}`
- `render_line(session, reaction, closed) -> str` — шаблонный фолбэк
- `score_session(session) -> Debrief`
- `flexibility(session) -> float` 0..1

Поведение и баланс ЗАФИКСИРОВАНЫ тестами (порт 14 инвариантов из legacy-node/test/engine.test.js).
Инварианты: оппонент не переходит floor; принципиальная игра → грейд A/B; агрессия → срыв/F;
`overall = 0.4·economic + 0.25·relationship + 0.35·technique`; билингвальность RU/EN.

## 4. Протокол «ход» (WS сообщения)

client→server: `start{scenarioId,lang,mode}` · `turn{text}` · `hint{}`
server→client: `greeting{state,scenario}` · `opponent{text,analysis,deltas,state}` ·
`opponent_delta{chunk}` (стриминг) · `debrief{...}` · `hint{text}` · `error{message}`

Точные Pydantic-схемы — в `backend/app/protocol.py`; зеркало для фронта — `frontend/src/types.ts`.

## 5. Слой ИИ

LangGraph граф оппонента. Нода-LLM = LangChain ChatModel, выбор по env `NEGO_AI`:
`off` (шаблоны) · `cli` (обёртка `claude -p` через subprocess) · `api` (ChatAnthropic).
Граф получает факты состояния (offer_opp, mood, интересы, статус) и возвращает 1–2 реплики в характере.
Переход в прод = смена одной env. tmux/CLI-специфика — только внутри chat_models.

## 6. Порядок реализации (автономный)

1. **Контракт** (protocol.py, types.ts, этот док) — сделано оркестратором.
2. **Движок Python + тесты** (порт, pytest зелёный).
3. **AI-слой** (LangGraph + chat_models).
4. **API/WS сервер** (main.py, session.py) — интеграция.
5. **Frontend** (экраны ядра-петли, WS-клиент, i18n, дизайн из legacy demo.html).
6. **Надстройки режимов** (Практика → Своя сделка → Кампания → Экзамен) и дерево навыков.
7. Прогон E2E, итерации.
