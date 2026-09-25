# Author national-529 via exact pick (2026-09-25)

## Request
- Read `pipeline/state/pick.json` and author exactly its picked slugs via `render_prompt` + `finalize`.

## Work completed
- Current pick contained exactly one slug: `national-529` (`2026-09-25T04:12:36.000Z`, `editorialValue: 20`, `pending: 1`).
- Rendered the canonical prompt with `node tools/render_prompt.mjs national-529 --out=/tmp/national-529.prompt.txt`.
- Authored only `pipeline/tmp/stories/national-529.b.md`, using the verified Yanbu-port military-assistance detail and explicit unknowns.
- Kept the oil-installation detail attributed as SINGLE_SOURCE; did not invent timing, quantities, location details, reactions, or outcomes.
- Ran `node tools/finalize_stories.mjs --site=../site/src/content/news --max=1`.
- Result: `wrote=1 skipped=0 failed=0 blocked=0`.
- Created `site/src/content/news/national-529.md` with `draft:false`.

## Verification
- Target-only validation passed: picked slug is exactly `national-529`, YAML front matter parses, three sources are present, the body has no raw URL, and `findEditorialViolations` returned zero findings.
- `node --test test/synth.test.mjs`: 12/12 passed.
- Full `npm test`: 167 passed, 4 unrelated baseline failures (stale 12-point auditor expectation, missing `targetWords` export, and length-tier mismatch).
- `node --check` passed for `render_prompt.mjs`, `finalize_stories.mjs`, and `synth.mjs`.
- Site `npm run build` could not start because `astro` is not installed in this checkout.

## Worktree
- Pre-existing `pipeline/state/pick.json`, `pipeline/state/store.db`, and the brief `national-529.json` were preserved.
- No commit or push performed.
- No unpicked slug was authored or finalized.
