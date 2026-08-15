# 🤝 Диалог — Negotiation Skills Simulator

Интерактивный тренажёр деловых переговоров, где **исход зависит от стратегии, формулировок и
аргументов** игрока. Методики: Гарвардский метод · SPIN · BATNA. Проект для хакатона ЛЦТ.

Живой диалог с ИИ-оппонентом, у которого есть **скрытые интересы**, **красная линия** и **характер**.
Каждая реплика анализируется в реальном времени; после игры — разбор с коучингом.

## Архитектура

Разделённые **backend (Python / FastAPI / LangGraph)** и **frontend (React / Vite / TS)**, общение по
модальностно-независимому протоколу «ход» поверх **WebSocket** (голос STT/TTS — будущие адаптеры на краях).

**Главный инвариант:** состояние игры и оценку считает **детерминированный движок**; ИИ (LangGraph)
отвечает только за текст реплик оппонента. Без ИИ/сети продукт полностью играбелен (шаблонный фолбэк).

```
backend/app/
  engine/      детерминированный движок (порт эталона из legacy-node/)
  ai/          LangGraph граф оппонента + ChatModel (claude CLI | Anthropic API)
  protocol.py  Pydantic-контракт сообщений
  views.py     адаптер engine → протокол
  main.py      FastAPI: WS /ws + REST fallback
frontend/src/  React: ScenarioPicker · Table(Meters+Chat) · Debrief · ModePicker
legacy-node/   исходный zero-dep прототип — эталон поведения (не деплоится)
docs/          дизайн-спека
```

Подробные правила и инварианты — в [CLAUDE.md](CLAUDE.md); дизайн — в
[docs/superpowers/specs/](docs/superpowers/specs/).

## Быстрый старт

```bash
make install                 # venv + pip + npm install
make backend                 # FastAPI на :8000   (офлайн, шаблонный оппонент)
make frontend                # Vite на :5173
make test                    # тесты движка

# Локальный ИИ-оппонент через claude CLI (без API-ключа):
NEGO_AI=cli make backend
# Продакшен через API:
NEGO_AI=api ANTHROPIC_API_KEY=sk-... make backend
```

## Режимы

🥋 Практика · 📖 Кампания · 🎯 Своя сделка · 🏆 Экзамен/Дуэль — все переиспользуют одно ядро-петлю.

## License

MIT.
