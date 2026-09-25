# Author national-534 via exact pick (2026-09-25)

## Request
- Read `pipeline/state/pick.json` and author exactly its picked slugs via `render_prompt` + `finalize`.

## Work completed
- Read the current pick: exactly `national-534` (`2026-09-25T07:26:18.000Z`, `editorialValue: 15`, `pending: 1`).
- Re-read the pick before finalization and at completion; it remained the same single slug.
- Rendered the canonical prompt with `node tools/render_prompt.mjs national-534 --out=/tmp/opencode/national-534.prompt.txt`.
- Authored only `pipeline/tmp/stories/national-534.b.md` from the thin verified fact pool. The SINGLE_SOURCE wording remained explicitly attributed; no names, date or location details, speech detail, troop number, reaction, motive, or outcome was invented.
- Ran `node tools/finalize_stories.mjs --site=../site/src/content/news --max=1`.
- Result: `wrote=1 skipped=0 failed=0 blocked=0`.
- Created `site/src/content/news/national-534.md` with `draft:false`.

## Verification
- Target-only validation passed: exact title, valid YAML front matter, national category, two sources, no raw URL in the body, and zero editorial-gate violations.
- `node --test test/synth.test.mjs`: 12/12 passed.
- Full `npm test`: 167 passed, 4 unrelated baseline failures (stale auditor checklist expectations, missing `targetWords` export, and a length-tier mismatch).
- `node --check` passed for `render_prompt.mjs`, `finalize_stories.mjs`, and `synth.mjs`.
- The `store.db` backup/restore hash matched exactly after the full test run; pre-existing `pipeline/state/pick.json`, `pipeline/state/store.db`, and `pipeline/state/briefs/national-520.json` changes were preserved.
- Site `npm run build` could not start because `astro` is not installed; no lint or typecheck scripts are defined in the project package files.
- No commit or push performed. No unpicked slug was authored or finalized.
