# Session 2026-09-23 — D52: Single source display per article

## Context
After D50 (name-only source links, deploy `04df1f7` GREEN), the live site still showed sources THREE times on every article:
1. In-body `সূত্র:` list (rendered name-only by the D50 hast plugin)
2. "প্রমাণ ও সূত্র" EvidenceList box (`post.verification.evidence`, `type — label`)
3. Frontmatter `সূত্র` block

User: "we have three section in a news where is showing the source. in main news, after a box, again after the box. i think there should be one source link. what do you think?"

## Decision
Multiple-choice question → user chose **"Only the সূত্র block (Recommended)"**: remove the EvidenceList box AND strip the in-body `সূত্র:` list at build. Keep only the clean frontmatter `সূত্র` block (name-only links).

## Changes (commit `9da7283`, deploy GREEN run 35881626419)
1. `site/src/pages/article/[slug].astro` — removed `EvidenceList` import (was line 5) + usage (was line 330). Frontmatter `সূত্র` block intact.
2. Deleted orphaned `site/src/components/EvidenceList.astro`.
3. NEW `site/src/lib/strip-body-source-lists.mjs` — Sätteri **mdast** plugin:
   - visitor = plain fn `list(node, ctx)` (mdast uses fn, NOT `{filter,visit}` like hast)
   - if previous sibling is a paragraph whose `textContent.trim()` matches `/^সূত্র:?$/u` → `ctx.removeNode(prev)` + `ctx.removeNode(node)`
   - strips ~283 in-body `সূত্র:` lists across all existing articles at build, ZERO content edits
4. `site/astro.config.mjs` — `satteri({ mdastPlugins:[stripBodySourceLists], hastPlugins:[nameOnlyLinks] })`
5. `pipeline/lib/synth.mjs` (line 131) — prompt now "Do NOT end with a 'সূত্র:' source list — source links are rendered automatically from front matter…"
6. `auto-author.yml` — independently caught up by parallel commit `d6d6359` (restored D50-broken YAML + dropped the manual সূত্র block instruction; my identical edit there became redundant, no duplicate commit needed)

## Validation
- Simulated mdast trees (5 cases): strips `সূত্র:`/`সূত্র`+list ✅; `এক নজরে` key-points list survives ✅; list-at-index-0 survives ✅; non-সূত্র paragraph+list survives ✅
- `node --check` all changed files; pipeline tests 26/26
- Live checks post-deploy: `national-426` → 0 EvidenceList, 0 in-body `সূত্র:`, single `সূত্র` block, name-only links, no visible raw URLs; `national-428` → `এক নজরে` key-points still render; `history-oust-hasina-2024` → `## সূত্র ও তথ্য যাচাই` narrative heading preserved

## Notes
- Can't run Sätteri locally on Termux (native binding `satteri_napi.android-arm64.node` missing) → validated via simulated trees + Vercel deploy + live curl
- History articles use `## সূত্র ও তথ্য যাচাই` heading (not a `সূত্র:` bullet list) → correctly NOT stripped
- Full deploy log lesson (carried from D50): Astro 7 = Sätteri processor; legacy rehypePlugins/remarkPlugins need `@astrojs/markdown-remark`; Sätteri deps must stay `@astrojs/markdown-satteri@^0.3.1` (mdx peer) + `satteri@^0.10.5`

## Memory updated
- `memory/MEMORY.md`: header + D52 decision row + WIP [x] entry
- `memory/MEMORY.json`: D52 decision added (59 decisions)
- This session log