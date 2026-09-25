# 2026-09-25 — D99: Jev (TypeSafe AI) decision router, SHADOW MODE

> Numbering note: this started as D90, but a parallel session independently used D90 for
> "exact-pick authoring was a safe no-op". Renumbered to **D99** so both records survive.
> `memory/MEMORY.md` and `memory/MEMORY.json` were hand-merged to keep every other
> parallel-session decision (D91–D98) intact.

## What was done

Inspected the whole repo read-only first, then verified Jev against **official TypeSafe
documentation** (not a generic tutorial), then built a local-only, non-gating decision router
plus the agent instruction. **Production was not touched and nothing was deployed.**

## Phase 1 — architecture report (inspection only)

| Item | Finding |
|---|---|
| Repo | `manoftec-ai/newsdesk-bd`, clean tree, `main` @ `908023d` |
| Runtime / framework | Node 24 ESM pipeline + Astro 7 static site on Vercel Hobby, 500 content files |
| AI architecture | provider-swapped: `lib/llm.mjs` (Gemini free tier, OpenAI-compatible) **and** headless `opencode run --agent jachai-lekhok` (keyless `opencode/big-pickle`). D37 = opencode authors; `author.yml` LLM path parked |
| OpenCode instructions | repo `AGENTS.md` (real auto-loaded project file), `site/AGENTS.md` (Astro theme), `.opencode/agent/jachai-lekhok.md` (production writer subagent), global `~/.config/opencode/AGENTS.md` |
| Research | `fetch.mjs` → normalize → cluster → verify → `claim-verify` → `conflict-detect` → extract → `briefs/*.json` |
| Article generation | `synth.mjs writingPrompt()` → `tools/render_prompt.mjs` → agent writes body → `tools/finalize_stories.mjs` (`draft:false`) |
| Quality checks | `audit.mjs` (mechanical + LLM 2-stage), `headline-verify.mjs`, `editorial.mjs` (`readerValueCheck`), `length.mjs`, `reverify.mjs` |
| Retry / failure | `audit.mjs` bounded writer→auditor retries; `fetch.mjs` timeout + politeness delay; workflows use `\|\| true` / `\|\| echo harmless`; `gate_history_batch` http200 retry. **Nothing guards against repeating a failed strategy** — that gap is what Jev's `FAILURE_ROUTING` targets |
| Best Jev location | a new local-only Node module + CLI + JSONL shadow log; nothing in the production path calls it |
| Risks | 5 concurrent bot workflows already push to `main`; any workflow change is out of scope; shadow log must never hold keys; TypeSafe documents English as primary language, so Bengali states are an accuracy risk |

## Phase 2 — Jev verified (official sources only)

* Jev = TypeSafe AI's **System One model**: `choice` / `score` / `noul` with calibrated
  confidence. It **generates no text**.
* **Official docs state outright that Jev is NOT a drop-in LLM for coding agents and name
  opencode.** There is no `model: jev-latest` for an agent. This validates the requested
  architecture (Jev beside the agent, never instead of it).
* Access = hosted `POST https://api.typesafe.ai/v1/systemone`, `model: jev-latest`
  (= `jev-1.13.0`), `Authorization: Bearer TYPESAFE_API_KEY`.
* **API key required** (401 without). Early access. **No local/offline mode** — no weights,
  cannot self-host.
* **$0.042 per million input tokens, output free.** 250k tok/s, 1200 req/min, 64k context.
  Errors 401 / 422 / 429 / 529.
* **No free tier documented officially → NOT VERIFIED.**
* Language: English primary, others "handled but not equally well".
* Python `typesafe-sdk` **deliberately not installed** — repo is Node/Astro, that would be an
  unrelated package. The generic Python instruction in the prompt was not followed.

### A → D status, stated honestly

| | Status |
|---|---|
| A. Jev skill + router installed | **DONE** |
| B. Jev API configured | **NOT DONE** — no key exists on this machine |
| C. Real Jev API request completed | **NOT DONE** — no successful call ever made |
| D. OpenCode invoked a live Jev decision | **NOT DONE** — router was invoked but had no key |

## Phase 3/4/5 — what was built

Added (all local, zero dependencies, no production path):

* `pipeline/lib/jev-router.mjs` — mode guard, one request per decision, bounded retry on
  429/529/timeout only (401 never retried), never throws, never gates.
* `pipeline/lib/shadow-log.mjs` — redacting append-only JSONL writer, mode `0600`, into
  `pipeline/logs/` which `.gitignore` already excludes (confirmed with `git check-ignore`).
  Redacts key-like tokens, `ghp_*`, `Bearer …`, JWTs and any `*_KEY`/`*_TOKEN`/`*_SECRET`/
  `*_PASSWORD` field or value. The API key is only ever logged as a shape.
* `pipeline/config/jev-decisions.json` — every question, criteria and threshold in one
  reviewable file (TypeSafe's own guidance).
* `pipeline/tools/jev_decide.mjs` — CLI, always exits `0`.
* `pipeline/config/jev.env.example` — template with no secret.
* `pipeline/test/jev-router.test.mjs` — 24 offline tests.
* `docs/JEV-INTEGRATION.md` — full architecture, verification, operations, activation path.
* `.opencode/skills/typesafe-ai/` — official TypeSafe agent skill, installed project-locally
  for OpenCode (`.opencode/skills/<name>/SKILL.md` is OpenCode's discovery path).

**Zero dependencies added.** The router uses Node's built-in `fetch` exactly like the existing
`lib/llm.mjs`, so `pipeline/package.json` and `package-lock.json` are untouched and the GitHub
Actions `npm ci` graph for all five bot workflows is provably unchanged. The official
`@typesafe-ai/sdk@0.6.0` was verified as a real package but not added; it is a drop-in swap of
`postJson` if ever wanted.

### Decision types

* Agent-routing, live in shadow mode: **`AGENT_ROUTE`**, **`FAILURE_ROUTING`**.
* Newsroom, **defined but NOT wired** (a unit test asserts they stay unwired):
  **`RESEARCH_DEPTH`**, **`ARTICLE_MODE`**, **`ARTICLE_READINESS`**.

All newsroom types are deliberately advisory and mirror signals `verify.mjs`,
`claim-verify.mjs`, `conflict-detect.mjs` and `audit.mjs` already compute deterministically.
**Jev chooses which verification path to take. Sources and evidence decide what is true.**

### Shadow-mode guarantees (enforced in code, not just prose)

* `JEV_MODE=shadow` is the only accepted non-off mode; `active`/`gate`/`enforce` are
  **refused** with `refused_mode`.
* Every record carries `affectedWorkflow: false`.
* Missing key ⇒ `not_configured` and **no HTTP attempt** (asserted by a test whose injected
  `fetchImpl` fails if called).
* No workflow, pipeline stage or site module imports the router.

## Phase 6 — agent instruction

Appended as **section 5 of the repo `AGENTS.md`**, the real auto-loaded project instruction
file. Sections 1-4 verified **byte-identical to HEAD** (the only textual diff is a previously
missing trailing newline).

Not used instead: `site/AGENTS.md` (Astro theme conventions), `.opencode/agent/jachai-lekhok.md`
(the **production** writer subagent — editing it would change live authoring), and the global
`~/.config/opencode/AGENTS.md` (would leak into unrelated projects).

Policy covers when to consider Jev, when to skip it, how to invoke it, and the hard rules:
never a substitute for factual verification, never overrides an explicit requirement or human
confirmation, respect "bypass Jev", keep irreversible/production actions behind confirmation,
never wire Jev into a workflow or the deploy path, never commit keys, report honestly.

## Phase 7 — tests actually run

| Test | Jev invoked | Decision | Workflow changed | Result |
|---|---|---|---|---|
| 1 — read `pick.json`, count picked slugs | **NO** (correctly skipped) | n/a | n/a | PASS. `picked` = 1 (`national-534`), `pending` = 1. **No log entry created** — proof the skip path is real |
| 2 — complex: 3 materially different fixes for broken thumbnails under `no apt` / zero budget / don't touch site | **YES** (`AGENT_ROUTE`) | **NOT AVAILABLE — `no_api_key_configured`** | **NO** | Router works and is honest when unconfigured; the task was already solved in D35 without Jev. Decision content **NOT VERIFIED** |
| 3 — repeated failure: 5 identical `satteri android-arm64` build failures | **YES** (`FAILURE_ROUTING`) | **NOT AVAILABLE — `no_api_key_configured`** | **NO** | Scenario is real and reproducible (D28); the agent stopped looping on its own evidence. Jev's ability to actually emit `change_approach` here is **NOT VERIFIED** |

* `node --test test/jev-router.test.mjs` → **24/24 pass**, fully offline.
* Full suite → **199/201**. The 2 failures (`test/editorial-gate.test.mjs`, and
  `lengthForMode: proposal #6 bands` in `test/sufficiency.test.mjs`) are **pre-existing
  baseline** — both files are byte-identical to `HEAD` and contain zero `jev` references.

## Phase 8 — newsroom evaluation (NOT activated)

Seven candidate points documented in `config/jev-decisions.json` (`futureOnly.wired: false`)
and `docs/JEV-INTEGRATION.md`, each with the pipeline stage it would sit at, why Jev could
help, and **why it must not be trusted with** the corresponding determination. Nothing wired.

## Phase 9 — GitHub / Vercel safety

`.github/workflows/**`, `site/**`, `pipeline/run.js`, `vercel` config and all pre-existing
libs/tools are **untouched** (`git diff --stat` empty for each). No secret added anywhere. No
deployment performed.

## What was NOT verified

* **No real Jev API call has ever succeeded** (no key configured). B, C, D are NOT DONE.
* Decision quality and thresholds are untuned — no real output has ever been seen.
* Free tier NOT documented officially.
* Bengali-state accuracy NOT VERIFIED and a known risk.
* Local Astro build not attempted (unrelated; D28 platform constraint still applies).

**Disclosure:** while writing the tests an early defect meant the injected mock was bypassed
and one request reached the real endpoint with an **invalid placeholder key** and the trivial
state `x`. The API answered `401 authentication_error`. No valid key existed, no decision was
returned, no repo data was sent. Fixed (`postJson` now takes `fetchImpl`) and guarded by a
test asserting the exact endpoint and request body.

## Remaining manual action (user only — key must never be pasted in chat)

```bash
# 1. get a key: https://console.typesafe.ai/keys
# 2. store it locally
printf '%s' 'YOUR_KEY' > ~/.config/opencode/.secrets/typesafe.key
chmod 600 ~/.config/opencode/.secrets/typesafe.key
# 3. point the router at it
export TYPESAFE_API_KEY_FILE=$HOME/.config/opencode/.secrets/typesafe.key
# 4. smoke test
cd ~/project-coba/newsdesk-bd/pipeline
node tools/jev_decide.mjs --list
node tools/jev_decide.mjs AGENT_ROUTE --task=smoke --state='{"goal":"verify the jev key works"}'
```

Do **not** add the key to GitHub Actions or Vercel. Shadow mode is local-only.

## Next step

Get the key, then re-run the Phase 7 tests with real responses and record the actual
decisions, confidences, latency and cost. Only after that consider (with explicit approval)
wiring a single decision point into the pipeline — still log-only first. Active gating, or
any Jev call from CI or Vercel, is a separate explicit decision that has **not** been made.
