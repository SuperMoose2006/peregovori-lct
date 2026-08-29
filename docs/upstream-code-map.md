# Провенанс: откуда взят каждый работающий кусок

Обязательный документ пересборки. Для каждой capability: репозиторий, коммит,
исходные файлы, куда интегрировано, что изменено, почему победило, лицензия.

Правило, по которому заполнялась таблица: **если рабочая реализация в upstream
существует, она переносится, а не переписывается.** Своё пишется только там,
где готового нет — и в таблице это помечено явно.

Клоны для сверки: `.upstream/` (в `.gitignore`; репозитории восстанавливаются
по коммитам ниже). Патчи внутри чужих деревьев — `docs/upstream-patches.md`
(их ноль). Сравнение реализаций — `docs/upstream-feature-matrix.md`.

**Лицензионная сверка проведена 2026-08-29** по первоисточникам: файлы `LICENSE`
в клонах `.upstream/`, файлы `LICENSE` внутри установленных колёс
(`services/gateway/.venv`), и `COPYING` в апстримах кодеков. Всё, что ниже
названо лицензией, прочитано глазами в этот день, а не взято по памяти.

---

## 0. Итог сверки — читать первым

**Ни AGPL, ни non-commercial в том, что уезжает пользователю, нет.** Сетевого
копилефта в продукте нет вообще. Но четыре вещи оказались не тем, чем их
называл этот документ раньше, и одна — прямое нарушение условия лицензии.

| # | Что | Состояние |
|---|---|---|
| 1 | **Nunito в `frontend/public/fonts/`** — раздаётся каждому пользователю без обязательного уведомления OFL-1.1 | **нарушение условия**, чинится добавлением файла |
| 2 | **`av` (PyAV)** тянет колесо, где `libavcodec` слинкован с GPL-кодеками `libx264`/`libx265` | GPL-бинарь в развёрнутом venv; при хостинге обязательств не создаёт, при раздаче образа — создаёт |
| 3 | **`edge-tts` — LGPLv3**, а не «просто бесплатный синтез» | совместимо, но обязательства при раздаче есть |
| 4 | **TEN Framework и `ten-vad` — НЕ чистый Apache-2.0**: Apache плюс условия Agora, включая запрет конкуренции | совместимо при нашем прочтении; само прочтение — вопрос владельца (§5, §18.7). Три файла кода до сих пор пишут «Apache-2.0» (§16.5) |
| 5 | **MiniCPM-o-Demo: лицензии у репозитория нет вообще** — а шапки наших файлов утверждают Apache-2.0 | **утверждение не подтверждается**, см. §1 |

Продукт **хостится** (`docs/hosting.md`, публичный стенд), поэтому различие
«хостинг против раздачи» здесь не академическое:

- **GPL/LGPL не сетевые.** Пока продукт крутится на нашем сервере и бинарники
  никому не передаются, обязательств по раскрытию исходников не возникает.
- **Как только отдаётся образ, архив или установка на чужую машину** — GPL-часть
  (`libx264`, `libx265` внутри колеса `av`) и LGPL-часть (`edge-tts`)
  требуют сопровождения исходниками/предложением исходников.
- **AGPL нигде нет.** Проверено по всем 90 установленным дистрибутивам питона и
  по всем 69 пакетам `node_modules` (сканирование ниже, §17).

---

## 1. MiniCPM-o-Demo — код без лицензии

**Мы несём только КОД. Весов MiniCPM-o в продукте нет и никогда не было.**

Это важно, потому что у MiniCPM две разные лицензии, и путать их — типичная
ловушка:

| Слой | Лицензия | Мы это несём? |
|---|---|---|
| Код репозитория MiniCPM-o-Demo | см. ниже — **не установлена** | да, три файла порта |
| Веса модели MiniCPM-o | «MiniCPM Model Community License»: коммерческое использование требует регистрации, бесплатное разрешение ограничено (порядка ≤5000 устройств / <1M DAU), выводы модели запрещено использовать для улучшения других моделей | **НЕТ** |

Проверка, что весов нет: `git ls-files` не содержит ни одного `.bin`, `.pt`,
`.pth`, `.onnx`, `.safetensors`, `.ckpt`, `.gguf`. Мозг оппонента — OpenRouter
(`NEGO_MODEL_OPPONENT`), модель MiniCPM-o не скачивается, не запускается и её
выводы нигде не используются. Ограничения лицензии весов к нам не применяются.

### Расхождение, которое надо знать

Шапки в `frontend/src/realtime/vendor/*.ts` пишут «Источник: MiniCPM-o-Demo,
**Apache-2.0**». Это утверждение **первоисточником не подтверждается**:

- в клоне `.upstream/MiniCPM-o-Demo` (коммит `50b0865c…`) **нет файла `LICENSE`
  вообще** — `find … -iname "*licen*"` пуст;
- `package.json` репозитория объявляет `"license": "ISC"`;
- в `README.md` и `README_zh.md` слова «license» нет ни разу;
- заголовки `Licensed under the Apache License, Version 2.0` есть **только** в
  каталоге `MiniCPMO45/` — это код самой модели, и он в списке «сознательно не
  поехало»;
- **все четыре файла, которые мы реально портировали**
  (`static/duplex/lib/realtime-session.js`, `audio-player.js`,
  `duplex-utils.js`, `frontend/mobile/src/mobile-duplex.ts`), не несут никакой
  лицензионной шапки.

То есть Apache-2.0 в наших шапках — это добросовестное предположение, сделанное
по соседнему каталогу, а не прочитанная лицензия. **Открытый вопрос владельца:**
либо запросить у OpenBMB явное лицензирование этих файлов, либо переписать три
файла порта своими силами. Пока вопрос открыт, помечаем его здесь, а не
делаем вид, что он закрыт.

| | |
|---|---|
| **Репозиторий** | `https://github.com/OpenBMB/MiniCPM-o-Demo` |
| **Коммит** | `50b0865c819c2f0ca24ec7994e05044e5f39d451` (2026-08-14) |
| **Лицензия по первоисточнику** | **не установлена**: файла `LICENSE` нет; `package.json` → `ISC`; портированные файлы без шапок |
| **Что взято** | realtime-протокол, WS-клиент, аудиоплеер, захват медиа |
| **Веса** | не взяты и не используются |

---

## 2. Сводка репозиториев и лицензий

Проверено 2026-08-29 по файлам `LICENSE` в клонах.

| Репозиторий | Коммит | Лицензия по первоисточнику | Оговорка | Что взято |
|---|---|---|---|---|
| [opentalking](https://github.com/datascale-ai/opentalking) | `7f8e31b890cce31fd176eed7c5f06cc5b3170bf3` | Apache-2.0 (шаблон, поле копирайта не заполнено) | сам каркас чист; **у каждого рендерера липсинка своя история** — §12 | фундамент голосового пути: LLM/STT/TTS-шов |
| [MiniCPM-o-Demo](https://github.com/OpenBMB/MiniCPM-o-Demo) | `50b0865c…` | **не установлена** — см. §1 | веса под отдельной Model Community License, **не взяты** | realtime-протокол, WS-клиент, аудиоплеер, захват |
| [TEN Framework](https://github.com/TEN-framework/ten-framework) | `2e56d9659d8599350962374c0dc24725a03d73ce` | **Apache-2.0 + доп. условия Agora** | не чистый Apache — §5 | VAD, детектор конца реплики, паттерн прерывания, оркестрация |
| `ten-vad` (pip) | версия `1.0.6.8` | **Apache-2.0 + доп. условия Agora** | отдельный артефакт с отдельной лицензией — §5 | нативный VAD, реально исполняется в проде |
| [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) | `992309c0aa19845960228f880013d4685fde93b5` | MIT, © 2025 Yi-Ting Chiu | в репозитории есть `LICENSE-Live2D.md` с отдельными условиями на модели Live2D — **мы их не берём** | резка на фразы, упорядоченный TTS, интерфейсы ASR/TTS |
| [LiveTalking](https://github.com/lipku/LiveTalking) | `36837f90…` | Apache-2.0 | **отклонён**, кода не несём — §12 | ничего |
| [MuseTalk](https://github.com/TMElyralab/MuseTalk) | `0a89dec4…` | MIT, © 2024 Tencent Music Entertainment Group | **отклонён**, кода не несём — §12 | ничего |
| [ditto-talkinghead-livekit](https://github.com/Bolu-Rio-Eigen/ditto-talkinghead-livekit) | `39fed6e` | Apache-2.0 | **отклонён**, кода не несём — §12 | ничего |
| [Duix-Mobile](https://github.com/GuijiAI/duix.ai) | `690fe81dd0bab842d6f7b033ebcefcf30e1b5111` | DUIX.COM Community License | **порог 1000 MAU** и обязательная надпись — §13 | четыре строки-имени событий |

Заголовки в перенесённых файлах не удалены; в каждом стоит рамка с источником
и коммитом. Исключения и пробелы перечислены в §16.

---

## 3. Realtime-протокол сессии

| | |
|---|---|
| **Победитель** | MiniCPM-o-Demo |
| **Исходники** | `gateway.py:1384` (`/v1/realtime`), `docs-app/content/docs/en/realtime-api/{overview,audio,video,chat}.md` |
| **Куда** | `services/gateway/app/realtime/events.py`, `endpoint.py` |
| **Что изменено** | Убрана привязка к их воркеру и режимам `video/audio` (у нас `text/voice`). Добавлены негоциационные события: `turn.analysis`, `engine.state`, `judge.*`, `turn.coach`, `debrief`, `avatar.state`, `vision.observation`, `user.speech.*`, `user.transcript`, `generation.cancelled`. Событие очереди сохранено, хотя очереди нет: клиент — их же порт, и ломать рукопожатие ради одной строки бессмысленно |
| **Почему победил** | Единственный из шести, где протокол отвязан от модели: роутер знает про очередь, режим и сессию, но не про инференс. Покрыт документацией и e2e-тестами (`tests/e2e_realtime.py`). У TEN протокол задан графом рантайма и без него не существует; у LiveTalking — HTTP+SSE, без накопления ввода |
| **Лицензия** | **не установлена** — §1 |

## 4. WS-клиент, аудиоплеер, захват медиа

Три файла порта в `frontend/src/realtime/vendor/`. Инженерная часть не менялась;
изменилась только строка про лицензию — см. §1.

| Файл | Исходник | Что изменено |
|---|---|---|
| `realtime-session.ts` | `static/duplex/lib/realtime-session.js` (627 строк) | JS → TS. Выброшены ветки совместимости со старым протоколом (`result`, `stopped`, `queued`) — мёртвые ветки врут о том, какие события бывают. **Добавлено переподключение с восстановлением партии**: у них сессия живёт в GPU-воркере и переподключиться некуда, у нас состояние держит движок и переживает обрыв сокета |
| `audio-player.ts` | `static/duplex/lib/audio-player.js` (295), `duplex-utils.js::resampleAudio` | JS → TS, убраны запись сессии и телеметрия в DOM. `stopAll()` поднят до явной точки перебивания. Планирование по `AudioContext.currentTime` вместо «пришёл чанк — сыграл»: каждый следующий кусок ставится на конец предыдущего, поэтому нет щелчков |
| `media-provider.ts` | `frontend/mobile/src/mobile-duplex.ts`, `static/duplex/lib/capture-processor.js` | **Размер куска 1000 мс → 120 мс** — у них секунда, потому что их модель ест секундные чанки; для нас это добавило бы почти секунду к задержке перебивания поверх префикса VAD. Воркет грузится из Blob. Убрана мобильная специфика. Сохранено дословно: `echoCancellation: true` и `sinkGain.gain.value = 0` |

**Лицензия всех трёх:** **не установлена** — §1.

## 5. VAD и детектор конца реплики — TEN, и это не чистый Apache

Здесь документ раньше врал упрощением. `LICENSE` у TEN Framework и у пакета
`ten-vad` — **не** текст Apache-2.0. Это Apache-2.0 **плюс дополнительные
условия**, и они читаются до самого текста Apache. Дословно
(`.upstream/TEN/LICENSE`, и слово в слово то же в
`services/gateway/.venv/lib/python3.12/site-packages/ten_vad-1.0.6.8.dist-info/licenses/LICENSE`
с заменой имени продукта):

> Open Source License
>
> The ten-vad is licensed pursuant to the Apache License v2.0, with the
> following additional conditions. You may reproduce, prepare Derivative Works
> of, publicly display, publicly perform, sublicense, distribute, or otherwise
> make available (together, "Deploy") the ten-vad, for commercial or
> non-commercial purposes, provided that you agree to abide by the terms below:
>
> 1. You may not Deploy the ten-vad in a way that competes with Agora's
>    offerings and/or that allows others to compete with Agora's offerings,
>    including without limitation enabling any third party to develop or
>    deploy Applications.
>
> 2. You may Deploy the ten-vad solely to create and enable deployment
>    of your Application(s) solely for your benefit and the benefit of your
>    direct End Users. If you prefer, you may include the following notice in
>    the documentation of your Application(s): "Powered by ten-vad".
>
> 3. Derivative Works of the ten-vad remain subject to this Open Source
>    License.
>
> Copyright © 2025 Agora

У **TEN Framework** условий на одно больше — первым пунктом стоит запрет,
которого у `ten-vad` нет (`.upstream/TEN/LICENSE`):

> 1. You may not (i) host the TEN Framework or the Derivative Works on any End
>    User devices, including but not limited to any mobile terminal devices
>    or (ii) Deploy the TEN Framework in a way that competes with Agora's
>    offerings…

Условий у `ten-vad` пять (1–5), у TEN Framework — столько же, но первым стоит
дополнительный запрет на хостинг на устройствах конечных пользователей.

**Что это значит для нас.** Условие 2 выполняется прямо: продукт разворачивается
для себя и своих прямых пользователей. Запрет на хостинг у конечного
пользователя не задет — TEN-код живёт только на нашем сервере, фронтенд к нему
ходит по сети. Остаётся пункт про конкуренцию, и он **не так очевиден, как
хотелось бы**.

Agora продаёт не только RTC-транспорт, но и Conversational AI Engine — движок
голосовых ИИ-агентов. Мы делаем коммерческий голосовой тренажёр. Формально мы
продаём обучение переговорам, а не движок для чужих голосовых агентов: наш
продукт — конечное приложение, третьим лицам мы ничего строить не даём, а это
ровно то, что запрещает вторая половина условия 1. По смыслу — **не
конкурируем**. Но фраза «in a way that competes with Agora's offerings»
сформулирована широко, и её толкование — вопрос юридический, а не инженерный.
**Занесён в §18 как непроверяемый.**

**Строгая формулировка вывода:** совместимо при том прочтении, что тренажёр
навыков не конкурирует с платформой голосовых агентов. Это прочтение выглядит
прочным, но оно наше, а не подтверждённое правообладателем.

Сокращать всё это до «Apache-2.0» — неверно, и именно так документ писал до
сегодняшней сверки. Мы в этой ошибке не одиноки: в апстриме открыт
[issue #9](https://github.com/TEN-framework/ten-vad/issues/9) — «Remove the
"Apache 2.0" badge from the README and correct the License section», с телом
«The "additional conditions" make it different from Apache 2.0, it is
misleading to call this repository Apache licensed». На 2026-08-29 issue
**открыт**, значок в их README на месте. То есть на этом ловятся все, кто читает
значок вместо файла.

`ten-vad` реально исполняется в проде — проверено:
`TenVad(256)` инстанцируется, нативная библиотека грузится,
`services/gateway/app/perception/vad.py:94` её импортирует. Это не спящая
зависимость, условия Agora применяются к живому развёртыванию.

`ten-vad` дополнительно несёт `NOTICES` с производным кодом из **LPCNet**
(`lpcnet_enc.c`, BSD-2-Clause, © 2017-2019 Mozilla; сам проект LPCNet —
BSD-3-Clause, © Mozilla / Jean-Marc Valin / Xiph.Org / Mark Borgerding).
Обе BSD — разрешительные, обязательство одно: сохранять уведомление, что колесо
и делает.

### 5.1 VAD

| | |
|---|---|
| **Победитель** | TEN Framework |
| **Исходники** | `ai_agents/agents/ten_packages/extension/ten_vad_python/{extension.py,config.py}`; модель — pip-пакет `ten-vad` |
| **Куда** | `services/gateway/app/perception/vad.py` |
| **Что изменено** | Класс перестал быть extension рантайма (`AsyncExtension`, `ten_env`, `Cmd`) и стал обычным объектом с колбэками. **Логика переходов перенесена дословно**: «все пробы префиксного окна выше порога» / «все пробы окна тишины ниже» |
| **Конкуренты** | Silero ONNX — у MiniCPM (`vad/vad.py`) и Open-LLM-VTuber (`vad/silero.py`) |
| **Почему победил** | Шаг решения 16 мс против 32 мс у Silero — задержка barge-in измеряется именно им. Замерено здесь: **0.12 мс на хоп**, срабатывание на прогретом окне — **96 мс речи** |
| **Оговорка** | Требует системной `libc++1`; окно решений заполняется ~1 с, поэтому в первую секунду после открытия микрофона VAD молчит (976 мс на холодном окне) |
| **Лицензия** | Apache-2.0 **+ условия Agora** (выше) |

### 5.2 Детектор конца реплики

| | |
|---|---|
| **Победитель** | TEN Framework (безальтернативно) |
| **Исходники** | `ten_turn_detection/{turn_detector.py,config.py,utils.py}` |
| **Куда** | `services/gateway/app/perception/turn_detect.py` |
| **Что изменено** | `base_url` с их локальной vLLM-модели `TEN_Turn_Detection` переставлен на OpenRouter. **`max_tokens` с 1 на 16**: их модель обучена отвечать одним спецтокеном, универсальная при таком бюджете возвращает пустоту — детектор молча вырождался в вечное `unfinished`, то есть ход не засчитывался никогда |
| **Что сохранено** | Трёхзначный исход `finished / unfinished / wait`, отменяемая задача, таймаут 5 с, `force_threshold_ms`, `remove_punctuation`, дефолт `unfinished` при любой ошибке |
| **Проверено** | 6/6 на русских случаях, ~500 мс на тёплом соединении |
| **Лицензия** | Apache-2.0 **+ условия Agora** (выше) |

**Веса моделей TEN мы не несём.** Детектор ходит в OpenRouter, а не поднимает
их `TEN_Turn_Detection` локально; `ten-vad` несёт свою нативную модель внутри
колеса, и она покрыта той же лицензией, что и код, — отдельного файла на веса
у него нет.

## 6. Прерывание (barge-in) — сборка из трёх

| | |
|---|---|
| **Основа** | TEN `main_python/extension.py::_interrupt` (Apache-2.0 + условия Agora) |
| **Дополнение** | Open-LLM-VTuber `conversations/conversation_handler.py:112` — `heard_response` (MIT) |
| **Куда** | `services/gateway/app/orchestrator/negotiation.py::interrupt`, `app/realtime/session.py::interrupt` |

Сравнение, по которому сделан выбор (подробности — `docs/upstream-feature-matrix.md` §2.1):

| | TEN | Open-LLM-VTuber | LiveTalking | MiniCPM |
|---|---|---|---|---|
| Гасит LLM+TTS+транспорт одним вызовом | ✅ | частично | ❌ | ❌ |
| Владение поколением | `turn_id` | по таску | по сессии | нет |
| Помнит услышанное до обрыва | ❌ | ✅ | ❌ | ❌ |

`heard_response` — не украшение: без него оппонент не знает, что его оборвали, и
следующей репликой повторяет мысль с начала. В голосе это слышно мгновенно.

**Своё поверх портов:** уровень `generation_id` (у TEN только `turn_id`) и
фильтрация на выходе шины.

> **Правка 2026-08-29.** Раньше здесь третьим адресатом стоял
> `app/avatar/livetalking.py::interrupt` (LiveTalking `flush_talk`). Этого файла
> **больше нет** — он удалён вместе с GPU-провайдером, см. `docs/upstream-patches.md`.
> Кода LiveTalking в репозитории не осталось.

## 7. Резка потока на фразы и теги мимики

| | |
|---|---|
| **Победитель** | Open-LLM-VTuber |
| **Исходник** | `src/open_llm_vtuber/utils/sentence_divider.py` (608 строк) |
| **Куда** | `services/gateway/app/vendor/olv/sentence_divider.py` — **перенесён целиком** |
| **Что изменено** | Только `loguru` → стандартный `logging`. Больше ничего |
| **Конкурент** | TEN `main_python/helper.py::parse_sentences` — 20 строк, split по `.!?` |
| **Почему победил** | pysbd с поддержкой русского, обработка сокращений, запятая как аварийная граница длинного куска и разбор тегов `[emotion]` прямо из потока. `faster_first_response` режет первую фразу по запятой — первый звук уходит раньше |
| **Лицензия** | MIT, © 2025 Yi-Ting Chiu — прочитано в `.upstream/Open-LLM-VTuber/LICENSE`. Шапка файла несёт источник, лицензию, копирайт и полный коммит: **эталон оформления для этого репозитория** |

Модуль не стал избыточным после перехода на OpenTalking: его импортирует сам
адаптер (`adapters/opentalking_negotiation.py`) — им режется поток модели на
фразы перед санитайзером.

## 8. Параллельный синтез с упорядоченной выдачей

| | |
|---|---|
| **Победитель** | Open-LLM-VTuber (безальтернативно) |
| **Исходник** | `src/open_llm_vtuber/conversations/tts_manager.py` (182) |
| **Куда** | `services/gateway/app/orchestrator/tts_manager.py` |
| **Что изменено** | (1) Фраза синтезируется не в **файл**, а в поток PCM-чанков: файл нельзя перебить на середине и нельзя начать играть, пока он не дописан. (2) Добавлена потоковость **внутри** текущей фразы. (3) Добавлено владение поколением |
| **Лицензия** | MIT, © 2025 Yi-Ting Chiu |

## 9. Интерфейсы провайдеров ASR и TTS

| | |
|---|---|
| **Победитель** | Open-LLM-VTuber |
| **Исходники** | `asr/asr_interface.py`, `tts/tts_interface.py` |
| **Куда** | `services/gateway/app/providers/{asr,tts}/base.py` |
| **Что изменено** | TTS отдаёт поток PCM-чанков вместо пути к файлу; ASR-результат получил флаг `final` |
| **Реализации наши** | `providers/tts/edge.py`, `providers/asr/openrouter.py` |
| **Лицензия** | MIT, © 2025 Yi-Ting Chiu |

**Из репозитория Open-LLM-VTuber мы НЕ берём модели Live2D.** У них рядом с
`LICENSE` лежит `LICENSE-Live2D.md` — отдельные условия Live2D Inc. на
сэмпл-данные, и их README прямо предупреждает (`README.md:140`):

> Note: For commercial use, especially by medium or large-scale enterprises, the
> use of these Live2D sample models may be subject to additional licensing
> requirements.

Живого рендерера у нас нет вовсе (лицо оппонента — наши сгенерированные
картинки, §14), поэтому оговорка нас не касается. Записана, чтобы читатель не
решил, что «MIT» покрывает весь их репозиторий целиком: не покрывает.

## 10. Оркестрация хода

| | |
|---|---|
| **Победитель** | TEN Framework |
| **Исходник** | `ai_agents/agents/examples/voice-assistant/tenapp/ten_packages/extension/main_python/extension.py` (213) |
| **Куда** | `services/gateway/app/orchestrator/negotiation.py` |
| **Что изменено** | `ten_env` → наша шина, `_send_to_tts` → наш провайдер, `agora_rtc` → аватар. Добавлены судья и движок в критический путь |
| **Что сохранено** | Структура `_interrupt()`, владение `turn_id`, накопление `sentence_fragment` |
| **Почему не взят рантайм TEN целиком** | Первая нода их графа — `agora_rtc` с `${env:AGORA_APP_ID}`: платная внешняя зависимость. Рантайм — C++/Go, репозиторий 456 МБ |
| **Лицензия** | Apache-2.0 **+ условия Agora** (§5) |

## 11. OpenTalking — фундамент голосового пути

Этого раздела в документе не было, а репозиторий с 2026-08-23 несущий.

| | |
|---|---|
| **Репозиторий** | `https://github.com/datascale-ai/opentalking` |
| **Коммит** | `7f8e31b890cce31fd176eed7c5f06cc5b3170bf3` (2026-08-14) |
| **Лицензия по первоисточнику** | **Apache-2.0**, `.upstream/opentalking/LICENSE` — стандартный текст без райдеров. Поле копирайта в шаблоне не заполнено (`Copyright [yyyy] [name of copyright owner]`); `pyproject.toml:11` подтверждает: `license = { text = "Apache-2.0" }` |
| **Изменённых файлов внутри upstream** | **ноль** — см. `docs/upstream-patches.md` |
| **Куда** | `adapters/opentalking_negotiation.py` — наш движок прикидывается OpenAI-совместимым LLM, и весь их realtime работает поверх него |
| **Что взято как код** | **ничего.** Интеграция — конфигурация (`OPENTALKING_LLM_BASE_URL` и соседние) плюс наш собственный адаптер. Их кода в нашем дереве нет ни строки |

**Направление интеграции важно для лицензии.** OpenTalking зовёт нас, а не мы
его: адаптер смонтирован в наш шлюз (`app/main.py:442`) как сервер. Мы не
линкуемся с их кодом и не распространяем его — он живёт в `.upstream/`, который
в `.gitignore`. Обязательства Apache-2.0 (сохранение уведомлений при
распространении) при таком шве не возникают вовсе.

**Их собственная оговорка** — и она честная, `.upstream/opentalking/docs/zh/index.md:70`:

> OpenTalking 采用 Apache License 2.0。项目中接入或引用的 talking-head 模型、模型权重、
> TTS 服务、LLM 服务和外部推理 backend 可能有各自的许可证或使用条款。部署、分发或商用前，
> 请确认对应项目、模型和服务的授权范围。

(«OpenTalking под Apache-2.0. У подключённых или упомянутых моделей
talking-head, весов моделей, TTS- и LLM-сервисов и внешних backend-ов инференса
могут быть собственные лицензии или условия использования. Перед развёртыванием,
распространением или коммерческим использованием проверьте объём прав
соответствующих проектов, моделей и сервисов.») То есть каркас Apache — а за
рендереры отвечаешь сам. Ровно это и разбирает §12.

## 12. Липсинк: чего у нас нет — и почему это снимает главный риск

> **Раздел переписан 2026-08-29.** Прежняя версия объявляла победителем
> LiveTalking (+ MuseTalk) и указывала «куда» два места, которых **не
> существует**: `services/gateway/app/avatar/livetalking.py` и `services/avatar/`
> (README, `run.sh`). Оба удалены — см. `docs/upstream-patches.md`, раздел
> «Действительно избыточно — 185 строк». Документ на четыре месяца пережил код,
> который описывал.

**В продукте липсинка нет, и это заявлено честно.** Единственный провайдер
аватара — `PresenceAvatar` (`services/gateway/app/avatar/presence.py`): смена
статичных состояний лица, картинки наши. Он объявляет `lipsync=False` в
`capabilities()` и повторяет `"lipsync": False` в **каждом** событии
`avatar.state` — сознательно, чтобы клиент не помнил рукопожатие и не ошибся в
подписи. Правило закреплено тестом
`services/gateway/tests/test_realtime.py::test_presence_avatar_never_claims_lipsync`.

Прямое следствие для лицензий: **ни один рендерер липсинка не находится на пути
исполнения продукта, и ни одного веса липсинка нет на диске.** Все известные
опасности этого класса — теоретические, пока кто-нибудь не переключит рендерер.

### Опасность, которую надо знать заранее

У OpenTalking семь рендереров
(`.upstream/opentalking/opentalking/providers/synthesis/__init__.py`):
`mock`, `flashtalk`, `musetalk`, `wav2lip`, `fasterliveportrait`, `flashhead`,
`quicktalk`. **Ни у одного нет отдельного файла лицензии** — `find` по их
дереву не находит ни `LICENSE`, ни `NOTICE`, ни строки `Copyright` в исходниках.
Всё покрыто одним общим Apache-2.0 репозитория.

И вот где это перестаёт быть формальностью:

- **`wav2lip`.** OpenTalking несёт исходники Wav2Lip у себя в дереве
  (`opentalking/models/wav2lip/{network,model_defs,layers,audio,face_detection}.py`),
  без шапок и без упоминания оригинального проекта, под своим общим Apache-2.0.
  Оригинальный Wav2Lip (Rudrabha/Wav2Lip) выпущен как **research /
  non-commercial**, и коммерческое использование требует отдельной лицензии.
  Веса не поставляются — их документация предлагает тянуть неофициальные
  перезаливки с HuggingFace (`docs/zh/avatar_models/wav2lip-local.md:20`).
  Условий ни Wav2Lip, ни детектора лиц S3FD нигде не приведено.
- **`quicktalk`.** `opentalking/models/quicktalk/runtime_v2.py:1` описывает сам
  себя как *«Minimal Linux-runnable reconstruction of QuickTalk digital human
  inference … rebuilt from the shipped Windows module»* — восстановленный по
  чужому бинарнику код без какой-либо лицензии.
- **`musetalk`** внутри OpenTalking тоже без шапок, но апстрим MuseTalk — MIT,
  поэтому здесь риска нет.

**Ловушка конфигурации.** `.upstream/opentalking/configs/default.yaml:102`
говорит `default_model: wav2lip`. На `mock` систему держит **только** строка
`OPENTALKING_DEFAULT_MODEL=mock` в их `.env` (`.env:43`). Уберите `.env` — и
дефолтом станет самый проблемный по лицензии рендерер. Проверено по логу
живого запуска: `.upstream/logs/opentalking-api-8210.log` показывает
`model=mock`, весов на диске нет, путь Wav2Lip ни разу не исполнялся.

**Вывод для владельца:** сегодня риска нет. Он появляется ровно в тот момент,
когда кто-то включит настоящий рендерер. Тогда условия Wav2Lip и S3FD надо
выяснять у оригинальных проектов напрямую — OpenTalking о них не сообщает.

### Отклонённые кандидаты — кода не несём

| Репозиторий | Лицензия кода | Лицензия весов | Почему отклонён |
|---|---|---|---|
| LiveTalking `36837f90…` | Apache-2.0 (`.upstream/LiveTalking/LICENSE`, пофайловые шапки © 2024 LiveTalking@lipku) | весов в клоне нет (`models/` содержит только `put models here.txt`) | MuseTalk уже есть внутри OpenTalking; отдельный GPU-сервис стал избыточен |
| MuseTalk `0a89dec4…` | MIT, © 2024 Tencent Music Entertainment Group | **есть, и они щедрые** — см. цитату ниже | то же |
| ditto-talkinghead-livekit `39fed6e` | Apache-2.0 | **не определена**: README говорит «*This repository* is released under the Apache-2.0» и отправляет за чекпойнтами на HuggingFace `digital-avatar/ditto-talkinghead`, карточка которой локально не зеркалирована | требует CUDA 12.1 + TensorRT; на машине сборки GPU нет, апстрим запустить не удалось |

MuseTalk — единственный, у кого условия на веса написаны прямо
(`.upstream/MuseTalk/README.md:539`):

> 1. `code`: The code of MuseTalk is released under the MIT License. There is no
>    limitation for both academic and commercial usage.
> 1. `model`: The trained model are available for any purpose, even commercially.
> 1. `other opensource model`: Other open-source models used must comply with
>    their license, such as `whisper`, `ft-mse-vae`, `dwpose`, `S3FD`, etc..
> 1. The testdata are collected from internet, which are available for
>    non-commercial research purposes only.

Обратите внимание на два последних пункта: сам MuseTalk коммерчески свободен, а
вот подгружаемые им чужие модели и его тестовые данные — нет. Это и есть
типичный вид ловушки «лицензия каркаса против лицензии весов».

У LiveTalking сверх Apache-2.0 висит обязательство на **результат**, которого в
тексте лицензии нет (`.upstream/LiveTalking/README-EN.md:199`):

> Videos developed based on this project and published on platforms such as
> Bilibili, WeChat Channels, and Douyin must include the LiveTalking watermark
> and logo.

Нас не касается — кода не несём. Записано как пример того, что читать надо не
только `LICENSE`.

## 13. Словарь событий аватара — Duix

| | |
|---|---|
| **Исходник** | `duix-android/…/duix/sdk/client/Constant.java` |
| **Куда** | `services/gateway/app/avatar/base.py` |
| **Что взято** | Форма событий: `play.start` / `play.end` / `motion.start` / `motion.end` — четыре строковых имени |
| **Что НЕ взято** | Сам SDK (Android/iOS, Java + ncnn `.so`). Мобильное приложение вне итерации |
| **Лицензия** | DUIX.COM Community License, `.upstream/Duix-Mobile/LICENSE` |

**Оговорки, которых здесь раньше не было.** Это не разрешительная лицензия, а
community-лицензия ламовского типа, и у неё два обязательства:

> **§2 Additional Commercial Terms.** If … the monthly active users of the
> products or services made available by or for Licensee … is greater than
> **1 thousand monthly active users** in the preceding calendar month … you must
> request a license from duix.com, which duix.com may grant to you in its sole
> discretion, and you are not authorized to exercise any of the rights under
> this Agreement unless or until duix.com otherwise expressly grants you such
> rights.

> **§1.b.i.** … you shall … prominently display **"Powered by Duix.com"** on a
> related website, user interface, blog post, about page, or product
> documentation.

**Порог 1000 MAU — низкий,** и его стоит держать в голове при любом разговоре о
запуске. Смягчает картину одно: взято четыре строковых литерала с именами
событий, что почти наверняка ниже порога охраноспособности. Но полагаться на
«почти наверняка» — не наш метод, поэтому: **если продукт пойдёт в рост,
дешевле переименовать четыре константы, чем спорить о пороге.** Это решение
владельца, здесь оно только обозначено.

## 14. Лица оппонентов состояниями

| | |
|---|---|
| **Реализация** | Наша (`services/gateway/tools/gen_avatar_states.py`) |
| **Почему не upstream** | Готового генератора набора «персонаж × эмоция» нет ни в одном из семи |
| **Как сделано** | Двухшаговая генерация через OpenRouter: базовый портрет, затем каждое состояние image-to-image от него |
| **Результат** | 72 картинки (8 персонажей × 9 состояний), 1.8 МБ, коммитятся |
| **Лицензия** | наша |

## 15. Истина игры

| | |
|---|---|
| **Победитель** | наш движок (`services/gateway/app/engine/`) |
| **Что осталось нетронутым** | ZOPA, floor, скрытые интересы, лестница реакций, формула `0.4·economic + 0.25·relationship + 0.35·technique`, разбор, «что-если» |
| **Почему** | Ни один upstream не считает переговоры. Они считают речь и лицо |
| **Лицензия** | наша |

---

## 16. Пробелы в атрибуции внутри нашего дерева

Найдено сверкой 2026-08-29. Ни один из пунктов не делает продукт
несовместимым — но CLAUDE.md требует, чтобы у перенесённого кода была шапка с
источником, лицензией и коммитом, и вот где её нет или она неполна.

### 16.1 Шрифт Nunito раздаётся без обязательного уведомления — **условие нарушено**

`frontend/public/fonts/nunito-cyrillic.woff2` и `nunito-latin.woff2` лежат в
git, подключены `@font-face` в `frontend/src/styles.css:7-21` и уезжают в
браузер **каждого** пользователя. Nunito — **SIL Open Font License 1.1**,
«Copyright 2014 The Nunito Project Authors
(https://github.com/googlefonts/nunito)». Условие 2 OFL-1.1 дословно:

> Original or Modified Versions of the Font Software may be bundled,
> redistributed and/or sold with any software, provided that each copy contains
> the above copyright notice and this license.

`grep -ri "SIL Open Font\|OFL"` по всему отслеживаемому дереву даёт **ноль
попаданий**. То есть мы раздаём шрифт без уведомления, которого лицензия
требует буквально при каждой копии.

**Это не несовместимость.** OFL разрешает и связывание, и продажу; чинится
добавлением `OFL.txt` рядом со шрифтами (и, для дизайн-макетов, строкой в их
README). Но пока файла нет — условие не выполнено. Правка вне зоны этого аудита.

Те же шрифты вшиты base64 в `design/immersion/*.dc.html` (17 файлов) и в
`design/immersion/immersion-states.html`, тоже без уведомления.

### 16.2 Vendored Tailwind без шапки и без записи в этом документе

`design/superdesign/vendor/tailwind.js` — 407 КБ минифицированного
**Tailwind CSS v3.4.17**, **MIT License** (самозаявлено внутри самого бандла:
строка `tailwindcss v${dh} | MIT License | https://…`, версия `3.4.17`
подтверждена там же). Файл не несёт шапки: ни источника, ни лицензии, ни
версии. Подключён всеми десятью страницами `design/superdesign/pages/*.html`.

Это **дизайн-макеты, а не продукт**: в `frontend/` Tailwind не входит, в бандл
не попадает, пользователю не уезжает. MIT совместим со всем. Но каталог
`vendor/` без провенанса — ровно то, что CLAUDE.md запрещает, и до сегодня он
не был здесь упомянут.

### 16.3 Собранные дизайн-страницы с вшитыми библиотеками

`design/cjm-canvas/cjm-dialog.html` (2.4 МБ) и
`design/immersion/immersion-states.html` (4.2 МБ) — самые большие файлы
репозитория. Внутри: React 18.3.1 / ReactDOM 18.3.1 (MIT), `@babel/standalone`
7.29.0 (MIT), шрифт Anthropicons, Nunito. Лицензионного блока нет ни у одного.
Всё перечисленное — MIT, кроме шрифтов (§16.1). Опять же: макеты, не продукт.

### 16.4 Сокращённые коммиты в шапках

Шапка обязана нести коммит. Полный SHA стоит в
`frontend/src/realtime/vendor/*.ts` (3 файла),
`app/vendor/olv/sentence_divider.py` и `app/orchestrator/{tts_manager,negotiation}.py`.
**Сокращённый до 8 знаков** — в `app/perception/{vad,turn_detect}.py`,
`app/realtime/{events,endpoint}.py`, `app/providers/{asr,tts}/base.py`,
`app/avatar/base.py`. Восьми знаков хватает, чтобы найти коммит, но сверка по
ним неустойчива — стоит дописать до полных.

Без источника вовсе: `app/realtime/session.py` (документ называет его частью
порта barge-in, §6) и `app/perception/voice_pipeline.py` (несёт «СБОРКА ИЗ ТРЁХ
UPSTREAM-РЕАЛИЗАЦИЙ», но ни лицензии, ни коммита).

`adapters/opentalking_negotiation.py` шапки не несёт — и это, вероятно,
правильно: код наш, чужого в нём нет, он лишь говорит на чужом протоколе.
Записано, чтобы читатель не искал пропажу.

### 16.5 Три файла называют лицензию TEN неверно

Ровно та же ошибка, что была в этом документе, живёт в шапках кода — и там она
не исправлена, потому что зона этого аудита ограничена документом. Первоисточник
(§5) — Apache-2.0 **плюс условия Agora**; в коде написано просто «Apache-2.0»:

| Файл | Что написано | Должно быть |
|---|---|---|
| `services/gateway/app/perception/vad.py:3` | `перенесена из TEN Framework (Apache-2.0, commit 2e56d965)` | Apache-2.0 + доп. условия Agora |
| `services/gateway/app/perception/turn_detect.py:3` | `Перенос из TEN Framework (Apache-2.0, commit 2e56d965)` | то же |
| `services/gateway/app/orchestrator/negotiation.py:5` | `║ Источник: TEN Framework, Apache-2.0 ║` | то же |

Сводная таблица §2 писала «(+ доп. условия)» и была права; построчные записи
разделов про VAD и детектор — нет. **Документ противоречил сам себе**, и
читатель верил той половине, что попалась первой. Половина документа исправлена
сегодня; три файла кода ждут отдельной правки.

### 16.6 Правило шапок ничем не проверяется

Остальные конвенции CLAUDE.md закреплены тестами (`test_doc_links.py`,
`markers.test.ts`, `tokens.test.ts`). Правило провенанса — единственное, что
живёт только декларацией. Именно поэтому §12 четыре месяца описывал удалённые
файлы, и никто не заметил.

---

## 17. Зависимости, которые реально уезжают в продукт

Сверка 2026-08-29 по **файлам `LICENSE` внутри установленных дистрибутивов**
(`services/gateway/.venv/…/*.dist-info/licenses/`) и `package.json` в
`node_modules` — то есть по тому, что поставщик положил в пакет сам, а не по
странице PyPI и не по памяти.

### 17.1 Питон — `services/gateway/requirements.txt`

| Пакет | Роль | Лицензия по первоисточнику | Совместимо с хостингом |
|---|---|---|---|
| `fastapi` | ядро | MIT (`License-Expression: MIT`) | да |
| `starlette` | под fastapi | BSD-3-Clause | да |
| `uvicorn[standard]` | сервер | BSD-3-Clause | да |
| `websockets` | транспорт | BSD-3-Clause | да |
| `pydantic` | схемы | MIT | да |
| `httpx[http2]` | клиент | BSD-3-Clause | да |
| `numpy` | звук | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | да |
| `pysbd` | резка на фразы | MIT, © 2019 Nipun Sadvilkar | да |
| `langdetect` | язык | **Apache-2.0** (файл `LICENSE`: «Copyright 2014-2015 Michal "Mimino" Danilak, Licensed under the Apache License, Version 2.0»), плюс `NOTICE` про Cybozu Labs. Поле `License:` в метаданных пакета говорит `MIT` — **ошибка в метаданных апстрима**; файл лицензии главнее | да |
| `pillow` | генератор лиц (офлайн) | MIT-CMU | да |
| `ten-vad` | VAD | **Apache-2.0 + условия Agora** (§5) | да, условия разобраны в §5 |
| **`edge-tts`** | **синтез речи по умолчанию** | **LGPL-3.0** — см. 17.2 | да при хостинге; обязательства при раздаче |
| **`av` (PyAV)** | декодер MP3→PCM | BSD-3-Clause сам по себе, **но колесо несёт GPL-бинари** — см. 17.3 | да при хостинге; **осторожно при раздаче** |
| `pytest`, `pytest-asyncio` | dev | MIT / Apache-2.0 | dev, не уезжает |

Сплошное сканирование **всех 90** установленных дистрибутивов на копилефт и
non-commercial дало три попадания и ни одного AGPL:

- `edge-tts` → LGPLv3 (17.2);
- `certifi` → MPL-2.0 — пофайловый копилефт на сам пакет, обязательств на нашу
  кодовую базу не создаёт;
- `orjson` → `MPL-2.0 AND (Apache-2.0 OR MIT)` — то же.

Реально импортируемое приложением множество внешних модулей проверено грепом по
`app/` и `adapters/`: `fastapi, httpx, langdetect, numpy, pydantic, pysbd` плюс
стандартная библиотека, и `av` внутри `providers/tts/edge.py:114`. Всё
остальное в venv (`openai`, `aiohttp`, `langgraph`, `tiktoken`, `certbot`,
`acme`) приложением **не импортируется** — это соседи по окружению, не
зависимости продукта.

### 17.2 `edge-tts` — LGPLv3, и это стоит знать

Дословно, `edge_tts-7.2.8.dist-info/licenses/LICENSE`, первые две строки:

> The MIT license is used for 'src/edge_tts/srt_composer.py' only. All
> remaining files are licensed under the LGPLv3.

CLAUDE.md называет edge-tts синтезом по умолчанию, и он им остаётся в нашем
собственном `/v1/realtime` (в шве OpenTalking синтез ушёл на OpenRouter — см.
замеры в `docs/upstream-patches.md`). То есть LGPL-код исполняется в проде.

**Почему это не проблема сегодня.** LGPL — не сетевая лицензия. Мы используем
пакет как отдельный питоновский модуль, не правим его и не линкуемся статически;
при **хостинге** передачи копии не происходит, обязательств не возникает.

**Когда станет проблемой.** При передаче кому-либо образа или архива с этим
venv нужно (а) сохранить уведомления, (б) дать получателю возможность заменить
`edge-tts` своей версией. Для чистого питоновского пакета в `site-packages` это
выполняется само собой, но обязательство существует и должно быть названо.

### 17.3 `av` (PyAV) — BSD снаружи, GPL-кодеки внутри колеса

Это единственное место в продукте, где **GPL-лицензированный код физически
лежит в развёрнутом окружении**. Разбираю подробно, потому что по метаданным
это не видно совсем.

- **Сам PyAV** — BSD-3-Clause (`License-Expression: BSD-3-Clause`; апстримный
  `LICENSE.txt`: «Copyright retained by original committers. All rights
  reserved. Redistribution and use in source and binary forms…»). Про
  лицензию вшитых бинарей апстримный файл не говорит **ничего**.
- **Колесо `av-18.1.0` несёт собственный FFmpeg** — 32 разделяемых библиотеки в
  `site-packages/av.libs/`, среди них `libx264-*.so.165` и `libx265-*.so.216`.
- **`libavcodec` действительно с ними слинкован.** Не догадка — `readelf -d`
  показывает записи `NEEDED` на `libx264-d6533a8d.so.165` и
  `libx265-f5385bb8.so.216`.
- **x264 — GPL-2.0** (`COPYING` апстрима: «GNU GENERAL PUBLIC LICENSE Version 2,
  June 1991»). **x265 — тоже GPL-2.0**, и его `COPYING` заканчивается строкой
  «This program is also available under a commercial proprietary license. For
  more information, contact us at license @ x265.com».
- **Строка сборки FFmpeg** внутри `libavutil` содержит
  `--enable-version3 --enable-libx264 --enable-libx265`, а само `libavcodec`
  сообщает о себе `libavcodec license: LGPL version 3 or later`. **Это
  внутренне противоречиво**: `configure` у FFmpeg не собирает `--enable-libx264`
  без `--enable-gpl`. Разрешить противоречие по бинарю нельзя — см. §18.

**Практический смысл.** Мы используем `av` ровно для одного:
`providers/tts/edge.py` декодирует MP3 от edge-tts в PCM. Видеокодировщики
x264/x265 в этом пути не участвуют **вообще** — они просто приехали в колесе.
При хостинге GPL молчит (сетевого пункта у GPL-2.0 нет). При раздаче образа
GPL-2.0 требует сопровождать бинари исходниками или письменным предложением
исходников.

**Решение владельца, если раздача планируется:** либо выполнять GPL по этим
библиотекам, либо убрать `av` — MP3 от edge-tts можно декодировать и
LGPL-сборкой FFmpeg, и чистым питоновским декодером. Сам не меняю: зона аудита —
этот документ.

### 17.4 Фронтенд — `frontend/package.json`

Просканированы все **69** пакетов в `node_modules`. Копилефта, non-commercial и
пакетов без объявленной лицензии — **ноль**.

| Лицензия | Пакетов |
|---|---|
| MIT | 59 |
| ISC | 5 |
| Apache-2.0 | 3 (`typescript`, `playwright-core`, `baseline-browser-mapping`) |
| BSD-3-Clause | 1 (`source-map-js`) |
| CC-BY-4.0 | 1 (`caniuse-lite` — только атрибуция, dev) |

В **продакшн-бандл** (`--omit=dev`) уезжают ровно пять пакетов: `react`,
`react-dom`, `scheduler`, `loose-envify`, `js-tokens` — все MIT. Остальное
(`vite`, `typescript`, `tsx`, `@vitejs/plugin-react`, `playwright-core`,
`caniuse-lite`) — инструменты сборки и проверки, пользователю не уезжают.

Отдельно: `legacy-node/` — наш первый прототип, автор «LCT team», **ноль
npm-зависимостей**, чужого кода нет.

### 17.5 Своего файла лицензии у продукта нет

В корне репозитория нет ни `LICENSE`, ни `NOTICE`. Для внутреннего/конкурсного
проекта это допустимо, но при любой передаче наружу отсутствие собственных
условий — отдельная проблема, и уведомления третьих лиц (§16.1, 17.2, 17.3)
собирать всё равно придётся. Решение владельца.

---

## 18. Что осталось непроверяемым — и почему

Честный список того, где сверка упёрлась.

1. **Лицензия MiniCPM-o-Demo.** Файла нет, README молчит, `package.json` говорит
   `ISC`, портированные файлы без шапок, а Apache-заголовки лежат в соседнем
   каталоге, который мы не брали. Определить намерение авторов по артефактам
   невозможно — нужен запрос в OpenBMB. До ответа §1 и §3–4 держат вопрос
   открытым, а не закрывают его удобной догадкой.
2. **Под какой лицензией распространялись именно эти сборки `libx264`/`libx265`
   в колесе `av`.** Апстримы — GPL-2.0, и это проверено по `COPYING`. Но оба
   проекта продают и коммерческие лицензии, а `libavcodec` при этом сообщает о
   себе «LGPL version 3 or later». Что именно сделал сборщик колеса, из
   бинарника не следует; нужен ответ от PyAV/их пайплайна сборки.
3. **Условия весов ditto-talkinghead.** README отсылает на HuggingFace
   `digital-avatar/ditto-talkinghead`; карточка модели локально не зеркалирована,
   а в клоне отдельного файла на веса нет. Пока рендерер отклонён, вопрос
   спящий — но при включении его надо закрыть первым.
4. **Условия Wav2Lip и S3FD в том виде, в каком их подаёт OpenTalking.**
   OpenTalking не приводит их вовсе, а веса предлагает брать с неофициальных
   перезаливок. Настоящий ответ есть только у оригинальных проектов
   (Rudrabha/Wav2Lip и S3FD), и получать его нужно у них, а не у посредника.
5. **Провенанс `quicktalk`.** Апстрим сам называет свой файл «reconstruction …
   from the shipped Windows module». Чей это код и на каких условиях —
   из репозитория не устанавливается.
6. **Порог охраноспособности четырёх констант Duix** (§13). Это юридический
   вопрос, а не технический; инженерной сверкой не решается.
7. **Попадаем ли мы под запрет конкуренции с Agora** (§5). Agora продаёт
   Conversational AI Engine; мы продаём тренажёр навыков. По смыслу это разные
   рынки, и наш продукт — конечное приложение, а не платформа для чужих
   агентов. Но формулировка «in a way that competes with Agora's offerings»
   широка, толкуется правообладателем и инженерной проверке не поддаётся.
   Открытый issue #9 в их же репозитории показывает, что неоднозначность видна
   не только нам. **Решение владельца:** принять текущее прочтение, запросить
   у Agora подтверждение, либо заменить `ten-vad` на Silero ONNX (он уже
   рассмотрен как конкурент в §5.1 и остаётся возможным вторым провайдером).

---

## Что из upstream сознательно не поехало

| Не взято | Откуда | Причина |
|---|---|---|
| `ten_runtime` (граф, extension-модель) | TEN | Agora App ID + сборка C++/Go |
| `agora_rtc` | TEN | Платный внешний сервис |
| Live2D-рендерер и сэмпл-модели | Open-LLM-VTuber | Нужен человек, а не аниме-модель; плюс отдельные условия Live2D Inc. (§9) |
| MiniCPM-o 4.5 (модель, 7 тыс. строк) и её **веса** | MiniCPM | 9B на GPU; мозг оппонента — OpenRouter. Model Community License к нам не применяется (§1) |
| `basic_memory_agent` (702) | Open-LLM-VTuber | Истина игры — движок |
| Групповые разговоры, bilibili-лайв, MCP | Open-LLM-VTuber | Вне продукта |
| Duix Android/iOS SDK | Duix | Отдельное мобильное приложение |
| Все семь рендереров липсинка | OpenTalking | Липсинка в продукте нет; `lipsync=False` (§12) |
| LiveTalking, MuseTalk, ditto — целиком | — | Отклонены, кода не несём (§12) |

---

## Что написано нами (готового не было)

| Компонент | Файл | Почему своё |
|---|---|---|
| Шина с фильтрацией отменённых поколений | `app/realtime/bus.py` | У TEN отмена по `turn_id` без выходного фильтра; у MiniCPM отмены на уровне транспорта нет |
| Маршрутизация моделей по роли | `app/providers/routing.py` | Ни у кого нет: у всех одна модель на всё |
| Провайдер edge-tts со стримингом PCM | `app/providers/tts/edge.py` | У Open-LLM-VTuber edge-tts пишет в файл целиком |
| ASR через chat-completions | `app/providers/asr/openrouter.py` | У OpenRouter нет `/audio/transcriptions` |
| Адаптивный сэмплер зрения | `app/perception/vision.py` | У Open-LLM-VTuber кадр уходит по запросу, бюджета нет |
| Лица состояниями | `app/avatar/presence.py` + генератор | См. §14 |
| Отображение реакции движка на лицо | `app/avatar/base.py::REACTION_TO_STATE` | Продуктовая логика |
| Адаптер «движок как OpenAI-совместимый LLM» | `adapters/opentalking_negotiation.py` | Шов, которого нет ни у кого: чужой realtime поверх нашего детерминированного движка (§11) |
