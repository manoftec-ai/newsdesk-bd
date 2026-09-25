# Jev integration (Jachaidesk) — architecture, verification, shadow-mode operation

> Added 2026-09-25. **Status: SHADOW MODE. Not active, not deployed, not wired into CI.**
> Nothing in this document authorises production use. Activating Jev as a gate requires
> explicit user approval.

---

## 1. What Jev is (verified against official docs)

Jev is TypeSafe AI's first **System One model**. It is **not** an LLM and generates no text.
You send it a `state` plus typed `questions`; it returns typed answers your code can branch on:

| Question type | Returns |
|---|---|
| `choice` | selected option + per-option probabilities + `confidence` |
| `score` | probability-weighted value on an ordered rubric + `confidence` |
| `noul` | probability the statement is true (0–1) |

All questions in one request are evaluated in parallel against the same state.

**Official docs:** <https://docs.typesafe.ai/> · product site <https://typesafe.ai/>

### Critical fact for this project

TypeSafe's own documentation, *Jev with coding agents*
(<https://docs.typesafe.ai/introduction/coding-agents>) says explicitly:

> Jev is **not** a drop-in replacement for the LLM behind Claude Code, Cursor, **opencode**,
> Copilot … There is no `model: "jev-latest"` setting that turns your coding agent into a
> Jev-powered agent.

This is the correct fit for the objective: Jev is added **alongside** OpenCode, never instead
of it. The article-writing system, the research system, and the main LLM are untouched.

---

## 2. Installation method — what was verified and what was chosen

| Route | Verified | Used here? |
|---|---|---|
| HTTP API `POST https://api.typesafe.ai/v1/systemone` | official, documented, Node 20+ has global `fetch` | **YES** |
| `@typesafe-ai/sdk@0.6.0` (official JS SDK) | real package, Node 20+, reads `TYPESAFE_API_KEY` | no — see below |
| `typesafe-sdk` (Python) | official, Python ≥3.10 | **NO** — this repo is Node/Astro, a Python install would be an unrelated package |
| Claude Code plugin / `npx skills add typesafe-ai/skills` | official skill, agents that are not Claude Code | partially — the **skill files** are installed project-locally for OpenCode |
| OpenCode plugin or `model: jev` | **does not exist** | n/a |
| Local / offline / self-hosted weights | **does not exist** — hosted only | n/a |

### Why the SDK was not added as a dependency

The router uses Node's built-in `fetch` against the documented endpoint, which is exactly the
pattern already used by `pipeline/lib/llm.mjs`. Consequences:

* **Zero new dependencies** — `pipeline/package.json` and `package-lock.json` are untouched, so
  the GitHub Actions `npm ci` dependency graph for `pipeline.yml`, `auto-author.yml`,
  `images.yml` and the rest is provably unchanged.
* No new transitive dependency risk on a repo that already runs five concurrent bot workflows.
* The SDK is a convenience wrapper (typed helpers, its own retry policy). Nothing it provides
  is required here.

If you later want the SDK, it is a drop-in swap of the `postJson` function in
`pipeline/lib/jev-router.mjs` and is a deliberate, reviewable change.

### What was actually installed

1. **Official TypeSafe agent skill**, project-scoped for OpenCode:
   `.opencode/skills/typesafe-ai/SKILL.md` (+ `LICENSE`), copied from
   <https://github.com/typesafe-ai/skills> `main`.
   OpenCode discovers skills at `.opencode/skills/<name>/SKILL.md`
   (<https://opencode.ai/docs/skills/>); the frontmatter `name: typesafe-ai` matches the
   directory, so the `skill` tool can load it.
2. **The shadow router** — three new source files (below), zero dependencies.

---

## 3. Authentication, pricing, and the key

| Item | Value |
|---|---|
| Auth | `Authorization: Bearer <TYPESAFE_API_KEY>`, key from <https://console.typesafe.ai/keys> |
| API key required | **YES** — `401 Unauthorized` without it |
| Access | early access / waitlist on the official site |
| Price | **$0.042 per million input tokens**; output tokens free |
| Rate limits | 250,000 tokens/sec, 1,200 requests/min, 64k token context |
| Free tier | **NOT VERIFIED** — no free tier is documented on official pages |
| Offline mode | **none** — no downloadable weights, cannot be self-hosted |

### Where to put the key (do not paste it in chat)

**Local OpenCode development — the only place it is needed today:**

```bash
# 1. get the key at https://console.typesafe.ai/keys
# 2. store it in the global secrets dir, never in the repo
printf '%s' 'YOUR_KEY_HERE' > ~/.config/opencode/.secrets/typesafe.key
chmod 600 ~/.config/opencode/.secrets/typesafe.key

# 3. point the router at it
export TYPESAFE_API_KEY_FILE=$HOME/.config/opencode/.secrets/typesafe.key
export JEV_MODE=shadow

# 4. verify it can actually reach the model
cd ~/project-coba/newsdesk-bd/pipeline
node tools/jev_decide.mjs --list
node tools/jev_decide.mjs AGENT_ROUTE --task=smoke --state='{"goal":"verify the jev key works"}'
```

`node tools/jev_decide.mjs --list` also prints `configured=true|false`, so you can check
without making a call.

**GitHub Actions:** not required, and **do not add it**. Shadow mode is local-only. If a
future approved design ever needs it in CI, the correct place is
**Settings → Secrets and variables → Actions → New repository secret** named
`TYPESAFE_API_KEY`, referenced only as `secrets.TYPESAFE_API_KEY` — never as a literal in a
workflow file.

**Vercel:** not required, and **do not add it**. The production Astro build never calls Jev.
If that ever changes, it would be
**newsdesk-bd → Settings → Environment Variables → `TYPESAFE_API_KEY`** (Production + Preview),
and it would be an approved-change decision, not a default.

A copy-pasteable template lives at `pipeline/config/jev.env.example` (contains no secret).

---

## 4. Files

### Added (no production code touched)

| File | Role |
|---|---|
| `pipeline/lib/jev-router.mjs` | the router. Loads the catalog, guards mode, calls the API with bounded retry, never throws, never gates |
| `pipeline/lib/shadow-log.mjs` | redacting append-only JSONL writer + reader |
| `pipeline/config/jev-decisions.json` | every question, criteria, threshold and confidence cut-off, in one reviewable file |
| `pipeline/tools/jev_decide.mjs` | CLI: `--list`, `<DECISION_TYPE> --state-file=… --json`, `--bypass` |
| `pipeline/test/jev-router.test.mjs` | 24 offline tests, no network |
| `pipeline/config/jev.env.example` | env template, no secret |
| `.opencode/skills/typesafe-ai/` | official TypeSafe agent skill for OpenCode |
| `docs/JEV-INTEGRATION.md` | this file |

### Modified

| File | Change |
|---|---|
| `AGENTS.md` | **appended** a new section 5. Nothing above it was edited or removed |

### Explicitly NOT changed

`.github/workflows/**` · `site/**` · `pipeline/run.js` · any existing `pipeline/lib/*` or
`pipeline/tools/*` · `pipeline/package.json` · `pipeline/package-lock.json` · `vercel.json` /
`.vercel/**`

No production module imports the router. Verified by grep and by `git diff --stat`.

---

## 5. Decision types

Defined in `pipeline/config/jev-decisions.json`. Each decision type sends all of its
questions in **one** request, because Jev evaluates them in parallel — extra questions
barely change latency or cost.

### Agent-routing (live in shadow mode)

* **`AGENT_ROUTE`** — `proceed_directly` · `gather_more_evidence` · `change_approach` ·
  `investigate_root_cause` · `ask_human`, plus companion questions "would a second opinion
  help?" and "how much does this look like it is repeating itself?".
* **`FAILURE_ROUTING`** — `retry` · `change_approach` · `investigate_root_cause` ·
  `request_human_review`, plus "is this transient?" and "has this exact action already been
  tried more than once?".

### Newsroom (defined, NOT wired — see §8)

* **`RESEARCH_DEPTH`** — `sufficient` · `research_more` · `primary_source_required` ·
  `conflicting_information`
* **`ARTICLE_MODE`** — `straight_news` · `multi_source_synthesis` · `explainer` ·
  `timeline_context` · `breaking_update` · `human_review`
* **`ARTICLE_READINESS`** — `ready` · `needs_more_sources` · `needs_fact_check` ·
  `needs_editor_review`

These are advisory metadata **about** the existing verification pipeline. `RESEARCH_DEPTH`
and `ARTICLE_READINESS` deliberately mirror signals the pipeline already computes
deterministically (`verify.mjs` tiers, `claim-verify.mjs`, `conflict-detect.mjs`,
`headline-verify.mjs`, `audit.mjs`). Jev is not being asked to discover a fact the code
already knows — it is a second opinion on which verification path to take. **Sources and
evidence always decide what is true.** A Jev route never establishes a fact, and a low
`confidence` never downgrades verified evidence; it only ever raises a human-review flag.

---

## 6. Shadow mode — the guarantees

```
OpenCode / agent
      ↓
normal workflow continues unchanged
      ↓
Jev consulted at an appropriate decision point (optional)
      ↓
decision recorded to a redacted shadow log
      ↓
existing workflow continues unchanged
```

Enforced in code, not just in prose:

* `JEV_MODE=shadow` is the only mode that reaches the network. A value of `active`, `gate`
  or `enforce` is **refused** (`skipped: 'refused_mode'`) rather than silently honoured.
* `JEV_MODE=simulate` is the only other accepted mode. It is a **local simulation, not Jev** —
  see §6.1. It never touches the network and never needs a key.
* `JEV_MODE=disabled` (or `off`) means no HTTP call is attempted at all.
* Every record carries `affectedWorkflow: false`. A successful call can never report that it
  changed anything.
* No workflow, pipeline stage, or site module imports the router.
* `jevDecide()` resolves on every path — unknown decision type, missing key, 401, 422, 429,
  529, timeout. It never throws and never blocks a caller.
* Missing key ⇒ `skipped: 'not_configured'`, and **no HTTP request is attempted** (asserted by
  a test that injects a `fetchImpl` which fails if called).
* Retry policy: only `429`, `529` and network/timeout errors are retried, at most twice, with
  exponential backoff. `401` is never retried. Mirrors the documented TypeSafe behaviour.

### 6.1 Offline simulation — NOT Jev

Added 2026-09-25 so the plumbing can be validated with no API key, which is the current
state of this project.

```bash
JEV_MODE=simulate node tools/jev_decide.mjs FAILURE_ROUTING \
  --state='The same approach failed twice' --json
```

**What it is:** a deterministic local keyword heuristic. The rules live in
`pipeline/config/jev-decisions.json` under `simulation.rules` so a human can read exactly
what it does. It picks the option whose keyword list scores the most substring matches in
the state text, and reports which keywords fired. No randomness, no model, no network.

**What it is NOT, and this is enforced by tests:**

| Never produced | Enforced how |
|---|---|
| `confidence` | `null`, with `confidenceSource: "not-available-offline"` |
| `probabilities` | `null` |
| token `usage` | `null` |
| a `model` name | `null` — a simulated `jev-*` string would be a lie; a test asserts no `jev-<digit>` appears anywhere in a simulated record |
| latency | not measured or claimed |
| companion question answers | `null`, marked as not simulated |

Every simulated result carries `simulated: true`, `isRealJev: false`,
`authority: "NONE-SIMULATION"`, and `agent.source: "SIMULATION-NOT-JEV"`. The CLI prints a
four-line `!! SIMULATED — NOT THE JEV/TYPESAFE MODEL !!` banner. The shadow log stores the
same flags. When no keyword matches, the heuristic reports `fallbackToFirstOption: true`
rather than inventing a plausible-looking answer.

**If a real key is later configured, `JEV_MODE=simulate` still short-circuits before the key
is even read**, so a simulation can never be produced by accident from a live account.

### 6.2 The agent contract (no LLM-generated paragraph)

Every result — real or simulated — carries a flat, typed `agent` block, so the agent branches
on enum values and never needs an LLM to write a paragraph about the decision:

```json
{
  "agent": {
    "decision": "change_approach",
    "confidence": null,
    "escalate": false,
    "nextStep": "do NOT repeat the same action; switch to a materially different method",
    "authority": "NONE-SIMULATION",
    "advisoryOnly": true,
    "source": "SIMULATION-NOT-JEV"
  }
}
```

`nextStep` is a **static lookup** from `guidance` in the decision catalog, keyed by
`(decisionType, option)`. It is a string constant, not generated text. A test asserts every
decision type has guidance for every one of its options.

### Shadow log

Append-only JSONL, one file per UTC day, at `pipeline/logs/jev-shadow-YYYY-MM-DD.jsonl`.
That directory is already excluded by `.gitignore` (`pipeline/logs/`), confirmed with
`git check-ignore`. Files are written mode `0600`.

One record per decision:

```json
{
  "ts": "2026-09-25T13:57:57.161Z",
  "taskId": "test2-complex",
  "decisionType": "AGENT_ROUTE",
  "mode": "shadow",
  "key": "[redacted:field-name]",
  "state": { "kind": "object", "keys": ["goal", "evidence", "constraints"], "goal": "…" },
  "ok": false,
  "skipped": "not_configured",
  "route": null,
  "confidence": null,
  "affectedWorkflow": false,
  "reason": "no_api_key_configured"
}
```

**Redaction.** Every record passes through `redact()` before it touches disk: key-like
tokens, `ghp_*`, `Bearer …`, JWTs, and any `*_KEY` / `*_TOKEN` / `*_SECRET` / `*_PASSWORD`
assignment or field name. The API key is never logged — only its shape
(`env:TYPESAFE_API_KEY(len=17)` or `absent`), and even that field name is redacted. State is
summarised to a compact whitelist, never dumped whole, and truncated at 4000 characters.
Covered by 4 dedicated redaction tests.

---

## 7. Agent instruction

Added as **section 5 of the repo `AGENTS.md`**, which is this repository's real OpenCode
project-instruction file (confirmed: it is the file OpenCode auto-loads for this worktree, and
it already carries the site's hard constraints). The existing sections 1–4 are byte-identical;
the new section was appended.

OpenCode's other persistent-instruction mechanisms, and why they were not used instead:

| Mechanism | Why not |
|---|---|
| `site/AGENTS.md` | that is the Astro theme's own conventions; a dev-tooling policy does not belong there |
| `.opencode/agent/jachai-lekhok.md` | that is the **production writer subagent** invoked by `auto-author.yml`. Editing it would change live authoring behaviour |
| global `~/.config/opencode/AGENTS.md` | would apply to every unrelated project, not just Jachaidesk |

The policy in section 5 states when to consider Jev, when to skip it, how to invoke it, and
the hard rules: never a substitute for factual verification, never overrides an explicit
project requirement or human confirmation, respect "bypass Jev", keep irreversible and
production-impacting actions behind confirmation, never wire Jev into a workflow or the
deploy path, never commit keys, and report honestly when Jev is skipped or unavailable.

---

## 8. Future newsroom decision points (Phase 8) — evaluated, NOT activated

The instruction to the next agent is explicit in the catalog itself
(`futureOnly.wired: false`): the newsroom points below are documented so the design can be
reviewed, and a unit test asserts they stay unwired.

| Decision point | Pipeline stage it would sit at | Why Jev could help | Why it must not be trusted with |
|---|---|---|---|
| Is this cluster worth a brief, or research noise? | before `extract` | cheap triage over a large candidate pool | deciding a story is real |
| Does this cluster need cross-checking, or a primary source? | after `verify` | suggest *which* check to run next | whether the check passed — `verify`/`claim-verify` own that |
| Is research becoming repetitive? | before `synth` | same outlets, no new facts, wasted synthesis | suppressing a legitimate update |
| Synthesis or restatement? | before `finalize` | catches articles that add nothing over an existing one | rewriting the article |
| Ready for editorial review? | before publish | a second opinion before a human sees it | publishing; `audit` + `editorial` gates stay deterministic |
| Is this source dead, or temporarily broken? | `fetch` | avoids permanently disabling a good source | dropping a source — `source-health.mjs` owns the trend |
| Retry, change approach, or escalate? | on pipeline failure | the exact loop-stopping case in Phase 7 | mutating pipeline state |

**Non-negotiable:** the factual truth of an article is never delegated to Jev. Jev chooses a
verification path. Sources and evidence determine claims. Bengali remains an open accuracy
risk — TypeSafe's model documentation states English is the primary training language and
other languages are "handled but not equally well". Any future Bengali-state test must
measure this before it is trusted, which is why nothing is activated now.

---

## 9. Testing (Phase 7) — actual results

Run through the CLI exactly as the agent instruction describes.

### TEST 1 — simple deterministic task

* **Task:** read `pipeline/state/pick.json` and report how many slugs are picked.
* **Jev invoked:** **NO** — deliberately skipped. A deterministic file read cannot benefit
  from a calibrated second opinion; the policy says skip.
* **Action taken:** read the file. Result: `picked` = 1 (`national-534`), `pending` = 1.
* **Decision affected workflow:** n/a (never invoked).
* **Result:** PASS. No shadow-log entry was created for this task, which is the correct
  evidence that the skip path is real and not just a claim.

### TEST 2 — complex decision

* **Task:** three materially different remediation routes for a broken thumbnail workflow
  (bundled fonts vs. runner pin vs. dependency change) under hard constraints
  (`no apt`, `zero budget`, `must not touch site/` or deploy).
* **Jev invoked:** **YES** — `node tools/jev_decide.mjs AGENT_ROUTE --task=test2-complex`.
* **Jev decision:** **NOT AVAILABLE — `no_api_key_configured`.** No TypeSafe API key is
  configured on this machine, so no request was made and **no decision was obtained**.
* **Action taken:** the agent continued with its own reasoning. The task was already solved in
  a previous session (D35: bundled Bengali TTFs in `pipeline/fonts/` + `FONTCONFIG_FILE`,
  which removed the `apt` dependency) — that decision was reached without Jev and stands.
* **Decision affected workflow:** **NO.** `affectedWorkflow: false` in the log.
* **Result:** the routing mechanism works and behaves correctly when unconfigured; the
  decision content is **NOT VERIFIED** because no key exists.

### TEST 3 — repeated failure

* **Task:** reproduce the known local-Astro-build loop — `satteri` has no `android-arm64`
  native binding, so `npm run build` fails identically on every attempt (this project's
  recorded D28 constraint: local builds are impossible on Termux; builds run on Vercel).
  Five prior attempts, all the same class of failure, supplied as state.
* **Jev invoked:** **YES** — `node tools/jev_decide.mjs FAILURE_ROUTING --task=test3-repeats`.
* **Jev decision:** **NOT AVAILABLE — `no_api_key_configured`.** No key ⇒ no call ⇒ no
  recommendation produced. *The router's ability to emit `change_approach` /
  `investigate_root_cause` here is therefore NOT VERIFIED against the real model.*
* **Action taken:** the agent recognised the loop from the supplied evidence and stopped
  repeating it, without Jev. The correct engineering outcome was already recorded in project
  memory as D28.
* **Decision affected workflow:** **NO.**
* **Result:** the *scenario* is real and reproducible, and the routing *shape* for it is
  correct; the actual Jev recommendation is **NOT VERIFIED**.

### Automated tests

`node --test test/jev-router.test.mjs` → **24/24 pass**, fully offline (an injected
`fetchImpl` is used everywhere; the no-key path is asserted to make zero network calls).
Coverage: catalog shape and that shadow mode is the declared mode, the five decision types'
criteria validity, redaction of 4 secret shapes plus truncation, `compactState` whitelisting,
no-key/bypass/disabled/refused-mode/unknown-type short-circuits, one-request-per-decision
assertion against the official endpoint and body shape, low-confidence and high-noul
escalation, `429` retried then succeeding, `401` not retried, timeout contained, and the
shadow log being valid redacted JSONL.

Full suite: **199/201 pass**. The 2 failures (`test/editorial-gate.test.mjs` and
`lengthForMode: proposal #6 bands` in `test/sufficiency.test.mjs`) are **pre-existing
baseline failures** — both files are byte-identical to `HEAD` and contain zero references to
`jev`.

---

## 10. What is NOT verified

* **A real Jev API call has never succeeded.** No `TYPESAFE_API_KEY` is configured anywhere on
  this machine. Status A (skill + router installed) is done; B (API configured), C (real
  request completed) and D (OpenCode invoking a live decision) are **NOT DONE**.
* **Decision quality is NOT VERIFIED** for any decision type. The questions and criteria were
  written from the official API reference, not tuned against real Jev output, because there
  has been no real output.
* **Free usage / trial credit is NOT VERIFIED** — not documented on official pages.
* **Bengali-state accuracy is NOT VERIFIED** and is a known risk.
* **Local Astro build: NOT VERIFIED in this session** (unrelated to Jev; site dependencies are
  not installed on this machine and the D28 platform constraint still applies).

### Disclosure

While writing the tests, an early defect meant the injected mock was bypassed and one request
reached the real endpoint `https://api.typesafe.ai/v1/systemone` with an invalid placeholder
key and the trivial state `x`. The API answered `401 authentication_error`. No valid key
existed, no decision was returned, and no repo data was transmitted. The defect is fixed
(`postJson` now takes `fetchImpl`) and the test asserting the exact endpoint and request body
guards it. Reported here rather than omitted.

---

## 11. Operating it

```bash
cd ~/project-coba/newsdesk-bd/pipeline

node tools/jev_decide.mjs --list                     # catalog + configured true/false
node tools/jev_decide.mjs AGENT_ROUTE --task=t1 \
  --state-file=/tmp/state.json                       # human-readable output
node tools/jev_decide.mjs FAILURE_ROUTING --state='{"error":"…","attempts":5}' --json
node tools/jev_decide.mjs AGENT_ROUTE --state-file=/tmp/s.json --bypass   # explicit skip
JEV_MODE=disabled node tools/jev_decide.mjs --list    # verify without any call
JEV_MODE=simulate node tools/jev_decide.mjs FAILURE_ROUTING --state='same approach failed twice'

tail -f logs/jev-shadow-$(date -u +%F).jsonl         # watch the shadow log
```

Always exits `0` unless the arguments are unusable, so it can never fail a script or a test.

## 12. Offline validation run — 2026-09-25 (no API key, no network)

Run because no TypeSafe key exists. **No real API call was made and none was attempted.**

| Capability required | Verdict | Evidence |
|---|---|---|
| Jev decision interface | PRESENT | `export async function jevDecide` (single entry point) |
| Typed decision / choice handling | PRESENT | `answer?.choice`, route is a catalog enum |
| Score handling | PRESENT | `answer?.score`; verified functionally as a selected type |
| Noul handling | PRESENT | `answer?.noul`; verified functionally as a selected type |
| Confidence handling | PRESENT | `answer?.confidence` + `lowConfidenceAt` threshold; `null` for noul, per the API spec |
| Routing / action interpretation | PRESENT | `interpret()` → `route`, `confidence`, `flags`, `escalate` |
| Error handling | PRESENT | `if (!res.ok)` → typed status; 401/422/429/529 handled |
| Timeout / failure handling | PRESENT | `AbortSignal.timeout(20000)`; bounded retry with exponential backoff; never throws |
| Logging | PRESENT | redacted append-only JSONL, mode `0600`, gitignored |
| Shadow mode | PRESENT | enforced; gating modes refused |
| Bypass behaviour | PRESENT | `--bypass` flag and `bypassed_by_caller` |
| Offline simulation (labelled) | PRESENT | `JEV_MODE=simulate`, `SIMULATION-NOT-JEV` |
| Agent contract without LLM prose | PRESENT | static `guidance` lookup + flat `agent` block |

**Scenarios.** A — "Fix a typo in one existing file": skipped by policy, no decision
produced, nothing logged as a decision. B — multi-route article task: structured enum
`gather_more_evidence` (SIMULATED, matched keyword `research`), machine-readable, no prose.
C — "failed twice using the same approach": structured enum `change_approach` (SIMULATED,
matched `same approach`, `failed twice`).

**One real bug found and fixed by this validation:** low-confidence escalation was hardcoded
to `answer.type === 'choice'`, so a future low-confidence **score** decision would never have
escalated. Per the TypeSafe API reference both choice and score carry `confidence` (noul does
not). Now any low-confidence answer escalates. Regression test added, along with functional
tests for score-as-selected and noul-as-selected, which the catalog never exercised because
every selected question is a choice.

**Tests: 37/37 Jev tests pass** (13 new). Full suite 212/214, the same 2 pre-existing
baseline failures.

### Classification

* **A. REAL JEV API READY** — plumbing complete, but unproven against the real service. A key
  is the only missing input. Cannot be claimed until a real call returns 200.
* **B. OFFLINE SIMULATION ONLY** — this is the current state of *evidence*.
* **C. PARTIALLY INTEGRATED** — the newsroom decision types are deliberately unwired.
* **D. BROKEN** — no.

## 13. Activation path (requires explicit approval — do not do it yet)

1. Obtain a key and store it locally as in §3.
2. Run the full test set with the key present; confirm real responses, real `confidence`
   values, real latency, and the actual cost per decision.
3. Tune thresholds in `jev-decisions.json` against real output, especially for Bengali states.
4. Re-run Phase 7 tests and record the real decisions.
5. Only then, and only with explicit instruction, consider wiring a decision point into the
   pipeline — still as a log-only signal first.
6. Active gating, or any Jev call from GitHub Actions or Vercel, is a separate, explicit
   decision that has **not** been made.
