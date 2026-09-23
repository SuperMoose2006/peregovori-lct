# Публичный стенд «Диалог»

Адрес: **https://dialog.2-26-49-28.nip.io**. Сервер: `2.26.49.28`.

```text
Браузер → Caddy :443 (HTTPS + WebSocket)
                    ↓ 127.0.0.1:8010
              FastAPI, один процесс
              ├─ frontend/dist
              ├─ движок переговоров
              └─ сессии в памяти
```

Сервер обслуживает готовый frontend и Python API; Node.js в production не нужен.
Сервисы Caddy и dialog запускаются при загрузке. Caddy автоматически продлевает
сертификат, а systemd перезапускает завершившийся gateway. Сервис работает от
пользователя `dialog`, код принадлежит root. Backend слушает только loopback.

## Что установлено

- Ubuntu 26.04, Python 3.13.15 через uv 0.12.15 в `/opt/dialog/python`.
- Caddy 2.11.4 из официального стабильного apt-репозитория.
- Все 48 Python-зависимостей соответствуют `requirements.lock`.
- `libc++1` для TEN VAD; библиотеки ffmpeg входят в wheel PyAV.
- `/opt/dialog/releases/20260917-01` — первая публичная сборка.
- `/opt/dialog/current` — ссылка на активную сборку.
- `/etc/dialog.env` — настройки, root:root, права 0600.
- `/etc/caddy/Caddyfile`, `/etc/systemd/system/dialog.service` — службы.

Сборка содержит актуальные незакоммиченные изменения рабочего дерева, включая
новые файлы. `git archive HEAD` для этой версии недостаточно.

## Режим работы

При первом запуске `NEGO_AI=off`: переговоры, курс, экзамены, редактор и разбор
работают на текстовом движке. Облачные ответы, распознавание речи, озвучка и
анализ камеры требуют ключей; сейчас они отключены. Реальные ключи должны
попасть только в `/etc/dialog.env`, после чего сервис нужно перезапустить.
Распределение моделей задано в `app/providers/routing.py`.

Для подключения моделей нужны `OPENROUTER_API_KEY`, `OPENAI_API_KEY` и
`OPENAI_REALTIME_KEY`; затем `NEGO_AI=on`, `NEGO_JUDGE=1`. Доступность конкретных
моделей и полный голосовой путь проверяются отдельно после подключения ключей.
На открытом сайте запросы всех посетителей используют серверные API-ключи.

Сейчас вход без пароля. При необходимости `NEGO_HTTP_PASSWORD` включает пароль
для внешних клиентов. Прогресс хранится в браузере пользователя; учётных записей
и синхронизации между устройствами в проекте нет. Активные партии хранятся в
памяти: после сетевого обрыва доступны для возврата 5 минут, после перезапуска
процесса исчезают. Прогресс завершённых занятий в браузере сохраняется.

## Пределы публичного пилота

- 128 WebSocket-соединений на процесс, включая ещё не начавшие партию.
- 12 одновременных партий с одного внешнего IP; общий Wi-Fi делит этот предел.
- 10 секунд на первое корректное начало партии.
- HTTP-тело до 2 МБ; WebSocket-сообщение до 8 МБ, очередь до 4 сообщений.
- Gateway ограничен 2 ГБ памяти и четырьмя ядрами из двенадцати.

Это настроенные пределы, а не обещание обслужить 128 голосовых AI-переговоров.
Измерения текстового режима лежат в отчёте deployment. Другие сервисы виртуалки
не входят в эти лимиты.

Чужие browser Origin отклоняются на WebSocket. Caddy закрывает внутренние
адаптеры и скрытые файлы. Реальный IP передаётся в Uvicorn; доверие к
X-Forwarded-For разрешено только для локального Caddy. Убирать
`--forwarded-allow-ips=127.0.0.1` нельзя: приложение различает локальные и внешние
запросы по IP. Один worker обязателен из-за сессий в памяти.

## Управление на сервере

```bash
systemctl status dialog caddy
journalctl -u dialog -n 100 --no-pager
journalctl -u caddy -n 100 --no-pager
curl --fail https://dialog.2-26-49-28.nip.io/api/health
systemctl restart dialog
```

`build.code` в health идентифицирует код gateway. `release-manifest.json`
фиксирует SHA-256 каждого файла артефакта. Логи HTTP-доступа отключены, чтобы
не записывать тексты и параметры пользовательских запросов. Ошибки сервиса
пишутся в journal.

## Обновление

1. Прогнать необходимые тесты, затем `cd frontend && npm run build`.
2. Из корня репозитория: `bash deploy/pack-release.sh /tmp/dialog-release-ID`.
   Целевой каталог должен быть новым; скрипт исключает окружения и секреты.
3. Упаковать каталог, сохранить SHA-256 архива, загрузить на сервер и сверить
   хеш перед распаковкой в новый `/opt/dialog/releases/ID`.
4. На сервере создать окружение и установить зависимости:

   ```bash
   UV_PYTHON_INSTALL_DIR=/opt/dialog/python /opt/dialog/tooling/bin/uv venv \
     --python 3.13 /opt/dialog/releases/ID/services/gateway/.venv
   /opt/dialog/tooling/bin/uv pip install \
     --python /opt/dialog/releases/ID/services/gateway/.venv/bin/python \
     -r /opt/dialog/releases/ID/services/gateway/requirements.txt \
     -c /opt/dialog/releases/ID/services/gateway/requirements.lock
   bash /opt/dialog/releases/ID/deploy/activate-release.sh /opt/dialog/releases/ID
   ```

5. Проверить публичный health и браузер. Скрипт активации переключает ссылку,
   запускает службу, ждёт локальный health и возвращает прежнюю сборку при
   неудаче. Предыдущие каталоги не удаляются. `/etc/dialog.env` при обновлении
   не перезаписывается. Caddy меняется отдельно после `caddy validate`, затем
   `systemctl reload caddy`.

Для ручного отката выполнить тот же `activate-release.sh` с предыдущим ID.
Обновление или откат завершают текущие партии.

## Повторная проверка с ноутбука

В текстовом режиме без облачных вызовов:

```bash
services/gateway/.venv/bin/python deploy/check-public.py --out /tmp/dialog-check.json
cd frontend
node e2e/smoke.mjs --url https://dialog.2-26-49-28.nip.io --out /tmp/dialog-ui
node e2e/course.mjs --url https://dialog.2-26-49-28.nip.io --out /tmp/dialog-course
node e2e/improvements.mjs --url https://dialog.2-26-49-28.nip.io --out /tmp/dialog-improvements
```

Сначала `check-public.py`, затем браузерные прогоны: проверка лимита намеренно
занимает все 12 партий одного IP и не должна пересекаться с ручным показом.

Документация: [Caddy HTTPS](https://caddyserver.com/docs/automatic-https),
[установка Caddy](https://caddyserver.com/docs/install#debian-ubuntu-raspbian),
[управляемый Python](https://docs.astral.sh/uv/guides/install-python/).
