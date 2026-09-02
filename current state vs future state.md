# AIEIC Instructor Workflow — Integration Plan
### Current State vs. Target State, and Free-Tier Design Decisions

Prepared by Jeron Perey — CSC 4460 Senior Project

---

## 1. Purpose

This document lays out where the AIEIC instructor workflow stands today versus where it needs to get to, and the concrete infrastructure decisions (hosting, database, AI provider) needed to build it entirely on free tiers. It's meant to be something I can hand to my advisor and teammates as a shared reference, not a final report.

**One-line summary of the current state:** only the Instructor UI is deployed (on Vercel), and it isn't wired to any backend or agent — everything downstream of the frontend exists as unconnected code.

---

## 2. Current State

### 2.1 What exists today

| Component | Status |
|---|---|
| Instructor UI | **Deployed** on Vercel. Fully built (6 tabs), but only 2 of 6 tabs call any backend function, and even those calls have nothing live to hit. |
| Curriculum Designer agent | Code exists (FastAPI + LangGraph). Not deployed anywhere. |
| Assessment Agent | Code exists (FastAPI). Grading logic is a partial rework — LLM-based rubric grading is done, CS-specific code-grading is not yet removed. Not deployed anywhere. |
| Participant agent | Code exists, written against Azure Cosmos DB. Not deployed anywhere. |
| Integrity Guardian agent | Code exists, written against Azure Cosmos DB. Not deployed anywhere. |
| Orchestrator agent | Code exists — a single hub meant to sit between the Instructor UI and everything else, and to drive the student-side flow. Not deployed anywhere. |
| Database | Nothing hosted. All agent code targets Azure Cosmos DB, which is not free-tier. |
| Second student-side implementation (ADFEL) | A separate, self-contained prototype with its own agents and its own SQLite storage — not connected to the microservices above. Status/ownership unconfirmed. |

### 2.2 Current-state diagram

Nothing below the Instructor UI is live. This diagram shows what's built vs. what's actually reachable:

```mermaid
flowchart LR
  subgraph Deployed
    IUI["Instructor UI\n(Vercel — live)"]
  end

  subgraph "Written, not deployed"
    ORCH["Orchestrator agent"]
    CD["Curriculum Designer agent"]
    AA["Assessment Agent"]
    PA["Participant agent"]
    IG["Integrity Guardian agent"]
    LC["Lab Companion agent"]
  end

  subgraph "No hosted database"
    DB[("Azure Cosmos DB\n(code target, not hosted anywhere free)")]
  end

  IUI -.->|"calls exist in code,\nnothing to receive them"| ORCH
  ORCH -.-> CD
  ORCH -.-> AA
  ORCH -.-> PA
  ORCH -.-> LC
  ORCH -.-> IG
  CD -.-> DB
  AA -.-> DB
  PA -.-> DB
  IG -.-> DB

  style Deployed fill:#d4f4dd,stroke:#2d8a4e
  style ORCH fill:#f4d4d4,stroke:#a03030
```

*(Dashed lines = code path exists but nothing is actually running/hosted, so it does nothing today.)*

### 2.3 Resolved decisions

Since nothing is deployed yet, these were decided outright rather than left as open questions for the team:

- **ADFEL vs. the microservice agents — decided: build against the microservice stack (Participant, Integrity Guardian, Curriculum Designer, Assessment Agent), ADFEL is out of scope.** These aren't two versions of the same thing — they're three independent answers to "how does the instructor side connect" (ADFEL's own planned endpoints, the orchestrator + `aieic-shared` platform, and this plan's direct-agent design). Only the orchestrator stack is real infrastructure: it's built against a formal shared contract package (`aieic-shared`) and its router is explicitly mapped to the Figma dashboard tabs the Instructor UI is based on. ADFEL is a self-contained side prototype (own SQLite storage, own orchestrator) that was never meant to plug into this. One loose thread to flag to Oliver as an FYI, not a question: `participant-agent-AIEIC-main` was deleted and re-added within the same upload batch — worth a one-line "what happened here?" in case it's a sign of unfinished work rather than noise.
- **Rubric model mismatch — decided: retire `rubric.md`, make Curriculum Designer's `LabMaterial.rubric` the single canonical rubric entity.** This turned out not to be a real design choice — Assessment Agent's own `rubric.md` format isn't even functional on its own terms today (`criteria[].points` is parsed but never used; every criterion is hardcoded to `max_score=10`), and the 60/30/10 code/report/manual split exists as two separate hardcoded copies that don't read from each other. Building it correctly from the start: Assessment Agent reads `LabMaterial.rubric` from the shared DB by `lab_id`, and `criteria[].weight` actually drives `report_evaluator.py`'s scoring instead of a hardcoded constant.
- **`AgentCollaboration` tab — decided: defer, not in current scope.** It's a fully-designed live cross-agent activity feed (per-agent status cards + a timestamped event log), and its "live feed" framing is the one thing that would reopen the no-behavioral-coupling decision already made for this project (see 3.1) — even DB-poll-based, the framing implies a freshness expectation a pure data-dependency read doesn't naturally give. No existing data model supports it either way; building it means designing a new shared event-log entity, which is real scope, not a quick wire-up. Worth a short FYI to the advisor since it's a scope change, not just an implementation detail — see 3.4 for the re-scoped version if it's picked up later.

---

## 3. Target State

### 3.1 Confirmed design

- Two independent systems — **student-side** (Lab Companion, Integrity Guardian, Participant agent) and **instructor-side** (Instructor UI, Curriculum Designer, Assessment Agent) — connected only through shared data, never through live calls between the two sides. This was a deliberate choice for safety isolation and so each side can be deployed/used independently.
- The Instructor UI calls Curriculum Designer and Assessment Agent directly, and reads Participant/Integrity data straight from the shared database. No orchestrator sits in the middle of the instructor path.
- My scope is the instructor-side system end to end: UI, Curriculum Designer integration, Assessment Agent integration, and the shared database.

### 3.2 Target-state diagram

```mermaid
flowchart LR
  subgraph "Student-Side System (not my scope, shares DB)"
    LC[Lab Companion agent]
    IGd[Integrity Guardian agent]
    PA[Participant agent]
    LC -- validate --> IGd
    LC -- log interaction --> PA
  end

  subgraph "Instructor-Side System (my scope)"
    IUI[Instructor UI]
    CD[Curriculum Designer agent]
    AA[Assessment Agent]
    IUI -- "generate / approve / request-changes" --> CD
    IUI -- "submit / review grades" --> AA
  end

  DB[(Shared free-tier database)]

  PA -- "writes interaction log" --> DB
  IGd -- "writes sessions + reports" --> DB
  CD -- "writes curriculum material" --> DB
  AA -- "writes assessment results" --> DB
  IUI -. "reads participant + integrity data\n(data dependency only — no live call)" .-> DB
```

### 3.3 Per-component target diagrams

**Instructor UI**
```mermaid
flowchart TD
  App[App.tsx] --> Tabs
  subgraph Tabs
    MP[Material Preview] --> CDcall[Curriculum Designer API]
    QP[Lab / Quiz Preview] --> CDcall
    SA[Student Activity] --> DBread[Read from shared DB]
    GS[Graded Submissions] --> AAcall[Assessment Agent API]
    ST[Statistics] --> DBread
  end
  CDcall --> CD[(Curriculum Designer agent)]
  AAcall --> AA[(Assessment Agent)]
  DBread --> DB[(Shared DB)]
```

**Curriculum Designer agent**
```mermaid
flowchart LR
  Input["generate request\n(objectives, instructions)"] --> Spec[spec generator]
  Spec --> Quiz[quiz generator]
  Quiz --> Rubric[rubric generator]
  Rubric --> Review[self review]
  Review -->|issues found| Quiz
  Review --> Output[Lab Material]
  Output --> DB[(Shared DB)]
```

**Assessment Agent**
```mermaid
flowchart TD
  Req["assess request\n(student, assignment, submission)"] --> RE[LLM rubric grading\n discipline-agnostic]
  Req -.->|"only if code submission present"| CG[Code grading\nCS-only, being phased down]
  RE --> Score[Final score]
  CG -.-> Score
  Score --> Feedback[feedback generator]
  Feedback --> Result[Assessment Result]
  Result --> DB[(Shared DB)]
  Result --> Queue[Manual review queue]
```

**Database (target entities)**
```mermaid
erDiagram
  LAB ||--|| CURRICULUM_MATERIAL : has
  LAB ||--o{ SUBMISSION : receives
  SUBMISSION ||--|| ASSESSMENT_RESULT : produces
  ASSESSMENT_RESULT ||--o| MANUAL_REVIEW : "queued for"
  STUDENT ||--o{ PARTICIPANT_INTERACTION : "append-only log"
  STUDENT ||--o{ INTEGRITY_SESSION : has
  CURRICULUM_MATERIAL ||--|| RUBRIC : "single canonical entity"
  SUBMISSION }o--|| RUBRIC : "graded against"
```
*(`RUBRIC` is now a single entity owned by Curriculum Designer and read by Assessment Agent — the old separate `rubric.md`/`AssignmentRubric` shape is retired, see 2.3.)*

### 3.4 Future work — deferred, not part of current scope

- **`AgentCollaboration` live activity feed**: if picked up later, re-scope from a real-time feed to a periodic or end-of-session summary populated from a new append-only `GENERATION_EVENT`-style log (agent, time, student, action, severity) that Curriculum Designer/Integrity/Participant/Assessment Agent all write to. This keeps it compatible with the no-behavioral-coupling design instead of reopening it. Not part of the current DB schema in 3.3.

---

## 4. Design Decisions (all free tier)

### 4.1 Frontend hosting — Vercel
Already in place, no change needed. Free tier covers a static/SPA React deployment like this comfortably.

### 4.2 Backend agent hosting — Render
Each FastAPI agent (Curriculum Designer, Assessment Agent) deploys as a free Render web service — no credit card required, no time-limited trial. The trade-off is that free services spin down after about 15 minutes of inactivity and take roughly 30–60 seconds to wake up on the next request. For a classroom demo that isn't hit constantly, that's an acceptable trade-off, and it's the only option among the mainstream platforms (Render, Railway, Fly.io) that stays free indefinitely rather than expiring after a trial period — Railway's free option is a time-limited credit, and Fly.io dropped its free tier entirely in 2024.

**Fallback**: if the cold-start delay becomes a problem during a live demo, a lightweight uptime-ping job (e.g., a scheduled request every ~10 minutes during class hours) keeps the service warm without leaving free tier.

### 4.3 Database — MongoDB Atlas (M0 free tier)
This was already the recommendation from the codebase audit and still holds: every agent's code is already written against a document/partition-key model (Cosmos DB), so Atlas's free M0 cluster is close to a client-library swap rather than a schema redesign — one collection per entity, partition-key fields become ordinary indexed fields. Atlas's free tier has no time-based pause behavior, which matters for a live classroom session where usage is bursty.

**Fallback**: Supabase (Postgres), if the team later wants real relational joins for the Statistics tab — accept a higher one-time schema-design cost and a weekly-inactivity pause in exchange.

### 4.4 AI/LLM provider — Groq (primary), Gemini (for long-context tasks)
The current code targets Azure OpenAI and the Anthropic SDK, neither of which has a real free tier at this usage pattern. Two free options fit the two different needs in this system:

- **Groq**, for most agent calls (rubric grading, feedback generation, quiz/spec generation). It's fully OpenAI-API-compatible, so swapping it in is close to a client/base-URL change rather than a rewrite, it's free with no credit card, and it's fast enough that the classroom-facing latency (a student or instructor waiting on a response) stays low.
- **Google Gemini** (via Google AI Studio), specifically for the Curriculum Designer's document-ingestion step, where instructors may upload longer source material (a syllabus, an existing lab PDF). Gemini's free tier includes a very large context window, well beyond what Groq's free models support, which matters for that specific step.

Both are genuinely free with published per-minute/per-day rate limits rather than a trial credit that expires — but rate limits on both shift over time, so this should be re-verified against each provider's current docs before locking in the final choice, not treated as permanent.

### 4.5 Summary table

| Layer | Choice | Why |
|---|---|---|
| Frontend hosting | Vercel | Already deployed, free tier is sufficient |
| Backend agent hosting | Render (free web services) | Only mainstream option with a real, non-expiring free tier |
| Database | MongoDB Atlas M0 | Matches existing document/partition-key code, no pause behavior |
| AI provider | Groq (primary) + Gemini (long-context) | OpenAI-compatible swap-in, free, fast; Gemini covers large-document ingestion |

---

## 5. What changes to get from current state to target state

1. Send Oliver the one-line FYI on `participant-agent-AIEIC-main`'s delete/re-add, and build against the microservice stack only (ADFEL out of scope — see 2.3).
2. Stand up MongoDB Atlas and point Curriculum Designer, Assessment Agent, Participant agent, and Integrity Guardian at it instead of Cosmos DB (mechanical client swap for the two already written against Cosmos).
3. Swap Azure OpenAI / Anthropic SDK calls for Groq (and Gemini for the document-ingestion step) in Curriculum Designer and Assessment Agent.
4. Deploy Curriculum Designer and Assessment Agent to Render.
5. Wire the Instructor UI's three unwired tabs (Student Activity, Graded Submissions, Statistics) directly to Assessment Agent / the database — bypassing the Orchestrator entirely, per the confirmed design.
6. Retire `rubric.md`; make `LabMaterial.rubric` the canonical entity and wire `criteria[].weight` into `report_evaluator.py`'s actual scoring (see 2.3).
7. Send advisor a short heads-up that `AgentCollaboration` is deferred/re-scoped rather than built as originally designed (see 3.4).

## 6. Proposed Roadmap

High level, mapped against the 15-week timeline from the proposal — this just sequences the section 5 action items, not a detailed sprint plan.

|Weeks|Phase|Covers|
|---|---|---|
|1–2|Audit & decide|Done — this document. Decisions on ADFEL/rubric/AgentCollaboration are locked in, no longer open.|
|3–5|Infrastructure stand-up|MongoDB Atlas provisioned and agents pointed at it; Groq/Gemini swapped in for Azure OpenAI/Anthropic; Curriculum Designer + Assessment Agent deployed to Render. Matches the proposal's "improve Vercel deployment + initial UI-to-agent integration" milestone.|
|6|(unchanged)|Background research / related-work section — not affected by this plan.|
|7–9|Core integration|Instructor UI wired directly to Curriculum Designer and Assessment Agent; Student Activity/Graded Submissions/Statistics tabs connected to the shared DB; rubric consolidation (`rubric.md` retired, `LabMaterial.rubric` wired into `report_evaluator.py`) done here since it blocks real grading data.|
|10|Documentation pass|Update proposal's intro/design/implementation docs to reflect the actual architecture (no orchestrator, free-tier stack) instead of the original Cosmos/Azure assumptions.|
|11|Usability testing|Unchanged from proposal — now testing against a fully wired instructor workflow instead of a partial one.|
|12–13|Refinement + demo prep|Fix issues found in testing; cold-start mitigation for Render if it's a problem live; prepare Expo demo.|
|14–15|Wrap-up|Ethics analysis, limitations/future-work section — this is where `AgentCollaboration`'s deferred re-scope (3.4) belongs in the report, plus any leftover ADFEL/Oliver thread.|

The main shift from the original proposal timeline is that weeks 3–5 now carry real infrastructure decisions (DB, hosting, AI provider) up front, so weeks 7–9 are pure integration work rather than integration-plus-discovery.
