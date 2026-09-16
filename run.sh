#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ ! -f backend/.env ]; then cp backend/.env.example backend/.env; fi

if [ ! -d worker/.venv ]; then python3 -m venv worker/.venv; fi
source worker/.venv/bin/activate
pip install -r worker/requirements.txt

(cd backend && npm install)

(cd worker && uvicorn pdf_worker:app --host 0.0.0.0 --port 5001) &
WORKER_PID=$!
(cd backend && npm run dev) &
API_PID=$!
(cd frontend && python3 -m http.server 5500) &
WEB_PID=$!

trap 'kill $WORKER_PID $API_PID $WEB_PID 2>/dev/null || true' EXIT INT TERM
printf '\nCMPDI AI started:\n  Frontend: http://localhost:5500\n  API:      http://localhost:4000\n  Worker:   http://localhost:5001\n\nPress Ctrl+C to stop.\n'
wait
