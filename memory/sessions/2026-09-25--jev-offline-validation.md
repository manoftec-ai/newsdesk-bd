# 2026-09-25 — D100: offline Jev validation (no API key, no network call)

## What was asked

An offline validation of the Jev integration: prove it is **structurally and functionally
ready** for a real key later. Explicit constraints: do not ask for a key, do not call the real
TypeSafe API, do not claim the real Jev model works, do not fabricate scores, confidence,
latency or API responses, and do not modify production code or the Vercel deployment.

## What was found

**The critical gap: there was no simulation mode.** With no key, the router returned
`not_configured` and produced *no decision at all* — so Tests B and C could not exercise the
decision path offline. Structural readiness could be asserted by reading code, but not
demonstrated.

Everything else was already in place: decision interface, typed choice handling, score and noul
handling, confidence + threshold, routing interpretation, HTTP error handling, timeout,
bounded retry, never-throws, logging, redaction, shadow mode, bypass.

## What was changed (local dev tooling only — no production, no Vercel)

1. **`JEV_MODE=simulate`** — a deterministic local keyword heuristic. Rules live in
   `config/jev-decisions.json` under `simulation.rules` so a human can read exactly what it
   does. It reports which keywords fired and, when nothing matches, reports
   `fallbackToFirstOption` rather than inventing a plausible answer.

   **It fabricates nothing**, and tests enforce each part of that: `confidence` is `null`
   (with `confidenceSource: "not-available-offline"`), `probabilities` `null`, token `usage`
   `null`, latency not measured, `model` is `null` — a simulated `jev-*` string would be a
   lie, and a test asserts no `jev-<digit>` appears anywhere in a simulated record. Companion
   questions are `null`, marked as not simulated. Every result carries `simulated: true`,
   `isRealJev: false`, `authority: "NONE-SIMULATION"`, `agent.source: "SIMULATION-NOT-JEV"`,
   and the CLI prints a 4-line `!! SIMULATED — NOT THE JEV/TYPESAFE MODEL !!` banner.

   Simulate mode short-circuits **before** the key is read, so a simulation can never be
   produced by accident from a live account.

2. **Flat typed `agent` contract** — `decision` / `confidence` / `escalate` / `nextStep` /
   `authority` / `advisoryOnly` / `source`. `nextStep` comes from a **static** `guidance` lookup
   keyed by `(decisionType, option)` in the catalog — a string constant, not generated text.
   This is what lets the agent branch on enum values with no LLM-written paragraph. A test
   asserts every decision type has guidance for every option.

## A real bug the validation found and fixed

`interpret()` hardcoded low-confidence escalation to `answer.type === 'choice'`. Per the
TypeSafe API reference, **both choice and score answers carry `confidence`** (noul does not),
so a future low-confidence **score** decision would have silently never escalated. Fixed to
escalate on any low-confidence answer that has one. Regression test added.

Also added functional tests for **score-as-selected** and **noul-as-selected**, which the
catalog never exercised because every selected question is a choice — the router would have
been untested for those types.

## Scenarios run (offline, no network)

| | Input | Outcome |
|---|---|---|
| A | "Fix a typo in one existing file." | **Skipped by policy.** No decision produced, nothing logged as a decision. |
| B | multi-route article task | Structured enum `gather_more_evidence` — **SIMULATED**, matched keyword `research` |
| C | "failed twice using the same approach" | Structured enum `change_approach` — **SIMULATED**, matched `same approach` + `failed twice` |

Parsed `--json` output through a plain `switch` on the enum: branching worked with no prose
reading and no model call.

## Tests

* Jev: **37/37 pass** (13 new — simulation labelling, no-fabrication, determinism, fallback,
  guidance completeness, agent-contract shape, score/noul as selected, the escalation
  regression, plus scenarios A/B/C as permanent regression tests).
* Full suite: **212/214**. The 2 failures are the same pre-existing baseline ones
  (`editorial-gate`, `sufficiency` proposal #6 length bands), untouched by this work.

## Classification

* **A. REAL JEV API READY** — plumbing complete; unproven against the real service.
* **B. OFFLINE SIMULATION ONLY** — this is the current state of *evidence*.
* **C. PARTIALLY INTEGRATED** — newsroom decision types deliberately unwired.
* **D. BROKEN** — no.

## What is still missing before a real Jev test

Exactly one input: a `TYPESAFE_API_KEY`. Everything else is in place — endpoint, request body
shape, auth header, timeout, retry policy, response parsing, interpretation, logging, and the
agent contract. No real call has ever returned 200.

## Production

Unchanged. No deployment, no Vercel change, no workflow change, no secret, no API call.

## Next step (user's, whenever they want)

Get a key at `console.typesafe.ai/keys`, store it at
`~/.config/opencode/.secrets/typesafe.key` (chmod 600), export `TYPESAFE_API_KEY_FILE`, then
run `node tools/jev_decide.mjs AGENT_ROUTE --task=smoke --state='…'` **without**
`JEV_MODE=simulate`. That will be the first real call, and until it returns 200 the honest
status stays "offline simulation only".
