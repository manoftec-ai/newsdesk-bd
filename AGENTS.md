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

## 5. Jev decision router — SHADOW MODE ONLY (added 2026-09-25)

Jev (TypeSafe AI System One) is an **advisory decision layer for the agent**. It never
writes articles, never touches facts, and never gates the pipeline. It may help you pick
the next step before expensive or repetitive work. Full detail: `docs/JEV-INTEGRATION.md`.

**When to consider it.** Before substantial research, repeated failed attempts, loading
multiple tools/skills, choosing between materially different implementation routes,
spawning additional agents, or proposing a consequential action — ask whether one small
bounded Jev decision could improve the next step. If yes, run it and use the result as
**one input** alongside your own reasoning.

**When to skip it.** Simple answers, deterministic operations, routine file edits, and
any situation where the decision adds no information. Skipping is the expected default.

**How.** `node pipeline/tools/jev_decide.mjs --list` then
`node pipeline/tools/jev_decide.mjs <DECISION_TYPE> --task=<id> --state-file=<path> --json`.
Decision types: `AGENT_ROUTE`, `FAILURE_ROUTING`, `RESEARCH_DEPTH`, `ARTICLE_MODE`,
`ARTICLE_READINESS`. A no-key environment is normal — the CLI then reports
`not_configured` and you simply continue. Never treat that as an error.

**Hard rules.**
- A Jev decision is **never** a substitute for factual verification. Sources and evidence
  decide what is true; Jev only suggests which verification path to take.
- A Jev decision **never** overrides an explicit project requirement, a hard constraint
  in this file, or a human confirmation. This file and the user always win.
- Respect an explicit "bypass Jev" instruction, and pass `--bypass` when the user says so.
- Keep irreversible or production-impacting actions behind confirmation, regardless of any
  Jev route.
- **Never add a Jev step to a GitHub Actions workflow, the Vercel deploy path, or any
  pipeline stage.** Shadow mode is a local developer tool only. If a change would make Jev
  reachable from CI or production, stop and ask first.
- Do not commit keys. `TYPESAFE_API_KEY` / `TYPESAFE_API_KEY_FILE` stay in
  `~/.config/opencode/.secrets/`, never in this repo.

**Report honestly.** If Jev was skipped, unavailable, or the key is missing, say so.
Never present an offline run, a mock, or a local heuristic as a real Jev API decision.