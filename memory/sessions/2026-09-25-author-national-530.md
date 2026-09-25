# Author national-530 via exact pick (2026-09-25)

## Request
- Read `pipeline/state/pick.json` and author exactly its picked slugs via `render_prompt` + `finalize`.

## Work completed
- Current pick contained exactly one slug: `national-530` (`2026-09-24T12:35:31.000Z`, `editorialValue: 20`, `pending: 1`).
- Rendered the canonical prompt with `node tools/render_prompt.mjs national-530 --out=/tmp/opencode/national-530.prompt.txt`.
- Authored only `pipeline/tmp/stories/national-530.b.md` from the verified fact pool.
- Kept the throat-pinching and refused-mobile-sale details explicitly attributed as SINGLE_SOURCE claims; did not present either as independently established.
- Did not invent names, dates, locations, motives, case details, reactions, or outcomes.
- Ran `node tools/finalize_stories.mjs --site=../site/src/content/news --max=1`.
- Result: `wrote=1 skipped=0 failed=0 blocked=0`.
- Created `site/src/content/news/national-530.md` with `draft:false`.

## Verification
- Target-only validation passed: picked slug is exactly `national-530`, YAML front matter parses, three sources are present, the body has no raw URL, and `findEditorialViolations` returned zero findings.
- `node --test test/synth.test.mjs`: 12/12 passed.
- Full `npm test`: 167 passed, 4 unrelated baseline failures (stale 12-point auditor expectations, missing `targetWords` export, and length-tier mismatch).
- `node --check` passed for `render_prompt.mjs`, `finalize_stories.mjs`, and `synth.mjs`.
- Site `npm run build` could not start because `astro` is not installed in this checkout.

## Worktree
- Pre-existing `pipeline/state/pick.json`, `pipeline/state/store.db`, and the brief `national-530.json` were preserved.
- No commit or push performed.
- No unpicked slug was authored or finalized.
