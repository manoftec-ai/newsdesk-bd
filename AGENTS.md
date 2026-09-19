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