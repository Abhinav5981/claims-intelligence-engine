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

## Running it

### Backend

```bash
cd backend
npm install
cp .env.example .env      # fill in DATABASE_URL; OPENAI_API_KEY is optional (see below)
npx prisma migrate dev --name init
npm run start:dev         # http://localhost:3001
```

No Postgres handy? Swap `provider = "postgresql"` to `"sqlite"` and
`url = env("DATABASE_URL")` to `url = "file:./dev.db"` in `prisma/schema.prisma` for a
zero-setup local run.

**No `OPENAI_API_KEY`?** The API still works — `OpenAiService` detects the missing key, logs a
warning, and uses a small deterministic mock evaluator so the endpoint is fully demoable offline.
Set `OPENAI_API_KEY` in `.env` to call the real model (`gpt-4o-mini` by default, via
`OPENAI_MODEL`).

### Frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

### Try it

With both servers running, open the frontend, or call the API directly:

```bash
curl -X POST http://localhost:3001/api/claims/assess \
  -H "Content-Type: application/json" \
  -d '{
    "claimText": "Reduces the appearance of wrinkles by 20% in 4 weeks.",
    "evidenceText": "Double-blind, placebo-controlled study, n=42, 4-week duration. Measured a 21% average reduction in wrinkle depth (p<0.05) vs. placebo."
  }'
```

## Status

This repo covers the requested 3-area proposal (DB schema, NestJS endpoint, React component) as
working code rather than pseudo-code, plus the write-up in `docs/PROPOSAL.md`. Not yet wired up:
`npm install` hasn't been run in this environment (no network access here), and there's no CI —
both are quick to add but weren't the focus of the one-day window.
