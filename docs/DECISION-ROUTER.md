# LOCAL_DECISION_ROUTER — local deterministic decision framework

> **This is a local deterministic decision framework inspired by Jev-style typed routing.
> It is NOT the TypeSafe Jev model.** It makes no network call, needs no API key, uses no
> external AI, costs nothing, and produces **no probability** of any kind.
>
> Added 2026-09-25 (project decision **D101**). Supersedes the TypeSafe Jev evaluation
> recorded in `docs/TYPESAFE-JEV-EVALUATED-NOT-USED.md`.

---

## 1. Why it exists

The repo had a real, observed gap and nothing guarding it:

* `pipeline.yml` contains **12** `|| true` / `|| echo "...harmless"` steps.
* `auto-author.yml` contains **6** more.
* `lib/audit.mjs` retries a bounded 2 times (`MAX_AUDIT_RETRIES`).

Those make a failing step *silent*, and a silent failure gets retried by the next cron tick
with the same approach. There was no mechanism that could say *"you have already failed this
exact thing three times — stop and diagnose"*. That is what this framework is for.

It is deliberately conservative: pure functions, no I/O in any predicate, no clock, no
randomness. The same state always produces the same action, which is what makes it testable
and reviewable rather than a black box.

## 2. Files

| File | Role |
|---|---|
| `pipeline/lib/decision-state.mjs` | `ACTIONS` + `DECISION_TYPES` enums, state normalisation, secret **detection**, compact state summary |
| `pipeline/lib/decision-rules.mjs` | the rule set: id, priority, pure `when(state)`, action, reason |
| `pipeline/lib/decision-router.mjs` | the engine: `buildRequest()` + `decide()`, priority resolution, shadow log |
| `pipeline/lib/decision-log.mjs` | redacting append-only JSONL log (`0600`, gitignored) |
| `pipeline/tools/decision_router.mjs` | CLI: `--list`, `--rules`, `<TYPE> --state=… [--json]` |
| `pipeline/test/decision-router.test.mjs` | 41 offline tests: 7 required scenarios + every rule + safety contract |

**Zero dependencies added.** Node built-ins only, matching the existing `lib/llm.mjs`
pattern. `package.json` / `package-lock.json` untouched.

## 3. The decision contract

### DecisionRequest (input)

```js
buildRequest({
  decisionType,   // AGENT_ROUTE | FAILURE_ROUTING | RESEARCH_DEPTH | ARTICLE_MODE | ARTICLE_READINESS
  task,           // short human description
  state,          // the only thing rules read — see §4
  history,        // [{ action, outcome, at }] — recorded, not read by rules
  constraints,    // project constraints — recorded, not read by rules
});
```

Rules read **only** `state`. That is what keeps every predicate pure.

### DecisionResult (output)

```json
{
  "engine": "LOCAL_DECISION_ROUTER",
  "engineVersion": "1.0.0",
  "ts": "2026-09-25T14:42:53.400Z",
  "isLocalDeterministic": true,
  "isExternalModel": false,
  "decisionType": "FAILURE_ROUTING",
  "task": "astro build loop",
  "action": "INVESTIGATE_ROOT_CAUSE",
  "ruleId": "FAILURE_003",
  "rulePriority": 3,
  "reason": "Same failure signature \"ERR_MODULE_NOT_FOUND\" repeated 3 times (>= 3); find the cause before any further retry",
  "ruleConfidence": 0.75,
  "confidenceKind": "deterministic-rule-match-strength",
  "confidenceIsProbability": false,
  "requiresHumanApproval": false,
  "shadowMode": true,
  "wouldChangeWorkflow": false,
  "disabled": false,
  "state": { "attempts": 3, "sameError": true, "failureSignature": "ERR_MODULE_NOT_FOUND" },
  "evaluated": [{ "id": "SEC_001", "priority": 1, "action": "HUMAN_REVIEW", "matched": false }, "…"],
  "durationUs": 41
}
```

### About `confidence` — read this carefully

**`ruleConfidence` is NOT a probability and NOT an AI score.** It is a *deterministic rule
match strength*: how specifically the winning rule matched the state.

| Value | Meaning |
|---|---|
| `1` | safety-tier rule (a secret, or a destructive production change) |
| `0.75` | a specific, corroborated condition matched |
| `0.5` | a generic condition matched |

It carries **no** information about whether the action is *correct*. A test asserts that no
Jev-shaped field (`jevResult`, `probabilities`, `noul`, `systemone`, `typesafe`) ever appears
in a result, and that `confidenceIsProbability === false`.

## 4. State

Normalised by `normalizeState()`: every field is scalar-typed, unknown keys are **dropped**,
and defaults are documented. A rule can never depend on a field it does not understand.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `taskType` | string | `unknown` | `deterministic_edit`, `research`, `authoring`, `debug`, `deploy`, `analysis` |
| `operation` | string(300, redacted) | `''` | what is actually being done |
| `attempts` | int ≥0 | `0` | attempts at the current approach |
| `sameError` | bool | `false` | the same failure signature recurred |
| `failureSignature` | string(300) | `null` | stable identifier for the failure |
| `transientError` | bool | `false` | timeout / 429 / 5xx / network blip |
| `filesAffected` | int ≥0 | `1` | breadth of the change |
| `subtaskCount` | int ≥0 | `0` | distinct parts |
| `productionImpact` | `none`\|`low`\|`high` | `none` | blast radius |
| `irreversible` | bool | `false` | can it be undone |
| `needsUserApproval` | bool | `false` | an explicit requirement for a person |
| `secretsDetected` | bool | detected | credential material found in the input |
| `availableApproaches` | int ≥1 | `1` | materially different valid routes |
| `materiallyDifferent` | bool | `false` | the routes are genuinely different |
| `researchSourceCount` | int\|null | `null` | `null` = unknown, **not** zero |
| `conflictingSourceCount` | int ≥0 | `0` | material contradictions found |
| `primarySourceAvailable` | bool\|null | `null` | unknown is distinct from false |
| `primarySourceNeeded` | bool | `false` | the key claim needs an official record |
| `searchRounds` | int ≥0 | `0` | research rounds so far |
| `newInformationLastRound` | bool\|null | `null` | did the last search yield anything new |
| `isKnownFileEdit` | bool | `false` | straightforward known edit |
| `previousActions` | string[] ≤20 | `[]` | what was already tried |
| `elapsedMs` | int\|null | `null` | wall time |
| `claimVerifiable` | bool\|null | `null` | is there a checkable source for the claim |

**Secrets.** Strings are redacted on the way *in*, and `detectSecrets()` actively scans the
caller's input for credential shapes. If it finds any, `secretsDetected` is set and
`SEC_001` routes to `HUMAN_REVIEW`. The secret is never stored, never returned and never
logged.

## 5. Actions

`SKIP` · `CONTINUE` · `RESEARCH_MORE` · `CHANGE_STRATEGY` · `RETRY` · `VERIFY` ·
`HUMAN_REVIEW` · `SPLIT_TASK` · `INVESTIGATE_ROOT_CAUSE` · `ROUTE_DECISION` ·
`STOP_RESEARCH`

## 6. Rules and priority

`node tools/decision_router.mjs --rules` prints the live table.

### Priority order (1 = highest)

A lower-priority rule can **never** override a higher-priority one. Enforced by sorting, and
verified by a dedicated test that pits safety rules against SKIP / ROUTE rules.

| P | Tier | Rules |
|---|---|---|
| **1** | Safety | `SEC_001` secret in state · `PROD_001` irreversible high-impact production · `PROD_002` high-impact production |
| **2** | Human approval | `APPROVAL_001` explicit approval requirement |
| **3** | Repeated failure | `FAILURE_004` ≥6 same → `HUMAN_REVIEW` · `FAILURE_003` ≥3 same → `INVESTIGATE_ROOT_CAUSE` · `FAILURE_002` ≥2 same → `CHANGE_STRATEGY` · `FAILURE_001` transient & <3 → `RETRY` |
| **4** | Research / verification | `RESEARCH_004` conflict → `VERIFY` · `RESEARCH_006` stagnant & no alternative → `STOP_RESEARCH` · `RESEARCH_005` stagnant & alternative exists → `CHANGE_STRATEGY` · `RESEARCH_002` primary source needed and missing → `RESEARCH_MORE` · `RESEARCH_001` <2 sources → `RESEARCH_MORE` |
| **5** | Route ambiguity | `ROUTE_006` ≥2 materially different routes → `ROUTE_DECISION` |
| **6** | Task shape | `TASK_002` known file edit → `SKIP` · `TASK_001` deterministic & low risk → `SKIP` · `SPLIT_007` many files/parts → `SPLIT_TASK` |
| **8** | Default | `DEFAULT_000` → `CONTINUE` |

Within one priority tier the **more specific** rule is declared first, because resolution is
"first match wins". A test asserts every one of the 19 rules is individually reachable as the
winner, so no rule is dead code.

`RESEARCH_001` deliberately requires a *known* source count — an unknown count must not be
treated as zero, or the router would demand research on every story.

## 7. Shadow mode

```
CURRENT AGENT
     ↓
normal action (unchanged)
     ↓
LOCAL_DECISION_ROUTER consulted (optional, agent-initiated)
     ↓
logs what it WOULD have recommended
     ↓
continue normally
```

* `shadowMode: true` and `wouldChangeWorkflow: false` on **every** result, always.
* No pipeline stage, workflow, or site module imports the router.
* `decide()` never throws — malformed input, unknown decision type and `LDR_MODE=disabled`
  all return a valid result.
* `LDR_MODE=disabled` evaluates zero rules and returns `SKIP`.
* CLI exit code is always `0` unless the arguments are unusable, so it can never fail a
  script, a test or a pipeline run.

### Decision log

Append-only JSONL, one file per UTC day, `pipeline/logs/decision-YYYY-MM-DD.jsonl`, mode
`0600`. That path is already excluded by `.gitignore` (`pipeline/logs/`), confirmed with
`git check-ignore`.

Each record: `ts`, `task`, `decisionType`, `ruleId`, `rulePriority`, `action`, `reason`,
`ruleConfidence`, `confidenceKind`, `requiresHumanApproval`, `shadowMode`,
`wouldChangeWorkflow`, `disabled`, a compact `state` summary, `durationUs`.

`state` uses omit-empty semantics: `null`, `false`, `0`, `''` and `'none'` are dropped
because their value is the documented default. Absence is unambiguous, and a real log line
stays short.

## 8. Jachaidesk integration points — identified, NOT activated

Nothing below is wired. These are evaluation notes for a future, explicitly approved change.

| Decision point | Pipeline stage it would sit at | Rules that would apply | What it may decide | What it must never decide |
|---|---|---|---|---|
| Research depth | after `verify`, before `extract` | `RESEARCH_001/002/004` | whether to gather more sources, or verify a conflict first | whether any claim is true |
| Source conflict | after `claim-verify` / `conflict-detect` | `RESEARCH_004` | which claim needs cross-checking first | that a conflict is resolved |
| Research stagnation | before `synth` | `RESEARCH_005/006` | change the search method, or stop searching | suppressing a legitimate update |
| Article mode | before `render_prompt` | `ROUTE_006` | that several shapes are viable and one must be chosen | the prose itself |
| Repeated generation failure | around `finalize_stories` / `audit` | `FAILURE_002/003` | stop retrying, diagnose | discarding a story |
| Fact-check routing | before publishing a `factcheck` story | `RESEARCH_001/002` | which check to run next | the verdict |
| Editorial review | before publish | `RESEARCH_004`, `APPROVAL_001` | that a person must look at it | auto-publishing |

**The hard line:** the router has exactly one power over a factual claim — it chooses which
verification action happens next. Sources and evidence determine the claim. A test asserts the
router never emits a truth judgement.

## 9. Testing

`node --test test/decision-router.test.mjs` → **41/41 pass**, fully offline.

The 7 required scenarios, run live through the CLI:

| # | Scenario | Action | Rule | P |
|---|---|---|---|---|
| 1 | "Fix typo in sources.yaml" | `SKIP` | `TASK_002` | 6 |
| 2 | same error twice | `CHANGE_STRATEGY` | `FAILURE_002` | 3 |
| 3 | same error three times | `INVESTIGATE_ROOT_CAUSE` | `FAILURE_003` | 3 |
| 4 | destructive production DB migration | `HUMAN_REVIEW` | `PROD_001` | 1 |
| 5 | two materially different approaches | `ROUTE_DECISION` | `ROUTE_006` | 5 |
| 6 | article claims conflict across sources | `VERIFY` | `RESEARCH_004` | 4 |
| 7 | normal known file edit | `SKIP` | `TASK_002` | 6 |

Plus: all 19 rules individually reachable; priority ordering stable; exactly one winner and it
is the first match; full determinism (same input ⇒ identical output incl. the trace);
`HUMAN_REVIEW` correctness; no probability fields anywhere; shadow mode invariant across 4
different states; secret never reaching disk while still triggering `SEC_001`; log field
completeness; state normalisation dropping unknown keys; `detectSecrets` on 3 credential
shapes and 2 negative cases; realistic Jachaidesk states.

Full pipeline suite: **216/218**, the same 2 pre-existing baseline failures
(`editorial-gate`, `sufficiency` proposal #6 length bands) that predate this work.

## 10. Limitations — stated plainly

1. **Only as good as the state you give it.** The router sees what the agent passes. It
   cannot detect a loop the agent fails to describe. It is a mirror, not an oracle.
2. **Invocation is not automatic.** There is no hook. The agent must choose to run it, and
   AGENTS.md §5 says so explicitly. Nothing guarantees it is ever consulted.
3. **Pure keyword-free logic, so no semantics.** It cannot tell that two differently-worded
   errors are the *same* error — the agent must set `sameError` and a stable
   `failureSignature`.
4. **Thresholds are judgement calls.** 2 / 3 / 6 attempts, 3 stagnant rounds, 2 sources. They
   encode this repo's operating reality and are collected in `THRESHOLDS` for easy review.
5. **No learning.** Rules are fixed code. There is no feedback loop from the logs into the
   rules, by design — a router that rewrites itself is not auditable.
6. **English keywords in `reason` text only.** The predicates are comparisons on typed
   fields, so the framework is language-agnostic, but the reasons read in English.
7. **It cannot judge quality.** No rule evaluates whether an article is *good*. It only
   routes process.

## 11. Operating it

```bash
cd pipeline
node tools/decision_router.mjs --list
node tools/decision_router.mjs --rules
node tools/decision_router.mjs FAILURE_ROUTING --state='{"attempts":3,"sameError":true}'
node tools/decision_router.mjs RESEARCH_DEPTH --state-file=/tmp/state.json --json
LDR_MODE=disabled node tools/decision_router.mjs AGENT_ROUTE --state='{}'   # evaluate nothing
tail -f logs/decision-$(date -u +%F).jsonl
```

Env: `LDR_MODE=disabled|off` to evaluate nothing · `LDR_LOG_DIR` to relocate the log.
