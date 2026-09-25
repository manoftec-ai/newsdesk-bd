# 2026-09-25 — D101: LOCAL_DECISION_ROUTER (replaces TypeSafe Jev)

## What was decided

The user evaluated the TypeSafe Jev API and **decided not to use it**. Instead: a local,
deterministic, offline decision-routing framework inspired by Jev-style typed routing, named
`LOCAL_DECISION_ROUTER`.

**It is NOT the TypeSafe Jev model.** No network, no API key, no external AI, no cost, and
**no probability of any kind**.

## Why it was built this way

The design was shaped by a gap measured in the repo, not by generic advice:

* `pipeline.yml` contains **12** `|| true` / `|| echo "...harmless"` steps.
* `auto-author.yml` contains **6** more.
* `lib/audit.mjs` retries a bounded 2 times (`MAX_AUDIT_RETRIES`).

Those make a failing step silent, and a silent failure gets retried by the next cron tick
with the identical approach. Nothing in the repo could say *"you already failed this exact
thing three times — stop and diagnose."* `FAILURE_002` / `FAILURE_003` exist for precisely
that, and the real repo case (the Termux `satteri` build limitation, five identical attempts)
is a test fixture.

## Files

| File | Role |
|---|---|
| `pipeline/lib/decision-state.mjs` | `ACTIONS` + `DECISION_TYPES`, `normalizeState`, `detectSecrets`, `summarizeState` |
| `pipeline/lib/decision-rules.mjs` | 19 rules (id, priority, pure `when`, action, reason) + `THRESHOLDS` |
| `pipeline/lib/decision-router.mjs` | `buildRequest` / `decide`, priority resolution, shadow log |
| `pipeline/lib/decision-log.mjs` | redacting append-only JSONL (`0600`, gitignored) — a `git mv` of the Jev-era `shadow-log.mjs`, so the proven redaction was reused rather than rewritten |
| `pipeline/tools/decision_router.mjs` | CLI: `--list`, `--rules`, `<TYPE> --state=… [--json]` |
| `pipeline/test/decision-router.test.mjs` | 41 offline tests |
| `docs/DECISION-ROUTER.md` | full documentation |

**Zero dependencies added**; `package.json` / `package-lock.json` untouched.

## Contract

`DecisionRequest { decisionType, task, state, history, constraints }` — **rules read only
`state`**, which is what keeps every predicate pure (no I/O, no clock, no randomness).

`DecisionResult` carries `engine`, `ts`, `action`, `ruleId`, `rulePriority`, `reason`,
`ruleConfidence`, `confidenceKind`, `confidenceIsProbability: false`,
`requiresHumanApproval`, `shadowMode: true`, `wouldChangeWorkflow: false`, compact `state`,
the full `evaluated[]` rule trace, and `durationUs`.

**On confidence:** `ruleConfidence` is an explicitly-named **deterministic rule match
strength** (1 = safety tier, 0.75 = specific corroborated condition, 0.5 = generic). It is
*not* a probability and says nothing about whether the action is correct. A test asserts that
no Jev-shaped field (`jevResult`, `probabilities`, `noul`, `systemone`, `typesafe`) ever
appears in a result.

## Actions

`SKIP` · `CONTINUE` · `RESEARCH_MORE` · `CHANGE_STRATEGY` · `RETRY` · `VERIFY` ·
`HUMAN_REVIEW` · `SPLIT_TASK` · `INVESTIGATE_ROOT_CAUSE` · `ROUTE_DECISION` ·
`STOP_RESEARCH`

## Rule priority

1 **SAFETY** — `SEC_001` secret in state, `PROD_001` irreversible high-impact production,
`PROD_002` high-impact production → `HUMAN_REVIEW`
2 **HUMAN_APPROVAL** — `APPROVAL_001` → `HUMAN_REVIEW`
3 **FAILURE** — `FAILURE_004` ≥6 same → `HUMAN_REVIEW` · `FAILURE_003` ≥3 same →
`INVESTIGATE_ROOT_CAUSE` · `FAILURE_002` ≥2 same → `CHANGE_STRATEGY` · `FAILURE_001`
transient & <3 → `RETRY`
4 **RESEARCH** — `RESEARCH_004` conflict → `VERIFY` · `RESEARCH_006` stagnant, no alternative →
`STOP_RESEARCH` · `RESEARCH_005` stagnant, alternative exists → `CHANGE_STRATEGY` ·
`RESEARCH_002` primary source needed and missing → `RESEARCH_MORE` · `RESEARCH_001` <2
sources → `RESEARCH_MORE`
5 **ROUTING** — `ROUTE_006` ≥2 materially different routes → `ROUTE_DECISION`
6 **TASK_SHAPE** — `TASK_002` / `TASK_001` → `SKIP` · `SPLIT_007` → `SPLIT_TASK`
8 **DEFAULT** — `DEFAULT_000` → `CONTINUE`

Within a tier the **more specific** rule is declared first, because resolution is
first-match-wins. A test pitting safety rules against SKIP/ROUTE rules proves a lower-priority
rule can never override a higher-priority one, and a second test proves all 19 rules are
individually reachable as the winner (no dead code).

## Design notes worth keeping

* `RESEARCH_001` requires a **known** source count. Treating unknown as zero would make the
  router demand more research on every single story.
* `primarySourceAvailable` and `newInformationLastRound` are nullable, so *unknown* stays
  distinct from *false*.
* Secrets are redacted on the way **in**, and `detectSecrets()` actively scans the caller's
  input. A hit sets `secretsDetected`, which routes `SEC_001` to `HUMAN_REVIEW`. The secret is
  never stored, returned or logged.
* The log uses omit-empty semantics (`null`/`false`/`0`/`''`/`'none'` dropped) so a real line
  stays short; absence is unambiguous because the defaults are documented.

## Tests

**41/41 pass**, fully offline. All 7 required scenarios pass, and were additionally run live
through the CLI:

| Scenario | Action | Rule |
|---|---|---|
| typo fix | `SKIP` | `TASK_002` |
| same error twice | `CHANGE_STRATEGY` | `FAILURE_002` |
| same error three times | `INVESTIGATE_ROOT_CAUSE` | `FAILURE_003` |
| destructive production migration | `HUMAN_REVIEW` | `PROD_001` |
| two materially different approaches | `ROUTE_DECISION` | `ROUTE_006` |
| conflicting sources | `VERIFY` | `RESEARCH_004` |
| normal known edit | `SKIP` | `TASK_002` |

Also covered: full determinism (same input ⇒ identical output including the trace), exactly
one winner and it is the first match, the shadow invariant across 4 states, secret never
reaching disk while still triggering `SEC_001`, log field completeness, state normalisation
dropping unknown keys, `detectSecrets` on 3 credential shapes and 2 negative cases, and
realistic Jachaidesk states.

Full pipeline suite: **216/218** — the same 2 pre-existing baseline failures
(`editorial-gate`, `sufficiency` proposal #6) that predate this work.

## Bugs found and fixed while building (all in my own new code)

1. `logDir()` still read the old `JEV_SHADOW_LOG_DIR` env var → logs went to the wrong place.
2. `FAILURE_004` was declared *after* `FAILURE_003`, making it unreachable (first-match-wins
   gave the 3-attempt rule priority). Reordered so the more specific rule comes first within
   its tier.
3. `normalizeState` did not redact on the way in, so a secret passed through into state.
4. `summarizeState` emitted every default, making log lines noisy.
5. `decide()` did not put `ts` on the returned result, only in the log.

Two further test failures were **wrong tests, not wrong code** (a secret in a non-state key
that is dropped anyway, and expecting `HUMAN_REVIEW` at 5 attempts when the threshold is 6).
Both were corrected rather than bending the engine.

## OpenCode integration

`AGENTS.md` §5 rewritten as the `LOCAL_DECISION_ROUTER` policy; **sections 1–4 verified
byte-identical**. The policy states plainly that the router is *not* the TypeSafe Jev model,
that **invocation is not guaranteed** because there is no hook, and that the result is one
input rather than authority. Hard rules: never decide factual truth, never bypass an explicit
requirement or a human decision, destructive/irreversible stays behind confirmation, never
wire into a workflow / Vercel / pipeline stage, never commit secrets, report honestly when
skipped or unavailable.

## TypeSafe Jev retired (reversible)

Removed: `pipeline/lib/jev-router.mjs`, `pipeline/tools/jev_decide.mjs`,
`pipeline/config/jev-decisions.json`, `pipeline/config/jev.env.example`,
`pipeline/test/jev-router.test.mjs`, `.opencode/skills/typesafe-ai/`.
`docs/JEV-INTEGRATION.md` was `git mv`-ed to `docs/TYPESAFE-JEV-EVALUATED-NOT-USED.md` with a
SUPERSEDED banner — kept as the record of what was evaluated and verified, not as an
operating guide. Everything is in git history (commits `7e160ac`, `742060d`, `37838a8`,
`40b9af2`), so restoring it is a revert.

## Jachaidesk integration points — identified, NOT activated

Research depth · source-conflict routing · research stagnation · article mode · repeated
generation failure · fact-check routing · editorial review. Nothing is wired.

**The hard line:** the router has exactly one power over a factual claim — it chooses which
verification action happens next. Sources and evidence determine the claim. A test asserts it
never emits a truth judgement.

## Production

**NONE.** No Vercel change, no GitHub Actions edit, no new dependency, no secret, no API call,
nothing deployed.

## Limitations (stated in docs too)

Only as good as the state passed in · no hook, so invocation is agent-chosen · cannot detect
that two differently-worded errors are the *same* error (the agent must set `sameError` and a
stable `failureSignature`) · thresholds 2/3/6, 3 stagnant rounds, 2 sources are judgement calls
collected in `THRESHOLDS` · no learning loop, by design · reasons are English prose though
predicates are language-agnostic · it cannot judge article quality, only route process.
