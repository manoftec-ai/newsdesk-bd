# 2026-09-21 — schema drift: everest faq {q,a} fix + guarded renderer

## Context
D44 history batch published mount-everest-1953 with faq items shaped `{question, answer}`,
but the site's Astro news collection schema (`site/src/content.config.js`) requires `{q, a}`.

## Effect
Astro deploy failed on `history-mount-everest-1953` ("data does not match collection
schema") → article 404 on live site while rwanda (correct {q,a}) stayed up. Root cause
was NOT the content — it was a schema-shape contract drift in how the batch gate rendered
frontmatter.

## Fix
1. Repacked everest `faq` items to `{q, a}` (matches site schema, verified against live rwanda).
2. Added a **guard in gate_history_batch.mjs**: `renderArticle` now round-trips and the gate
   enforces the EXACT Astro content-schema shape for faq/q+a, keyPoints, sources, verification —
   so any future batch that drifts from the site schema fails the gate instead of breaking deploy.
3. Committed + pushed; Vercel deploy green; everest URL returns 200 (was 404).

## Verification
- `curl -o /dev/null -w %{http_code}` on everest article: **200** (was 404)
- rwanda control: 200 (unchanged, live)
- Sitemap lists everest under /article/history-mount-everest-1953/
