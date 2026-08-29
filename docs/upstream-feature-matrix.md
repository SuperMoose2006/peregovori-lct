# Матрица capabilities: что где реально написано

Разбор пяти upstream-репозиториев **по коду**, не по README. Для каждой
capability — где лежит рабочая реализация, чего она стоит, и что мы с ней делаем.

Клоны: `.upstream/` (gitignored). Точные коммиты — в
[`upstream-code-map.md`](./upstream-code-map.md).

> **Читать с поправкой на дату (сверка 2026-08-29).** Это протокол ВЫБОРА,
> сделанного до того, как решение по аватару было отменено. Три строки таблицы
> ниже — веб-транспорт аватара, липсинк и хореография — описывают план, который
> НЕ состоялся: кода LiveTalking и MuseTalk в репозитории нет, каталога
> `services/avatar` нет, липсинк делает OpenTalking, а у нас работает только
> `PresenceAvatar` с честным `lipsync: false`. Разбор — карта провенанса §12.
> Раздел §4 про модели тоже устарел: действующая раскладка ролей — в
> `services/gateway/app/providers/routing.py` и в
> [`model-bakeoff.md`](./model-bakeoff.md).

| Репозиторий | Коммит | Лицензия | Размер |
|---|---|---|---|
| Open-LLM-VTuber | `992309c0` (2026-05-15) | MIT | 51M |
| LiveTalking | `36837f90` (2026-08-20) | Apache-2.0 | 13M |
| MuseTalk | `0a89dec4` (2025-09-26) | MIT | 34M |
| MiniCPM-o-Demo | `50b0865c` (2026-08-14) | **не установлена** (файла `LICENSE` нет — карта §1) | 46M |
| Duix-Mobile | `690fe81d` (2026-08-05) | DUIX Community License (≈ Apache + условия) | 560M |
| TEN Framework | `2e56d965` (2026-08-21) | Apache-2.0 + доп. условия | 456M |

---

## 0. Три факта, которые определили всю архитектуру

Их не видно из README, они видны только из кода — и они важнее любых
предпочтений.

### 0.1. У нас нет GPU

```
$ nvidia-smi → command not found
```

MuseTalk — это UNet поверх латентов VAE плюс Whisper-энкодер; LiveTalking
гоняет его в реальном времени на CUDA (`torch==2.9.1+cu128`,
`README-EN.md §1.1`). На CPU это не realtime и близко.

**Следствие, а не оправдание:** аватар обязан быть **отдельным сервисом с
честным рукопожатием возможностей**. Гейтвей спрашивает у avatar-воркера, что
тот умеет; воркер отвечает `lipsync: true` только если у него реально есть
модель и GPU. Нет воркера → слой аватара объявляет себя недоступным ровно так
же, как это уже делают `voice`/`camera` в `lib/layers.ts`. Правило проекта
«четвёртого состояния — выглядит настоящим, а внутри пусто — не существует»
здесь работает буквально.

### 0.2. TEN-рантайм тянет за собой Agora и сборку C++/Go

`ai_agents/agents/examples/voice-assistant/tenapp/property.json` — первая нода
графа это `agora_rtc` с `${env:AGORA_APP_ID}`. Рантайм — `ten_runtime` (C++ ядро
+ Go), собирается через `task use` в докере, 456 МБ репозитория.

Взять TEN как backbone = завести платную внешнюю зависимость и полчаса сборки
ради оркестрации, которая у нас укладывается в один файл. **Мы берём из TEN не
рантайм, а алгоритмы и управляющий паттерн** — и это не «идеи вместо кода»:
`ten-vad` ставится из pip как готовая нативная либа, `turn_detector.py`
переносится файлом, `main_control` переносится как код с заменой транспорта.

### 0.3. MiniCPM-o — это модель на 9B, но протокол от неё отделим

`/v1/realtime` в `gateway.py:1384` — тонкий роутер: он не знает про модель, он
знает про очередь, режим и сессию. Событийный словарь
(`session.init` / `input.append` / `response.output.delta{kind}` /
`session.close`) сам по себе модально-независим и ложится на наш «ход» точнее,
чем наш текущий `{type:"turn"}`. Клиентская часть
(`static/duplex/lib/realtime-session.js`, `audio-player.js`) вообще не содержит
ничего про MiniCPM — это чистый realtime-клиент.

---

## 1. Матрица

Колонка «Победитель» — то, что реально поехало в продукт.

| Capability | Кандидаты (файл) | Победитель | Почему | Что делаем |
|---|---|---|---|---|
| **Realtime-протокол сессии** | MiniCPM `gateway.py:1384` + `docs-app/.../realtime-api/*` · TEN graph-property · LiveTalking HTTP+SSE | **MiniCPM-o** | Единственный, где протокол отвязан от модели и покрыт документацией + e2e-тестами (`tests/e2e_realtime.py`). Очередь, лимит длительности, `session.closed{reason}` — уже продуманы | Переносим словарь событий целиком, добавляем негоциационные события |
| **Realtime-клиент (WS + жизненный цикл)** | MiniCPM `static/duplex/lib/realtime-session.js` (627 стр.) | **MiniCPM-o** | Готовый клиент с очередью, ретраями, логом протокола, метриками дрейфа. Ни у кого другого клиента такого уровня нет | Портируем в TS, вешаем на наш store |
| **Джиттер-буфер и воспроизведение PCM** | MiniCPM `audio-player.js` (295) + `streaming-player.ts` (173) · Duix `AudioPlayer.java` | **MiniCPM-o** | Планирование по `audioCtx.currentTime`, учёт «ahead», `stopAll()` для barge-in, метрики разрывов | Портируем `streaming-player.ts` + логику turn из `audio-player.js` |
| **Захват микрофона/камеры в браузере** | MiniCPM `mobile-duplex.ts` `MobileLiveMediaProvider` (426) | **MiniCPM-o** | AudioWorklet, ресемплинг в 16 кГц, кадры через canvas, `rebindElements` при ремаунте React, глушение колонок через `sinkGain` | Портируем, вырезаем мобильную специфику |
| **VAD** | TEN `ten_vad_python` (pip `ten-vad`, 1.3 МБ wheel) · MiniCPM `vad/vad.py` (Silero ONNX) · Open-LLM-VTuber `vad/silero.py` | **TEN VAD** | Нативная либа, hop 16 мс против 32 мс у Silero; готовая машина состояний IDLE↔SPEAKING с `prefix_padding`/`silence_duration`. Silero остаётся вторым провайдером | `pip install ten-vad`, переносим машину состояний из `extension.py` |
| **Детектор конца реплики** | TEN `ten_turn_detection/turn_detector.py` | **TEN** (безальтернативно) | Единственная реализация из пяти. Трёхзначное решение `finished/unfinished/wait` — именно то, что нужно переговорам: пауза на середине аргумента ≠ конец хода | Переносим файл, `base_url` → OpenRouter |
| **Прерывание (barge-in)** | TEN `main_python/extension.py::_interrupt` · Open-LLM-VTuber `conversation_handler.py::handle_individual_interrupt` · LiveTalking `flush_talk()` · MiniCPM `set_break()` | **TEN как основной**, Open-LLM-VTuber — дополняюще | TEN: одна точка, гасит LLM+TTS+транспорт, всё привязано к `turn_id`. Open-LLM-VTuber добавляет то, чего у TEN нет: **дописывание услышанного куска в историю** (`heard_response` → `[Interrupted by user]`) — для переговоров критично, оппонент должен помнить, на чём его оборвали. LiveTalking `flush_talk` — третий уровень, гасит очередь аватара | Порт `_interrupt()` + `heard_response` из Open-LLM-VTuber + вызов `/interrupt_talk` |
| **Резка стрима на фразы для TTS** | Open-LLM-VTuber `utils/sentence_divider.py` (608) · TEN `helper.py::parse_sentences` (88) | **Open-LLM-VTuber** | pysbd с поддержкой `ru`, обработка сокращений, запятых как аварийной границы, **и извлечение тегов `[emotion]` из потока** — готовый канал для мимики оппонента. TEN-версия — примитивный сплит по точкам | Переносим файл целиком |
| **Параллельный TTS с сохранением порядка** | Open-LLM-VTuber `conversations/tts_manager.py` (182) | **Open-LLM-VTuber** (безальтернативно) | Фразы синтезируются параллельно, отдаются строго по номеру последовательности через буфер переупорядочивания. Это и есть разница между «первый звук через 600 мс» и «через 3 с» | Переносим класс, файлы → PCM-чанки в шину |
| **Интерфейс провайдеров ASR/TTS** | Open-LLM-VTuber `asr/asr_interface.py`, `tts/tts_interface.py` + 11/21 реализаций · TEN extension-модель | **Open-LLM-VTuber** | Абстракция ровно нужного размера (2 метода), 21 готовый TTS. TEN-модель требует рантайма | Переносим интерфейсы, пишем провайдеры под OpenRouter/edge |
| **Веб-транспорт аватара** ⛔ ОТМЕНЕНО (карта §12) | LiveTalking `server/webrtc.py` + `rtc_manager.py` + `streamout/webrtc.py` | ~~LiveTalking~~ — кода в репозитории нет | aiortc-треки с ручной раскладкой временных меток (20 мс аудио / 40 мс видео), WHEP, мультисессионность | Поднимаем сервисом, говорим с ним по HTTP+WebRTC |
| **Липсинк** ⛔ ОТМЕНЕНО (карта §12) | MuseTalk `scripts/realtime_inference.py` · LiveTalking `avatars/musetalk/*` (вендоренный MuseTalk) | ~~MuseTalk через LiveTalking~~ | Свой GPU-аватар удалён вместе с `app/avatar/livetalking.py`; каталога `services/avatar` не существует | Липсинк делает OpenTalking; у нас `PresenceAvatar` и `lipsync: false` |
| **Хореография аватара (idle/действия)** ⛔ ЧАСТИЧНО ОТМЕНЕНО (карта §12) | LiveTalking `base_avatar.py::set_custom_state` + `get_custom_audio_stream` · Duix `Constant.CALLBACK_EVENT_MOTION_*` | от LiveTalking не осталось ничего; выжил только словарь событий Duix | LiveTalking проигрывает произвольные видео когда молчит — это и есть «дышит и моргает». Duix даёт правильный набор событий (`play.start/end`, `motion.start/end`) | Реакция движка → `set_audiotype` |
| **Мобильный аватар on-device** | Duix-Mobile `duix-sdk` (Java + ncnn `.so`) | **Duix** (безальтернативно) | Единственный on-device рендерер. Но это Android/iOS-приложение | **Не строим в этой итерации.** Забираем контракт событий и делаем протокол совместимым. Помечено `STUB(mobile-avatar)` |
| **Зрение / контекст сцены** | Open-LLM-VTuber (кадр в мультимодальный LLM) · MiniCPM (кадры в модель напрямую) | **Open-LLM-VTuber-подход** | Адаптивный сэмплинг кадров + отправка в VLM. Прямой путь MiniCPM требует их же модель | Кадры → OpenRouter vision, частота адаптивная |
| **Память диалога** | Open-LLM-VTuber `basic_memory_agent.py` (702) + `chat_history_manager.py` | Частично | Полноценный агент с памятью нам не нужен — историю держит движок. Берём только обработку прерывания | Точечный порт |
| **Истина игры** | наш `engine/` | **наш движок** | Ни один upstream не считает ZOPA, скрытые интересы и грейд | Не трогаем. Тесты остаются зелёными |

---

## 2. Дубли: где мы сравнивали и почему выбрали так

### 2.1. Прерывание — четыре реализации

| | TEN | Open-LLM-VTuber | LiveTalking | MiniCPM |
|---|---|---|---|---|
| Где | `main_python/extension.py:198` | `conversation_handler.py:112` | `base_avatar.py:185` | `duplex.py::set_break` |
| Что гасит | LLM + TTS + RTC-канал | asyncio-таск разговора + TTS-очередь | очередь аудио аватара | KV-состояние модели |
| Владение поколением | `turn_id` в метаданных каждого сообщения | `session_emoji` для логов, отмена по таску | `flush` по сессии | нет |
| Помнит услышанное | ❌ | ✅ `heard_response` → в историю | ❌ | ❌ |
| Гасит рот аватара | через `flush` в RTC | ❌ | ✅ | — |

Ни одна не покрывает всё. **Собираем из трёх:** каркас TEN (`_interrupt`
гасит три подсистемы одним вызовом, всё владеется `turn_id`), плюс
`heard_response` из Open-LLM-VTuber (оппонент должен знать, что успел сказать
до того, как его перебили — иначе он повторится и это сразу видно), плюс
`flush_talk()` LiveTalking как третий адресат.

Это ровно тот случай, про который в задании сказано «выбрать лучший как
основной, из остальных взять только действительно полезные дополняющие
куски».

### 2.2. VAD — три реализации

Silero (MiniCPM, Open-LLM-VTuber) против TEN VAD. Решает частота
принятия решения: `hop_size_ms: 16` у TEN против 32 мс окна Silero — вдвое
меньше задержки на определение начала речи, а barge-in измеряется именно ею.
TEN VAD ставится из pip готовой нативной либой, GPU не нужен.
Silero оставлен вторым провайдером — на случай проблем с нативной сборкой.

### 2.3. Резка на фразы — две реализации

TEN `parse_sentences` — 20 строк, режет по `.!?`. Open-LLM-VTuber
`SentenceDivider` — pysbd с русским языком, обработка `Mr.`/`т.е.`, запятая как
аварийная граница для длинного куска, и разбор тегов `[joy]` прямо из потока.
Для русского и для мимики выбор очевиден.

---

## 3. Что из этого не поехало и почему

| Не берём | Откуда | Причина |
|---|---|---|
| `ten_runtime` (граф, extension-модель) | TEN | Agora App ID + сборка C++/Go. Паттерн оркестрации переносим кодом, рантайм — нет |
| `agora_rtc` | TEN | Платный внешний сервис. WebRTC берём у LiveTalking (aiortc, self-hosted) |
| Live2D-рендерер | Open-LLM-VTuber | Задание прямо разрешает выкинуть. Нам нужен фотореалистичный человек, а не аниме-модель |
| MiniCPM-o 4.5 (сама модель) | MiniCPM | 9B на GPU. Мозг оппонента — OpenRouter |
| `MiniCPMO45/` (7 тыс. строк модели) | MiniCPM | Следствие предыдущего |
| Duix Android/iOS SDK | Duix | Отдельное мобильное приложение, вне итерации. Контракт событий забран |
| `basic_memory_agent` целиком | Open-LLM-VTuber | Истина игры — движок, агенту нечего помнить сверх того |
| Групповые разговоры, bilibili-лайв, MCP-инструменты | Open-LLM-VTuber | Вне продукта |

---

## 4. Роль OpenRouter (проверено на живом ключе)

Запрошен `/api/v1/models`, 421 модель. Что реально доступно:

| Задача | Модель | Цена вход/выход за M | Проверено |
|---|---|---|---|
| Мозг оппонента | `moonshotai/kimi-k3` | $3 / $15 | ✅ есть в каталоге, **но дефолтом не стал**: в коде это константа `PREMIUM_OPPONENT`, а дефолт — `google/gemini-3.5-flash-lite` |
| Тяжёлое рассуждение (разбор, генерация сценария) | `z-ai/glm-5.3` | $1.4 / $4.4 | ✅ в каталоге, **отвергнута живым замером**: 142 с на две попытки и ни одного валидного JSON. Дефолт роли — `google/gemini-3.5-flash-lite` |
| Судья каждого хода (быстрый) | `google/gemini-2.5-flash-lite` | $0.10 / $0.40 | ✅ дефолт с 29 августа 2026: прежний `google/gemini-3.5-flash-lite` не читал русский объективный критерий (docs/model-bakeoff.md) |
| Зрение | `google/gemini-3.1-flash-lite` | $0.25 / $1.50 | ✅ мультимодальный |
| **ASR** | `google/gemini-3.7-flash` | $0.375 / $1.875 | ✅ `input_modalities` содержит `audio` |
| **TTS** | `openai/gpt-audio-mini` | audio_output $2.4 | ✅ `output_modalities` содержит `audio` |

Отдельного `/audio/transcriptions` у OpenRouter нет — ASR идёт как аудио-часть
сообщения в chat completions. Это работает, но добавляет накладные расходы на
base64 и не даёт частичных гипотез.

**Русский голос.** В задании прямо сказано не жертвовать качественным русским
голосом ради «всё через OpenRouter». `edge-tts` даёт `ru-RU-SvetlanaNeural` и
`ru-RU-DmitryNeural`, стримит чанками, стоит ноль. Поэтому **TTS по умолчанию —
edge-tts**.

**Вторым провайдером стал не `gpt-audio-mini`.** В
`services/gateway/app/providers/tts/` лежат ровно две реализации: `edge.py` и
`openai_speech.py` (`NEGO_OPENAI_TTS_MODEL`, дефолт `gpt-4o-mini-tts`) — довод
тот же, что и везде, замер: на заведомо новом тексте edge даёт медиану 2318 мс
до первого звука, `gpt-4o-mini-tts` — 936 мс. Провайдера `openrouter` в каталоге
TTS нет. Оба существующих — за одним интерфейсом.

---

## 5. Итог: победитель по каждой capability

```
Realtime-сессия и протокол   → MiniCPM-o          (перенос протокола + клиента)
Клиент WS / аудиоплеер       → MiniCPM-o          (порт JS → TS)
Захват медиа в браузере      → MiniCPM-o          (порт)
VAD                          → TEN VAD            (pip, нативная либа)
Детектор конца реплики       → TEN                (перенос файла + OpenRouter)
Паттерн прерывания           → TEN + Open-LLM-VTuber + LiveTalking (сборка из трёх)
Резка на фразы + теги мимики → Open-LLM-VTuber    (перенос файла)
Упорядоченный параллельный TTS → Open-LLM-VTuber  (перенос класса)
Интерфейсы ASR/TTS           → Open-LLM-VTuber    (перенос интерфейсов)
Транспорт и рендер аватара   → ⛔ отменено        (кода LiveTalking нет — карта §12)
Липсинк                      → ⛔ отменено        (делает OpenTalking; у нас lipsync: false)
Хореография                  → словарь событий Duix (от LiveTalking не осталось ничего)
Мобильный рендерер           → Duix               (контракт забран, реализация — позже)
Облачный инференс            → OpenRouter         (chat / vision / asr, + edge-tts)
Истина игры                  → наш движок         (не тронут)
```
