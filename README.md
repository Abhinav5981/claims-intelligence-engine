# L'Oréal Claims Intelligence Engine — Pre-Interview Assessment (Task A)

An LLM-assisted service that assesses whether a clinical study justifies a marketing claim
(e.g. *"Reduces wrinkles by 20% in 4 weeks"*), persists the verdict, and surfaces it in a React UI.

**Start here:** [`docs/PROPOSAL.md`](docs/PROPOSAL.md) — business process understanding, research
performed, architecture justification, and product roadmap.

## Structure

```
backend/    NestJS API — POST /api/claims/assess
  prisma/schema.prisma   Claim / Assessment (+ Product / Formulation / Evidence) data model
  src/claims/            Controller + Service for the assess endpoint
  src/openai/            OpenAI integration (falls back to a mock evaluator with no API key)
  src/prisma/            PrismaService (DI wrapper around PrismaClient)
frontend/   React (Vite) — ClaimAssessment.tsx form + result view
docs/       Written proposal
```

## Prerequisites

- Node.js 18+ and npm
- A reachable Postgres instance (14+) — either one you already have, or spin one up with Docker
  (below). The schema uses Postgres-only features (`Json` columns, real `enum`s), so SQLite is
  **not** a drop-in swap.
- Docker, only if you don't already have Postgres running locally
- An OpenAI API key — **optional**, see below
- Ports used by default: backend `3001`, frontend `5173`, Postgres `5432`. Free them up first, or
  override via `PORT` (backend/.env) / `vite.config.ts` (`server.port`) / the Docker `-p` flag.

## Running it

### 1. Get Postgres up

Already have a local Postgres? Skip to step 2 and point `DATABASE_URL` at it.
Otherwise:

```bash
docker run --name claims-engine-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=claims_engine -p 5432:5432 -d postgres:16-alpine
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env      # DATABASE_URL already matches the Docker command above; edit if yours differs
npx prisma migrate dev --name init
npm run start:dev         # http://localhost:3001
```

**No `OPENAI_API_KEY`?** The API still works — `OpenAiService` detects the missing key, logs a
warning, and uses a small deterministic mock evaluator so the endpoint is fully demoable offline.
Set `OPENAI_API_KEY` in `.env` to call the real model (`gpt-4o-mini` by default, via
`OPENAI_MODEL`).

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

Talks to the backend at `http://localhost:3001` by default; override with a `VITE_API_BASE` env
var (e.g. in `frontend/.env`) if your backend runs elsewhere.

### Try it

With both servers running, open the frontend at `http://localhost:5173`, or call the API directly:

```bash
curl -X POST http://localhost:3001/api/claims/assess \
  -H "Content-Type: application/json" \
  -d '{
    "claimText": "Reduces the appearance of wrinkles by 20% in 4 weeks.",
    "evidenceText": "Double-blind, placebo-controlled study, n=42, 4-week duration. Measured a 21% average reduction in wrinkle depth (p<0.05) vs. placebo."
  }'
```

To see the persisted rows directly (useful for showing the DB side in your interview):

```bash
cd backend
npm run prisma:studio      # opens a DB browser at http://localhost:5555
```

## Status

This repo covers the requested 3-area proposal (DB schema, NestJS endpoint, React component) as
working code rather than pseudo-code, plus the write-up in `docs/PROPOSAL.md`. It has been
validated end-to-end: `npm install` + `tsc --noEmit` clean in both packages, `prisma migrate dev`
applied against a real Postgres instance, the NestJS server boots and a live
`POST /api/claims/assess` call was round-tripped through the controller → service → mock
`OpenAiService` → Postgres → JSON response, and `npm run build` succeeds on the frontend. No CI
yet — quick to add but wasn't the focus of the one-day window.
