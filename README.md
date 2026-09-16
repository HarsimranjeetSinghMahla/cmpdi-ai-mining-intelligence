# CMPDI AI — Mining Intelligence Platform (SIH26023)

Enterprise document intelligence for CMPDI / Coal India Limited archives. This build preserves the working Node/Fastify + MongoDB + FastAPI/PyMuPDF/FastEmbed + Groq RAG pipeline and adds a document-driven enterprise dashboard.

## Architecture

- **Frontend:** desktop-first HTML/CSS/ES modules, Chart.js, PDF.js
- **API:** Node.js + Fastify on `4000`
- **Worker:** FastAPI + PyMuPDF + FastEmbed on `5001`
- **Database:** MongoDB (`cmpdi_ai`)
- **LLM:** Groq, server-side only
- **Retrieval:** MongoDB Atlas Vector Search when available, cosine fallback locally
- **Evidence:** page + bounding-box citations retained through PDF viewer

## What changed

- Rebuilt the UI as a dark, compact enterprise control center.
- Added document-specific KPI cards, evidence coverage, metric explorer and operational/geological views.
- Added backend dashboard/analytics/insights/anomaly/outlook endpoints.
- Added source-derived metric and multi-year series extraction from stored PDF pages.
- Added evidence-backed decision insights and anomaly detection without fabricated values.
- Added limited linear AI-assisted projections only when enough historical observations exist.
- Added Executive Brief and Operational Review report templates while retaining the original four.
- Added lazy PDF rendering with page navigation, zoom and exact citation/bounding-box highlighting.
- Split frontend responsibilities across API, app, dashboard, chat, reports and PDF viewer modules.
- Added real health checks for MongoDB and the Python worker.

## Environment

Copy `backend/.env.example` to `backend/.env` and set your real MongoDB and Groq credentials. Never put credentials in frontend files.

```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=cmpdi_ai
GROQ_API_KEY=your_key
GROQ_MODEL=openai/gpt-oss-20b
WORKER_URL=http://localhost:5001
CORS_ORIGIN=http://localhost:5500
```

## Run

### MongoDB

```bash
docker compose up -d
```

### All services

```bash
chmod +x run.sh
./run.sh
```

Open `http://localhost:5500`.

### Manual

Terminal 1:
```bash
cd worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn pdf_worker:app --host 0.0.0.0 --port 5001
```

Terminal 2:
```bash
cd backend
npm install
npm run dev
```

Terminal 3:
```bash
cd frontend
python3 -m http.server 5500
```

## API

- `GET /api/v1/health`
- `GET /api/v1/documents`
- `GET /api/v1/documents/:id`
- `POST /api/v1/upload`
- `POST /api/v1/query`
- `POST /api/v1/generate-report`
- `GET /api/v1/report-templates`
- `GET /api/v1/dashboard/:id`
- `GET /api/v1/analytics/:id`
- `GET /api/v1/insights/:id`
- `GET /api/v1/anomalies/:id`
- `GET /api/v1/outlook/:id`

## Data rules

The dashboard never fills unavailable KPIs with made-up values. Structured metrics are extracted from the indexed source pages. Charts appear only when actual multi-value historical data is detected. Future Outlook uses a simple least-squares linear trend over available historical observations and is explicitly labeled as an AI-assisted projection.

## Acceptance test

1. Start MongoDB.
2. Start worker on `5001`.
3. Start API on `4000`.
4. Start frontend on `5500`.
5. Upload a real mining PDF.
6. Confirm the worker extracts pages, blocks, tables, chunks and embeddings.
7. Confirm MongoDB stores document/page/chunk data.
8. Confirm dashboard KPIs populate from the uploaded document.
9. Confirm charts only appear when structured series exists.
10. Ask a question and verify `[Page N]` citations.
11. Click a citation and verify the source page/bounding box.
12. Generate a report.
13. Review anomaly and Future Outlook views.
14. Confirm no API key appears in browser source.
15. Run `node --test tests/*.test.js`.