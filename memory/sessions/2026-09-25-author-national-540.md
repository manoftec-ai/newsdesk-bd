# Exact-pick authoring: national-540 (2026-09-25)

## Request
- Read `pipeline/state/pick.json` and author exactly its picked slugs via `render_prompt` + `finalize`.

## Work completed
- Read the current pick and froze exactly `national-540` (`pending: 1`).
- Rendered the canonical prompt with `node tools/render_prompt.mjs national-540 --out=/tmp/opencode/national-540.prompt.txt`.
- Authored only `pipeline/tmp/stories/national-540.b.md` from the sparse verified fact pool.
- Kept the report to the arrest allegation and stated that names, timing, location, case details, and outcome were not available.
- Ran `node tools/finalize_stories.mjs --site=../site/src/content/news --max=1`.
- The first result was `wrote=1 skipped=0 failed=0 blocked=0`, but its generated excerpt cut a Bengali word mid-character.
- Shortened the same body at a sentence boundary and regenerated this same slug through the finalizer; the second result was also `wrote=1 skipped=0 failed=0 blocked=0`.
- Created the final `site/src/content/news/national-540.md` with `draft: false`, two source links, and complete excerpt/SEO-description boundaries.

## Verification
- Final `pick.json` still listed exactly `national-540`.
- Target validation passed: front matter parsed, article was published, both sources were retained, and the body had no raw URL, source list, or editorial footer.
- `node --test test/synth.test.mjs`: 12/12 passed.
- `node --check` passed for `render_prompt.mjs`, `finalize_stories.mjs`, and `synth.mjs`.
- No lint or typecheck scripts are defined. Site build was not run because Astro dependencies are not installed in this checkout.
- Pre-existing `pipeline/state/pick.json`, `pipeline/state/store.db`, and `pipeline/state/briefs/national-540.json` changes were preserved.
- No commit or push performed; no unpicked slug was authored or finalized.
