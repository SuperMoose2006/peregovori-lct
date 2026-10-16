# Технический аудит: исправления P2, 16 октября 2026

Продолжение [первого аудита](TECH_AUDIT.md). База этого прохода `9154eb0`,
ветка `task/peregovori-lct-33051`. Фронтенд не изменялся; выкатки,
перезапуска `dialog`, платных проверок и изменений данных стенда не было.

## Исправления и доказательства

| Задача | Коммит | Поведение и проверка |
| --- | --- | --- |
| Принудительный судья офлайн | `1c441f1` | `network_enabled()` проверяется до `NEGO_JUDGE`: off теперь сильнее принудительного on. Health и runtime gate согласованы. Бывший strict xfail сначала запущен с `--runxfail` и упал; после правки стал обычным зелёным тестом. Набор health/judge/reproducibility: **76 passed**. В тестах семантического судьи явно подменён gate, вызовы остаются подменёнными/офлайновыми. |
| Отправка WS | `3029b3c` | Каждое событие `_pump`: **10 s** на отправку; при timeout/ошибке — retryable close **1013**, не более **1 s** на закрытие. Reader штатно завершает соединение и сохраняет движок для resume. Отмена writer при takeover не превращается в ошибку и не закрывает чужую партию. Три теста hang/error/slow-close красные до правки; профильный набор **9 passed**. |
| Idle и общий бюджет видео | `377eca7`, тесты `ee3b90e` | **300 s** без активности и **1800 s** всего на adapter/соединение, включая ротации провайдера. Настройки `NEGO_LIVE_VIDEO_IDLE_TIMEOUT_S` (1..3600), `NEGO_LIVE_VIDEO_MAX_SESSION_S` (1..14400); NaN/0/невалидные значения заменяются безопасным дефолтом с warning. Бюджет отключает драйвер и запрещает автоматическую покупку новой сессии до конца этого соединения. Портрет, текст и партия остаются. Публикуется `live_video_budget` с пояснением RU/EN. Активное воспроизведение/реальный звук продлевают idle, фоновые кадры и смена настроения — нет. Три исходных теста красные до правки; итог **6 passed**, оба режима audio/text, активность не сбрасывает общий бюджет. |
| Наблюдаемость LLM/TTS/ASR | `980f13c` | `app/observability.py`: JSON в stderr/journal, длительности, первый чанк, outcome и накопительные счётчики. 8 первоначальных integration-тестов красные до правки; после дополнения cloud-ASR — **10 passed**. Отдельный набор TTS/ASR/streaming — **43 passed**. |
| Безопасный линт | `e260670` | **54 → 15** замечаний. Убраны неиспользуемые импорты, semicolon statements, lambda assignments и неоднозначные имена. Экспорты `engine.engine.analyze` и `providers.asr.Transcript` сохранены явными alias. Разделение semicolon проверено равенством AST до/после; профильный pytest **121 passed**. Ruff E7/E9/F теперь зелёный; полный E4/E7/E9/F оставляет только обоснованные E402 ниже. |
| Диагностика starvation | `42c4229` | События из сокета LiveAvatar теперь WARNING + JSON со счётчиком и параметрами подачи аудио. Старый код не выдавал структурного события (красный тест); новый — выдаёт, без текста поставщика. **31 passed, 3 SDK skipped** вместе с vendor-набором. Буферизация/качество/частота видео не менялись. |

Копии red/green результатов: `docs/tech-audit-p2-20261016/`.
Первоначальные red-прогоны сохранены до изменения реализации. Для линта
красный результат — JSON baseline, зелёный — Ruff E7/E9/F и профильный pytest;
новые тесты, дублирующие форматирование кода, не добавлялись.

## Формат и границы метрик

Каждый реально начатый вызов пишет одну строку `provider_call`:

```json
{"event":"provider_call","operation":"llm.complete","provider":"openrouter","role":"judge","outcome":"error","error_kind":"timeout","duration_ms":0.021,"first_chunk_ms":null,"call_count":1,"error_count":1}
```

Поля:

- `operation`: `llm.complete`, `llm.stream`, `tts.synthesize`, `asr.transcribe`.
- LLM: общий OpenRouter-клиент; ASR: classic Parakeet и явно выбранный OpenRouter;
  TTS: менеджер синтеза фраз, включая голос сервиса видео.
- `duration_ms`: полная длительность попытки в шлюзе до завершения, ошибки или
  отмены; у TTS — синтез, не время проигрывания в колонках.
- `first_chunk_ms`: первый непустой чанк LLM/TTS; null для complete, ASR и отказа
  до чанка. Это не измерение end-to-end задержки пользовательского интерфейса.
- `outcome`: success/error/cancelled. Отмена внешним бюджетом или уходом сокета
  видна как cancelled: по одному CancelledError провайдер не может отличить их.
  Внутренний TTS timeout и HTTP timeout учитываются как error/timeout.
- `error_kind`: timeout/http_429/http_4xx/http_5xx/transport/invalid_response/error;
  без сообщения исключения и содержимого ответа.
- `call_count`/`error_count`: накопительные счётчики по operation/provider/role,
  **внутри одного процесса**. Обновление под lock; рестарт сбрасывает счётчики.

Нет payload, prompt, текста пользователя/распознавания, PCM, URL, id сессии,
ключей или exception message. Логирование INFO работает и при обычном Uvicorn
без root handler; это проверено отдельным локальным процессом без сети.
Метрики не добавлены в публичный health. Неприменимые офлайн-вызовы не считаются
успешными сетевыми запросами и не создают provider_call.

OpenAI Realtime ASR использует отдельный длительный поток, а не classic
`transcribe`; поминутной/пофразовой телеметрии для него в этом изменении нет.
На проверенном стенде был classic Parakeet. Общие RSS/FD/task-метрики и persistent
хранилище партий также не добавлялись — их отсутствие остаётся ограничением,
а не скрывается успешными тестами провайдеров.

После будущей выкатки собирать факты можно без платных проверок:

```bash
journalctl -u dialog --since '2 weeks ago' -o cat > /tmp/dialog-journal.txt
python3 - /tmp/dialog-journal.txt <<'PY'
import collections, json, sys
rows = []
for line in open(sys.argv[1]):
    try:
        record = json.loads(line)
    except json.JSONDecodeError:
        continue
    if isinstance(record, dict) and record.get('event') == 'provider_call':
        rows.append(record)
for operation in sorted({r['operation'] for r in rows}):
    group = [r for r in rows if r['operation'] == operation]
    times = sorted(r['duration_ms'] for r in group)
    print(operation, 'attempts=', len(group),
          'outcomes=', dict(collections.Counter(r['outcome'] for r in group)),
          'errors=', dict(collections.Counter(r['error_kind'] for r in group if r['outcome'] == 'error')),
          'p95_ms=', times[max(0, (len(times) * 95 + 99) // 100 - 1)])
PY
```

Считать число попыток по событиям, а не складывать накопительные error_count.
Статистику длительности полезно также группировать по outcome/role/provider.

## Почему возникли предупреждения LiveAvatar

Сохранённый журнал (`/tmp/dialog-tech-audit/journal.jsonl`) содержит:

- 13 октября 09:07:02.657 UTC — connected;
- 09:07:03.007 — `4 frames missed (160ms gap)`;
- 09:07:25.927 — `1 frames missed (40ms gap)`;
- 09:08:48.499 — сводка реплики: 503 кадра, 100% в такт, p95 отставания
  696 ms при удержании звука 1000 ms.

**Установленный источник сообщения** — входящий `warning` в
`LiveAvatarDriver._read_ws`, сокет команд поставщика. Это не warning,
сгенерированный нашим браузером или фильтром локальных JPEG. Сервис сообщил о
кратковременной нехватке кадров; локальная буферизация позволила показать
учтённые кадры в такт. «100% в такт» не доказывает, что сервис не пропускал кадры.

**Гипотезы, не доказанная первопричина:**

1. Первый warning через 350 ms после connected совместим с прогревом рендера
   или недостаточным начальным запасом входного звука.
2. `_push` отправляет сначала 400 ms аудио, далее копит до 1000 ms;
   таймер `_flush_soon` отдаёт неполный пакет после 200 ms без продолжения.
   При разрывах в выдаче TTS или задержке event loop сервис может исчерпать
   запас аудио до следующего пакета. Эти параметры унаследованы от замеров,
   а в старом журнале нет таймингов отправки, чтобы подтвердить эту гипотезу.
3. Внутренний рендер/нагрузка поставщика также возможны; по одному предупреждению
   командного сокета их нельзя отличить от голодания по нашему аудио.

Очевидной безопасной правки именно причины по этим данным нет. Уменьшение
пакетов или увеличение стартового буфера без замера меняет задержку губ/голоса.
Вместо недоказанной настройки добавлены поля `live_video_warning`:
`warning_kind`, `warning_count`, `frames_missed`, `service_gap_ms`,
`since_audio_send_ms`, `last_chunk_audio_ms`, `audio_chunks_sent`,
`buffered_audio_ms`. Неизвестные виды предупреждений сведены к `other`.
Числа frames/gap извлекаются из известного формата; при другом формате — null.
Их достаточно, чтобы следующую реальную сессию анализировать без отдельного
платного нагрузочного прогона.

## Оставшийся линт: 15 E402 с причиной

| Место | Количество | Почему не переносить автоматически |
| --- | --- | --- |
| `services/gateway/app/main.py`: 39, 40, 41, 42, 43, 45, 46, 47, 101, 104, 122, 503 | 12 | До импорта зависимостей вызывается `_load_dotenv()`. Другие импорты разделены настройкой приложения/константами. Автоперенос наверх меняет момент чтения окружения и порядок инициализации. Без необходимости такую перестройку не делаем. |
| `services/gateway/app/vendor/olv/sentence_divider.py`: 31, 32, 33 | 3 | Между импортами создаётся module logger, затем идут остальные импорты перенесённого upstream-кода. Сохранены порядок и минимальное расхождение с upstream. |

Команды:

```bash
services/gateway/.venv/bin/python -m ruff check --isolated --select E4,E7,E9,F services/gateway/app services/asr-parakeet adapters --output-format json
services/gateway/.venv/bin/python -m ruff check --isolated --select E7,E9,F services/gateway/app services/asr-parakeet adapters
services/gateway/.venv/bin/python -m pytest services/gateway/tests -q -rs
services/gateway/.venv/bin/python -m compileall -q services/gateway/app services/asr-parakeet adapters
git diff --check
```

## Итог проверки

**Полный pytest: 3080 passed, 162 skipped, 0 failed, 0 xfailed, 84.74 s.**
Отдельный regression-набор: **58 passed**. Два предупреждения — прежние deprecation
Starlette/httpx и AnyIO. 162 skip: 158 неприменимых параметров банка курса,
1 платная live-генерация, 3 отсутствующих optional SDK. Compileall и `git diff
--check` зелёные. Полные результаты сохранены рядом с отчётом.
Никакой вывод о реальной скорости платных провайдеров не сделан по заглушкам.
Фронтенд-тесты из первого аудита в этом проходе не переписывались и не запускались
против платного стенда; их два красных результата передаются UX-сессии.
