# Exact-pick authoring: national-551 (2026-09-25)

## Request
- Read `pipeline/state/pick.json` and author exactly its picked slugs via `render_prompt` + `finalize`.

## Work completed
- Read the current pick and froze exactly `national-551` (`pending: 1`).
- Rendered the canonical thin-news prompt with `node tools/render_prompt.mjs national-551 --out=/tmp/opencode/national-551.prompt.txt`.
- Authored only `pipeline/tmp/stories/national-551.b.md` from the verified headline-level fact pool.
- Ran `node tools/finalize_stories.mjs --site=../site/src/content/news --max=1`: wrote=1, skipped=0, failed=0, blocked=0.
- The first generated excerpt and SEO description cut mid-word. Shortened only the same body to its two verified sentences, removed only the generated `national-551` article, and reran the same finalizer with the same result.

## Verification
- Final `pick.json` still listed exactly `national-551`; staging contained only `national-551.b.md`.
- Target validation passed: title, category, date, both sources, `draft:false`, and body matched the brief/staging input; no raw URL, outlet name, source-list block, key-point block, or editorial footer appeared in the body.
- Excerpt and SEO description were complete 94-character boundaries ending in `।`; SEO title was within 72 characters.
- `node --test test/synth.test.mjs`: 12/12 passed.
- Full `npm test`: 212/214 passed; the two failures are the known unrelated `targetWords` export mismatch and old length-tier expectation.
- `node --check` passed for render, finalize, and synth scripts; `git diff --check` passed.
- No lint or typecheck scripts are defined. Site dependencies are absent, so the Astro build was unavailable.
- Jev was skipped because the user prescribed the exact render/finalize route.
- Pre-existing modifications to `pipeline/state/pick.json` and `pipeline/state/store.db` were preserved.
- No commit or push was performed; no unpicked slug was authored or finalized.
