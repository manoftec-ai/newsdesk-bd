# Agent Operating Memory Protocol — newsdesk-bd

Site project under: `~/storage/shared/"OpenCode Work"/projects/Website Development/`
(hub protocol at the parent `AGENTS.md` applies; this file adds site-specific rules.)

## 1. On session start (MANDATORY)
Load in order:
1. GLOBAL: `~/.config/opencode/memory/MEMORY.md` + `MEMORY.json` (USER PROFILE).
2. HUB: `../AGENTS.md` + `../memory/MEMORY.md`.
3. THIS PROJECT: `memory/MEMORY.md` → `memory/MEMORY.json` → newest `memory/sessions/` log.

Precedence: site project memory > hub > global user profile.

## 2. On session end / milestone (MANDATORY)
- Update `memory/MEMORY.md` + `memory/MEMORY.json` together (in sync).
- Append `memory/sessions/YYYY-MM-DD--<topic>.md`.

## 3. Site-specific rules (hard constraints)
- **Original synthesis + attribution only.** Never publish repackaged full article text.
  Every published story cites its sources (`সূত্র: ...`) and links originals.
- **Draft-first — SUPERSEDED by user decision 2026-09-19.** Was: "pipeline output lands in
  `site/src/content/news/` as Markdown with `draft: true`; nothing goes live without a human
  flipping `draft: false`." **NOW: auto-publish (draft:false) is the default** for all verified
  pipeline stories — user explicitly confirmed ("publish it automatically"). `synth`/`finalizeStory`
  write `draft: false`. (Revert to draft-first only if user asks; keep source of the old rule in
  git history/memory.)
- **No fabricated facts.** Every factual claim in an article must trace to a source line
  captured in the story's `sources` front matter. If a fact is uncertain, say so or drop it.
- **Provider-swap AI.** `ai.provider` in `pipeline/config.yaml` switches the LLM backend
  (local = HuggingFace/llama.cpp, gemini = Google free tier). Never hardcode a model call.
- **Zero budget.** Vercel free hobby tier, free RSS feeds, open-source packages.
- **30-min cadence** (when automated). Manual runs via opencode acceptable while testing.
- **Be nice to sources:** cache feed fetches, don't hammer; one fetch per source per 30 min max.

## 4. Build phases (current in Project memory)
Phase 1 Fetch → 2 Normalize → 3 Cluster → 4 Extract+Synth → 5 Astro site → 6 Review/deploy → 7 Expand.

## 5. LOCAL_DECISION_ROUTER — advisory, local, deterministic (added 2026-09-25)

**This is a local deterministic decision framework inspired by Jev-style typed routing.
It is NOT the TypeSafe Jev model.** It makes no network call, needs no API key, uses no
external AI, and produces no probability. Full detail: `docs/DECISION-ROUTER.md`.

**When to consider it.** Before substantial research, repeated failed attempts, materially
different implementation routes, risky actions, or expensive multi-step work — consider
whether one small bounded decision could improve the next step.

**When to skip it.** Simple deterministic tasks, routine file edits, and any situation where
the decision adds no information. Skipping is the expected default, not a failure.

**How.**

```bash
cd pipeline
node tools/decision_router.mjs --list                     # decision types + actions
node tools/decision_router.mjs --rules                    # every rule, id + priority + action
node tools/decision_router.mjs FAILURE_ROUTING --state='{"attempts":3,"sameError":true}'
node tools/decision_router.mjs RESEARCH_DEPTH --state-file=/tmp/state.json --json
```

Decision types: `AGENT_ROUTE`, `FAILURE_ROUTING`, `RESEARCH_DEPTH`, `ARTICLE_MODE`,
`ARTICLE_READINESS`. Actions: `SKIP`, `CONTINUE`, `RESEARCH_MORE`, `CHANGE_STRATEGY`,
`RETRY`, `VERIFY`, `HUMAN_REVIEW`, `SPLIT_TASK`, `INVESTIGATE_ROOT_CAUSE`,
`ROUTE_DECISION`, `STOP_RESEARCH`.

**Treat its result as ONE input to your reasoning, not absolute authority.**

**Hard rules.**
- Never use it to determine factual truth. Sources and evidence decide claims. The router
  can only choose which verification or research action happens next.
- Never bypass an explicit project requirement or a human decision. This file and the user
  always win over any router action.
- Keep destructive or irreversible actions behind human confirmation, regardless of what the
  router returns. `HUMAN_REVIEW` means stop and ask.
- It is advisory only (shadow mode): `wouldChangeWorkflow` is always `false`. Never claim a
  router decision changed your behaviour without saying so explicitly.
- **Never wire it into a GitHub Actions workflow, the Vercel deploy path, or any pipeline
  stage.** It is a local developer tool. If a change would make it reachable from CI or
  production, stop and ask first.
- Do not commit secrets. State is redacted on the way in, and `SEC_001` routes any state
  containing credential material to `HUMAN_REVIEW`.
- Report honestly when it is skipped, disabled, or unavailable. Never present a local rule
  decision as an AI or model judgement.

**Invocation is not guaranteed.** The router is a CLI the agent chooses to run; there is no
automatic hook. If you are not sure whether a decision was worth consulting, say so plainly
rather than claiming it was consulted.
