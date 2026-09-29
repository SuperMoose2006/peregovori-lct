# `.PHONY` перечисляет только СУЩЕСТВУЮЩИЕ цели. Здесь стояли `avatar` и
# `dev`, для которых правил нет: `make dev` выходил С НУЛЁМ, не сделав
# ничего, — тот же тихий обман, что и `make preflight --live`.
.PHONY: install build serve gateway frontend test test-py test-js test-commit backend-pack e2e preflight preflight-live preflight-stand preflight-voice preflight-vision preflight-layers live-video-install live-video-check

PYTHON ?= python3
PY  := services/gateway/.venv/bin/python
PIP := services/gateway/.venv/bin/pip

install:                       ## install gateway + frontend deps
	$(PYTHON) -m venv services/gateway/.venv
	$(PIP) install -q -r services/gateway/requirements.txt -c services/gateway/requirements.lock
	cd frontend && npm ci

build:                         ## production frontend served by the gateway
	cd frontend && npm run build

serve:                         ## local app on http://127.0.0.1:8010 (run make build first)
	cd services/gateway && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010

gateway:                       ## realtime gateway on :8010
	cd services/gateway && .venv/bin/uvicorn app.main:app --reload --port 8010

frontend:                      ## Vite dev server on :5173 (proxies /api and /v1/realtime to :8010)
	cd frontend && npm run dev

test: test-py test-js          ## everything

test-py:
	$(PY) -m pytest services/gateway/tests -q

test-js:
	cd frontend && npm test

# `make preflight --live` НЕ РАБОТАЕТ и не может: `--live` перехватывает сам
# make, печатает свою справку и выходит С НУЛЁМ. Команда выглядит успешной и не
# делает ничего — а в CLAUDE.md она была записана именно так. Поэтому у живой
# проверки отдельная цель, а не флаг.
backend-pack:                  ## собрать артефакт бэкенда для отдельного сервера (ARGS=каталог)
	services/gateway/tools/pack_backend.sh $(or $(ARGS),/tmp/dialog-backend)

test-commit:                   ## прогнать набор по ЗАПИСАННОМУ дереву, а не по рабочему
	services/gateway/tools/test_committed.sh

preflight:                     ## проверка перед показом (нужен поднятый gateway)
	cd services/gateway && .venv/bin/python tools/preflight.py $(ARGS)

preflight-live:                ## то же плюс один НАСТОЯЩИЙ ход живой моделью
	cd services/gateway && .venv/bin/python tools/preflight.py --live $(ARGS)

preflight-stand:               ## то же плюс проверка свежести публичного стенда
	cd services/gateway && .venv/bin/python tools/preflight.py --stand $(ARGS)

# ГОЛОС И ЗРЕНИЕ — ОТДЕЛЬНЫМИ ЦЕЛЯМИ, а не флагом к `preflight`, по двум
# причинам сразу. Первая — та же, что у `--live`: флаг съедает сам make.
# Вторая — деньги: голос стоит четырёх обращений к моделям (распознавание,
# судья, реплика, синтез), зрение — одного. Обычный `make preflight` обязан
# оставаться бесплатным и работать без сети.
preflight-voice:               ## то же плюс НАСТОЯЩИЙ голосовой ход: микрофон → движок → звук
	cd services/gateway && .venv/bin/python tools/preflight.py --voice $(ARGS)

preflight-vision:              ## то же плюс НАСТОЯЩИЙ кадр в модель зрения
	cd services/gateway && .venv/bin/python tools/preflight.py --vision $(ARGS)

preflight-layers:              ## голос и зрение одним прогоном
	cd services/gateway && .venv/bin/python tools/preflight.py --voice --vision $(ARGS)

# ЖИВОЕ ВИДЕО СОБЕСЕДНИКА — docs/INTEGRATION_LIVE_VIDEO.md. Установка SDK
# делается ДО ключа: тогда после ключа остаётся перезапуск. Проверка без
# флагов бесплатна (настройки + ключ); сессию открывает только ARGS=--session.
live-video-install:            ## SDK сервисов живого видео (ставить до ключа)
	$(PIP) install -q -r services/gateway/requirements-live-video.txt

live-video-check:              ## живое видео: настройки и ключ; ARGS=--session — одна короткая сессия
	cd services/gateway && .venv/bin/python -m tools.live_video_check $(ARGS)

e2e:                           ## браузерная проверка (нужен поднятый gateway)
	cd frontend && node e2e/smoke.mjs --out /tmp/dialog-e2e
	cd frontend && node e2e/course.mjs --out /tmp/dialog-e2e
	cd frontend && node e2e/improvements.mjs --out /tmp/dialog-e2e/improvements

# Локально: `make gateway` и `make frontend` в двух терминалах.
# Липсинк аватара делает OpenTalking (.upstream/opentalking, нужен GPU) —
# наш собственный GPU-провайдер удалён, см. docs/upstream-patches.md.
