.PHONY: install backend frontend test dev

PY := backend/.venv/bin/python
PIP := backend/.venv/bin/pip

install:                       ## install backend + frontend deps
	python3 -m venv backend/.venv
	$(PIP) install -q -r backend/requirements.txt
	cd frontend && npm install

backend:                       ## run FastAPI backend on :8000 (NEGO_AI=cli|api|off)
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8010

frontend:                      ## run Vite dev server on :5173
	cd frontend && npm run dev

test:                          ## run backend engine + ai tests
	$(PY) -m pytest backend/tests -q

# Tip: run `make backend` and `make frontend` in two terminals.
# Local AI opponent via the claude CLI:  NEGO_AI=cli make backend
