.PHONY: install gateway frontend avatar test test-py test-js e2e preflight dev

PY  := services/gateway/.venv/bin/python
PIP := services/gateway/.venv/bin/pip

install:                       ## install gateway + frontend deps
	python3 -m venv services/gateway/.venv
	$(PIP) install -q -r services/gateway/requirements.txt
	cd frontend && npm install

gateway:                       ## realtime gateway on :8010
	cd services/gateway && .venv/bin/uvicorn app.main:app --reload --port 8010

frontend:                      ## Vite dev server on :5173 (proxies /ws and /v1 to :8010)
	cd frontend && npm run dev

test: test-py test-js          ## everything

test-py:
	$(PY) -m pytest services/gateway/tests -q

test-js:
	cd frontend && npm test

preflight:                     ## проверка перед показом (нужен поднятый gateway)
	cd services/gateway && .venv/bin/python tools/preflight.py

e2e:                           ## браузерная проверка (нужен поднятый gateway)
	cd frontend && node e2e/smoke.mjs --out /tmp/dialog-e2e
	cd frontend && node e2e/course.mjs --out /tmp/dialog-e2e

# Локально: `make gateway` и `make frontend` в двух терминалах.
# Липсинк аватара делает OpenTalking (.upstream/opentalking, нужен GPU) —
# наш собственный GPU-провайдер удалён, см. docs/upstream-patches.md.
