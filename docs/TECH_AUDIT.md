# Технический аудит «Диалога» — 16 октября 2026, UTC

База: `738d802` (master на начало работы). Ветка: `task/peregovori-lct-33051`.
Проверены код шлюза, ASR, сборка фронтенда, тесты и журнал работающего сервиса.
Экраны и тексты фронтенда не менялись. Стенд не обновлялся, `dialog` не
перезапускался, другие службы и Docker не затрагивались. Данные стенда не менялись.
Проверочные платные вызовы намеренно не выполнялись: отказы проверялись заглушками.

## Проверки и воспроизведение

Локальное окружение: Python 3.14.4, Node 22.22.1; зависимости установлены через
`pip install -r services/gateway/requirements.txt -c services/gateway/requirements.lock`
и `cd frontend && npm ci`. Это окружение аудита, не доказательство совместимости
со всеми Python: lock описывает Python 3.13; production имеет собственную venv.
`pip check` → `No broken requirements found.`

| Команда | Результат |
| --- | --- |
| `services/gateway/.venv/bin/python -m pytest services/gateway/tests -q -rs` | **3059 passed, 162 skipped, 1 xfailed**, 0 failed, 92.58 s |
| `cd frontend && npm test` | 668 tests: 663 pass, 0 fail, 5 todo |
| `cd legacy-node && npm test` | 14 passed, 0 failed |
| `cd frontend && npm run typecheck` | exit 0, `tsc -b --force` |
| `cd frontend && npm run build` | exit 0, `tsc -b && vite build`, 2.71 s |
| `python -m compileall -q services/gateway/app services/asr-parakeet adapters` | exit 0 |
| `python -m ruff check --isolated --select E4,E7,E9,F services/gateway/app services/asr-parakeet adapters` | 54 замечания, те же 54 на чистом `738d802` |
| `python -m ruff check --isolated --select E9,F63,F7,F82 services/gateway/app services/asr-parakeet adapters` | `All checks passed!` |
| `git diff --check` | exit 0 |

Команды `python -m ruff` выше выполняются Python из локальной venv. Линтер
не был настроен в репозитории: явно выбран переносимый набор E4/E7/E9/F,
без автоправок. Распределение: E702=21, E402=16, F401=13, E731=2, E741=2.
Отдельных ESLint, mypy/pyright и соответствующих проектных конфигураций нет;
не следует выдавать `compileall` за проверку типов Python. TypeScript проверяется
в strict-режиме, включая unused locals/parameters.

Первый pytest запускался параллельно с первой сборкой и дал **4 failed,
3033 passed, 171 skipped, 4 xfailed**. Все четыре отказа —
`test_protocol_abuse.py::test_spa_fallback_never_serves_files_outside_dist`:
ожидалось 200, получено 404. Причина: `app.main` импортирован до появления dist
(маршрут SPA не зарегистрирован), а тест проверил существование dist уже после
сборки. Это зависимость теста от порядка подготовки, не обнаруженная утечка файлов.
Для воспроизводимого полного прогона сначала собрать фронтенд, затем запускать pytest.
Из 162 skip: 158 относятся к неприменимым параметрам банка курса, 1 — к платной
живой генерации и 3 — к отсутствующим optional SDK anam/simli/livekit. Оставшийся
strict xfail описан в строке Health ниже. Два warning — deprecation Starlette/httpx
и AnyIO BlockingPortal.

Один промежуточный прогон также пересёкся с изменением исходника: структурные
`inspect.getsource` тесты прочитали строки по старым смещениям. Финальный прогон
проводился после завершения правок. Новые WS-тесты изолированы от глобального
HTTP-пула других тестов и не закрывают его через lifespan приложения.

Браузерные тесты выполнялись против **отдельного бесплатного шлюза**:

```bash
NEGO_AI=off NEGO_JUDGE=0 NEGO_HTTP_PASSWORD='' NEGO_LIVE_VIDEO=off \
NEGO_ATTESTATION_DB=/tmp/dialog-tech-audit/attestation.sqlite \
services/gateway/.venv/bin/python -m uvicorn app.main:app \
  --app-dir services/gateway --host 127.0.0.1 --port 18351
cd frontend
node e2e/smoke.mjs --url http://127.0.0.1:18351 --out /tmp/dialog-tech-audit/smoke
node --import tsx e2e/course.mjs --url http://127.0.0.1:18351 --out /tmp/dialog-tech-audit/course
node e2e/improvements.mjs --url http://127.0.0.1:18351 --out /tmp/dialog-tech-audit/improvements
node e2e/flows.mjs --strict --url http://127.0.0.1:18351 --out /tmp/dialog-tech-audit/flows
node e2e/ui.mjs --strict --url http://127.0.0.1:18351 --out /tmp/dialog-tech-audit/ui
```

На VM Chromium сначала не стартовал: `libnspr4.so: cannot open shared object file`.
Для запуска использованы скачанные `apt download libnspr4 libnss3`, распакованные
`dpkg-deb -x` **только в /tmp**, без установки системных пакетов:
`LD_LIBRARY_PATH=/tmp/dialog-tech-audit/browser-libs/root/usr/lib/x86_64-linux-gnu`,
`CHROME_PATH=/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`.
Эти переменные нужны перед браузерными командами выше.

Результаты:

- `smoke`: обход пройден, ошибок нет.
- `course`: первый блок целиком, уроки и капстоун, экзамен **12/12**, следующий блок открыт.
  Это стандартный объём команды, не весь курс и не все 11 блоков.
- `flows --strict`: **5/5** сценариев прошли, 93 проверки.
- `ui --strict`: **4/5** сценариев прошли; `language` красный по доступности RU/EN.
- `improvements`: красный, `selectOption("challenge")` на строке 107 ждёт 30 s:
  у текущего `ScenarioPicker.tsx` значения вариантов числовые из `DIFFICULTY_MODES`.
  Нужно обновить тест под три существующих уровня, а не возвращать четвёртый уровень.

Остальные файлы `frontend/e2e` — специализированные приборы для отдельных
фикстур/портов, некоторые жёстко обращаются к платному публичному стенду.
Они не запускались массовым glob. Выполнены три сценария штатного `make e2e`
и два дополнительных набора. Live e2e с платными провайдерами не выполнялись.

## Стенд против master: фактическое отставание

Команды: `readlink -f /opt/dialog/current`, проверка SHA-256 каждого файла из
`release-manifest.json`, `git merge-base --is-ancestor f039081 738d802`,
`git rev-list --count f039081..738d802`, `git diff f039081 738d802 --stat`.

- `/opt/dialog/current` → `/opt/dialog/releases/20260929-f039081`.
- Manifest содержит **566 файлов**; все 566 присутствуют и совпадают с указанными
  SHA-256. Из непосредственно сравнимых до сборки **184 файла совпали** с master,
  **0 различий**, остальные 382 — сборка/упакованные артефакты.
- `f039081` — предок `738d802`; между ними **6 коммитов**.
- Изменения в master: `App.tsx`, `Chat.tsx`, `Table.tsx`, `layers.ts`, тест слоёв,
  probe прокрутки, документ и PDF презентации. Бэкенд не менялся.
- На чистой базе `738d802` выполнены `npm run build` и
  `bash deploy/pack-release.sh /tmp/dialog-tech-audit/master-release`.
  Получен manifest из **566 файлов**: 526 путей и хешей совпали;
  **19 старых asset-путей исчезли, 19 новых появились, 2 общих файла изменились**
  (`frontend/dist/index.html`, `frontend/dist/sw.js`). Всего 40 несовпадающих путей.
  [Полный diff manifest с обоими SHA-256](tech-audit-20261016/manifest-build-diff.json).

**Вывод: стенд отстаёт от master по фронтенду; бэкенд совпадает.**
Manifest подтверждает содержимое артефакта, не зависимости venv, /etc/dialog.env
или код, уже импортированный в память. Изменения этой ветки на стенде отсутствуют.

## Журнал за две недели

`journalctl -u dialog --since '2 weeks ago' -o json` сохранён локально в
`/tmp/dialog-tech-audit/journal.jsonl`. На момент сбора **29 записей, все PRIORITY=6**,
период с 2 октября до момента аудита 16 октября. Сырые IP посетителей в git не внесены.

| Причина / категория | Наблюдение |
| --- | --- |
| Ошибки, исключения, падения | 0 записей с traceback/exception/error; рестартов systemd 0 |
| LiveAvatar video starvation | 2 предупреждения **внутри INFO** 13 октября: 4 frames / 160 ms и 1 frame / 40 ms |
| Видео / синхронизация | 7 сводок реплик; p95 отставания кадра 549–808 ms, максимум 864 ms; удержание аудио 1000 ms; сводки показывают 100% кадров в такт |
| Соединения | 5 открытий и 5 закрытий WebSocket; 5 подключений LiveAvatar |
| Медленные API / LLM | Нет длительности запросов/ходов и access-log выключен; по этому журналу p95 API или TTFT определить нельзя |
| Утечки | Нет истории RSS, числа задач/дескрипторов; отсутствие утечки не доказано |

`systemctl show dialog -p ActiveEnterTimestamp -p NRestarts -p MemoryCurrent -p MemoryPeak`:
запущен **2026-09-29 20:01:56 UTC**, `NRestarts=0`, первая память
239489024 B, повторная 250384384 B; `MemoryPeak=305602560 B` в обоих снимках.
Это два снимка (≈228 и ≈239 MiB; пик ≈291 MiB), не тренд утечки.

## P0

Подтверждённых P0 в проверенном объёме нет. Это не заключение об отсутствии
всех уязвимостей и не результат нагрузочного теста платных сервисов.

## P1 — исправлено

| ID / место | Дефект и воспроизведение | Исправление / проверка |
| --- | --- | --- |
| T1 `realtime/endpoint.py`, `admission.py` | Открыть WS и не послать init: висит без срока; `MAX_WEBSOCKETS=1` не препятствовал второму сокету. Модуль admission существовал, но не использовался. | `0ab2fe8`, совместимость `646c331`: lease до accept, освобождение в finally, абсолютные 10 s на init, 128 сокетов/процесс. `test_ws_admission.py`: 4 теста, первые два красные на базе; мусор не продлевает срок, начатая партия переживает init deadline. |
| T2 `realtime/endpoint.py::_send_hint` | Подменить `orchat.complete` вечным ожиданием, отправить `coach.request`: совет не приходит; read timeout httpx не является общим бюджетом ответа. | `f40dab5`: общий бюджет **6 s**, отмена зависшего запроса, локальный совет. `test_hint_timeout.py` красный без правки, зелёный с ней. |
| T3 `services/asr-parakeet/server.py` | `/transcribe`: X-Sample-Rate=0/-16000 или тело 3 байта → 500 (3 известных strict xfail). | `9ac0e39`: HTTP 400 для частоты вне 1..192000, тела не кратного 4, NaN/Inf; float32 little-endian. Старые xfail сняты после красного прогона, добавлены 3 случая. ASR-набор: **22 passed**. |
| T4 `realtime/bus.py`, `endpoint.py::_pump` | Заполнить EventBus и опубликовать `response.done`: событие молча теряется, сокет остаётся жив; человек ждёт завершения. | `67cda2a`: overflow помечает поток повреждённым, выдаёт `output_overflow`, закрывает WS кодом **1013**. Клиент допускает reconnect/resume на этом коде; движок сохраняется штатным finally. `test_bus_overflow.py`: оба теста красные до правки; профильный набор **40 passed**. |

Команда регрессий:
`services/gateway/.venv/bin/python -m pytest services/gateway/tests/test_ws_admission.py services/gateway/tests/test_hint_timeout.py services/gateway/tests/test_bus_overflow.py services/gateway/tests/test_asr_sidecar.py -q`.
Регрессионный набор: **27 passed**, 0 failed. Все новые тесты используют заглушки; файлы `*-red.log` фиксируют падение без правки.

## Устойчивость и оставшиеся работы P2

| Сценарий / место | Что уже работает | Что осталось / как воспроизвести и проверить |
| --- | --- | --- |
| LLM недоступна | Судья: бюджет 6 s и до 2 попыток в одном бюджете; оппонент: общий потоковый бюджет 15 s и шаблон; разбор: 8 s. Теперь подсказка тоже ограничена. | Облачные ошибки `chat.py` подавляются без метрик причин. Ввести счётчики timeout/429/5xx и длительности по роли, без prompt/ключей; проверять MockTransport, не платным циклом. |
| TTS недоступна | Менеджер ограничивает обычную фразу 15 s, сообщает `tts_unavailable`, текст остаётся; голос видеосервиса имеет отдельный бюджет 120 s. Тесты empty/error/hang, RU/EN. | Не измерено реальное качество деградации при сетевой аварии; реальные вызовы не делались. Автоматические повторы TTS не добавлялись, чтобы не удваивать платные вызовы и звук. |
| LiveAvatar недоступен | Connect timeout, watchdog кадров/речи, возврат портрета, ограниченные повторные подключения и max_failures, остановка драйвера при уходе сокета. 147 passed в наборе устойчивости, 3 SDK-теста пропущены. | Нет локального общего бюджета оплачиваемых минут/idle-video на партию: vendor max duration может приводить к ротации сессии. Проверить долгую тишину stub-часами, затем добавить отключение только видео по бюджету с сохранением текста и понятным событием. |
| Обрыв WS | Движок остаётся на **300 s** для resume; явный session.close удаляет; отменённый до apply_move ход не списывается. | Store и контекст находятся в памяти: рестарт процесса теряет незавершённую партию. Зафиксировать продуктовый TTL хранения и добавить persistent snapshot, если требуется переживать рестарты; тест восстановлением нового процесса. |
| Две вкладки | Новая партия независима; resume того же id вытесняет прежнего владельца кодом 4409. Старый finally не удаляет новую партию. Клиент на 4409 не переподключается. | Нужен отдельный браузерный прогон именно двух реальных вкладок на текущей UX-ветке; backend takeover покрыт тестами. |
| Долгая партия | Лимит 12 ходов; pending text 2000 символов, кадры 8, PCM 2 MB, лента зрения 60, EventBus 1000 событий. Overflow теперь явный. | После успешного init нет idle TTL всего соединения; активные idle-клиенты могут занимать глобальный cap. `_pump` не имеет собственного send deadline (у Uvicorn ping interval/timeout по 20 s). Проверить мок медленного send и освобождение lease; затем ограничить send и видео, сохраняя возможность resume. |
| Health / `orchestrator/judge.py` | Обычный offline-profile честно сообщает отсутствие облака. | Существующий strict xfail: `NEGO_AI=off NEGO_JUDGE=1` даёт judge=true. Исправить capability и runtime gate совместно; часть текущих тестов специально считает forced judge включённым без сети. Проверка `test_health_honesty.py::test_forcing_the_judge_on_does_not_make_it_claimed_without_network`. |
| Наблюдаемость | INFO-сводки видеосинхронизации и systemd restart/memory limits. | 29 строк за 2 недели недостаточно для оценки здоровья. Добавить гистограммы времени ходов/провайдеров, active sockets/tasks, bus overflow/drop, RSS; starvation выделить отдельной метрикой/уровнем. Проверка искусственным timeout/overflow и отсутствием секретов в записи. |
| Линт / CI | TypeScript strict, pytest, unit/e2e существуют. | 54 унаследованных замечания Ruff; нет закреплённого Python typecheck/общего CI quality gate. Сначала минимальный lint и воспроизводимый порядок build→pytest, затем постепенный baseline типов. |
| Фронтенд, передать UX-сессии | Smoke, первый блок курса, все flows прошли. | `improvements.mjs:107` использует несуществующий challenge; `ui --strict` фиксирует отсутствие aria-pressed/current у RU/EN. Проверка теми же командами после её правок. Экраны/тексты в этой ветке не менялись. |

Сырые диагностические файлы и скриншоты этого запуска: `/tmp/dialog-tech-audit/`.
Сводные доказательства, manifest diff и регрессионные red/green логи сохранены рядом
с этим документом в `docs/tech-audit-20261016/` (в копиях убраны ANSI-цвета
и пробелы в концах строк; исходные логи остаются в /tmp). Будущая выкатка — отдельная задача
после объединения технических и UX-изменений; в ходе аудита выкатки не было.
