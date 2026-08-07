# L'Oréal Claims Intelligence Engine — Technical Proposal

**Candidate task: TASK A — Software Engineer**

This document covers the four write-up sections asked for in the brief (business process
understanding, research performed, architecture justification, product roadmap). The code itself
lives alongside this document: [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma),
[`backend/src/claims/`](../backend/src/claims/), [`backend/src/openai/openai.service.ts`](../backend/src/openai/openai.service.ts),
and [`frontend/src/components/ClaimAssessment.tsx`](../frontend/src/components/ClaimAssessment.tsx).

---

## 1. Business process understanding

The brief describes a four-role approval pipeline before a claim can ever reach a customer-facing
package or ad:

```
Business team          Claim Manager             Scientist                Evaluator                 System (this task)
─────────────          ─────────────              ─────────                ─────────                 ──────────────────
Proposes a claim   →    Filters by            →   Submits a product   →   Submits clinical      →   LLM assesses whether
for a product            applicability/             formulation to           study results               the evidence
("Reduces wrinkles       feasibility                 support the claim       ("evidence") for            justifies the claim
 by 20% in 4 weeks")     (approve/reject)                                    the claim                  → persisted →
                                                                                                            shown to the UI
```

Mapped to the schema (`backend/prisma/schema.prisma`):

- **Business team** creates a `Claim` (`status: PROPOSED`) attached to a `Product`.
- **Claim Manager** reviews it for applicability/feasibility and moves it to
  `UNDER_REVIEW` → `APPROVED_FOR_TESTING` or `REJECTED`. This is a human gate — the task doesn't
  ask an LLM to make this call, and it shouldn't: feasibility (can we even formulate/test this in
  time, is it commercially relevant) is a business judgment, not a text-classification problem.
- **Scientist** submits a `Formulation` (ingredients, test method) — this is *how* the product is
  built to attempt the claim, not evidence that it works.
- **Evaluator** runs the actual clinical study and submits `Evidence` (methodology, sample size,
  duration, results summary) — this is the proof artifact.
- **The system** (this task's scope) takes a `Claim` + its `Evidence` and asks an LLM: *does this
  evidence actually justify this claim?* That verdict is persisted as an `Assessment` and returned
  to the React UI.

Two things stood out while reading the brief that shaped the design:

1. **The LLM is a decision-support tool, not a decision-maker.** In a regulated claims context
   (cosmetics claim substantiation is legally scrutinized — see Research, below), a false
   "Justified: Yes" has real regulatory/legal exposure. So the assessment is modeled as
   *advisory output with a confidence score and reasoning*, always attributable to a specific
   model/prompt version, not as an auto-approval that silently flips claim status to "approved for
   market." I left the `Claim.status` state machine so that "assessed" is just one more state a
   human (Claim Manager / legal/regulatory reviewer) still acts on — I call this out explicitly
   under Roadmap Phase 2 (human-in-the-loop approval gate).
2. **Claim text can change after it's been assessed.** If a Business team member edits the claim
   wording next week, an old "Justified: Yes" shouldn't silently still apply to the new wording.
   That's why `Assessment` snapshots `claimTextSnapshot` / `evidenceTextSnapshot` rather than only
   holding foreign keys — the audit record is self-contained and immutable.

## 2. Research performed

Given the one-day window, research focused on three areas directly informing the design:

- **How cosmetics claim substantiation actually works.** EU Cosmetics Regulation (EC) No
  1223/2009 and the associated Common Criteria (Regulation (EU) No 655/2013) require cosmetic
  claims to be: legally compliant, truthful, backed by adequate evidence, honest, fair, and made
  on an informed-decision basis. This is *why* the evaluation prompt explicitly checks that the
  evidence's measured effect size, population, and timeframe match the claim's specific wording
  (a "20% in 4 weeks" claim needs evidence measuring 20%-ish over 4 weeks, not a vaguer or
  differently-scoped result) — and why it's told to treat weak methodology (no control group,
  small n, short duration) as a reason to *lower* confidence rather than ignore it. This directly
  shaped the system prompt in `openai.service.ts`.
- **Reliable structured output from LLMs.** Freeform "explain your answer" text is unreliable to
  parse and store. I used OpenAI's `response_format: json_schema` (strict mode) so the model is
  constrained to emit exactly `{ justified, confidenceScore, reasoning }` — no regex/parsing
  fragility on the backend, and no risk of a stray markdown code fence breaking `JSON.parse`.
  `temperature: 0` was chosen deliberately over the default: the same claim + evidence pair should
  produce the same verdict on re-run, which matters for something an auditor might re-check later.
- **NestJS + Prisma conventions.** Reviewed NestJS's module/controller/service/DTO separation and
  Prisma's schema/migration model to keep the solution idiomatic rather than a single-file
  script — since this is explicitly being evaluated as representative of how I'd build inside an
  existing enterprise codebase, not a personal weekend project.

## 3. Technical architecture justification

**Why NestJS.** Decorator-based modules give a natural home for each business concern
(`ClaimsModule`, `OpenAiModule`, `PrismaModule`) with dependency injection between them —
`ClaimsService` doesn't know or care whether `OpenAiService` calls the real OpenAI API or a mock;
it just depends on the interface. That seam is what makes `OpenAiService` swappable later (Azure
OpenAI, a fine-tuned model, a second-opinion ensemble — see Roadmap) without touching
`ClaimsService` or the controller. `class-validator` DTOs (`AssessClaimDto`) give free input
validation at the HTTP boundary, which matters more than usual here since this endpoint's job is
literally to decide something claim-worthy — malformed input shouldn't reach the LLM call or the DB.

**Why Prisma.** The domain is inherently relational (`Product → Claim → Formulation/Evidence →
Assessment`), and Prisma gives type-safe queries plus a migration history that reviewers can read
as documentation of how the schema evolved. `schema.prisma` is also just a clearer artifact than a
set of TypeORM entity classes when the reviewing panel wants to see the whole data model at a
glance — hence choosing it over the TypeORM alternative the brief allowed.

**Why the LLM call is isolated behind `OpenAiService` rather than inlined in the controller/service.**
Three reasons: (1) it makes `ClaimsService.assessClaim()` unit-testable by mocking one narrow
interface instead of the OpenAI SDK; (2) it's the natural point to add retries/timeouts/circuit
breaking later without touching business logic; (3) it lets local development and this interview
demo run **without an API key** — `OpenAiService` falls back to a deterministic mock evaluator and
logs a warning, so `npm run start:dev` and the React form work end-to-end out of the box, and
switching to the real model is only ever an env var away.

**Error handling as a first-class case, not an afterthought.** Because the return value here
carries real weight ("Justified: Yes"), a failed LLM call is persisted too (`status: FAILED`,
`AssessmentStatus` enum) instead of just being swallowed into a 500 — so there's a record that an
assessment was *attempted* and failed, useful both for debugging flaky API calls and for not
losing audit continuity. The controller responds `502 Bad Gateway` (upstream dependency failure,
not a client error) so the React UI can distinguish "your input was invalid" from "try again."

**Why snapshot text on `Assessment` instead of only foreign keys** — covered in section 1; it's an
architecture decision as much as a business one, since it affects how `Assessment` is written and
what it costs in storage (worth it for auditability in a regulated domain).

**Frontend.** Plain `fetch` + local component state, no state-management library — a single-purpose
form/result view doesn't justify Redux/Zustand overhead. `frontend/src/api/claims.ts` is split out
as a thin client so the endpoint contract has one place to change (`VITE_API_BASE` env var for the
backend origin), and so the component stays about rendering, not networking.

## 4. Product roadmap (no time/scope constraints)

**Phase 1 — this task (MVP).** Single ad-hoc/linked assessment endpoint, mock-or-real LLM call,
Postgres via Prisma, minimal React form. Good enough to prove the mechanism end-to-end.

**Phase 2 — make it match the real workflow.**
- Auth + role-based access (Business / Claim Manager / Scientist / Evaluator / Legal reviewer),
  each seeing only the actions relevant to their step, enforced server-side, not just hidden in
  the UI.
- A proper `Claim` state-machine service (instead of ad-hoc status writes) so illegal transitions
  (e.g. assessing a `REJECTED` claim) are rejected consistently.
- **Human-in-the-loop approval**: an `Assessment` never auto-flips a claim to a
  publish-ready state. A reviewer must explicitly accept/override the LLM verdict, and that
  decision is itself logged (who, when, agree/override + reason) — this is the single most
  important control for a legally-exposed claims workflow.
- Full audit/version history UI for claims, formulations, evidence, and assessments.

**Phase 3 — make the LLM assessment trustworthy at scale.**
- Retrieval over a curated corpus of regulatory guidance (EU 1223/2009 common criteria, prior
  approved/rejected claim precedents) so the model grounds its reasoning in more than just the
  single evidence document — true RAG rather than single-document grounding.
- Multi-sample or multi-model consensus (e.g. 3 calls, majority vote, or a second model as
  adjudicator) for claims above a risk/visibility threshold, surfacing disagreement rather than
  hiding it behind one confidence number.
- A feedback loop: when a human reviewer overrides a verdict, capture that as labeled data to
  evaluate/tune the prompt (and eventually consider fine-tuning) against real disagreement cases.
- Async processing (queue + webhook/notification) once study documents get large (PDF parsing,
  OCR, multi-page methodology sections) rather than a synchronous request/response.

**Phase 4 — platform maturity.**
- A rules engine layer per market (EU vs. US FTC vs. APAC regulatory frameworks differ on what
  "adequate substantiation" means), so the same Evidence can be assessed against multiple regimes.
- Analytics dashboard: claim approval/rejection rates, average time-to-assessment, most common
  evidence gaps — feeding back into what Scientists/Evaluators are told to test for earlier.
- Direct integration with regulatory submission/documentation systems, and exportable
  explainability reports for legal/compliance sign-off.
- Cost/latency observability on the LLM layer (token usage, cache hit rate on repeated
  assessments of unchanged claim/evidence pairs) once volume justifies it.
