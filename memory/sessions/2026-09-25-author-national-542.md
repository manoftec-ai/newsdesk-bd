# Exact-pick authoring: national-542 (2026-09-25)

## Request
- Read `pipeline/state/pick.json` and author exactly its picked slugs via `render_prompt` + `finalize`.

## Work completed
- Read the current pick and froze exactly `national-542` (`pending: 1`).
- Rendered the canonical prompt with `node tools/render_prompt.mjs national-542 --out=/tmp/opencode/national-542.prompt.txt`.
- Authored only `pipeline/tmp/stories/national-542.b.md` from the thin verified fact pool.
- Kept the article short, attributed the single-source claim, and did not add dates, locations, names, motives, or investigative details absent from the prompt.
- Ran `node tools/finalize_stories.mjs --site=../site/src/content/news --max=1`.
- Result: `wrote=1 skipped=0 failed=0 blocked=0`.
- Created `site/src/content/news/national-542.md` with `draft: false` and two source links.

## Verification
- Final `pick.json` still listed exactly `national-542`.
- Target validation passed: frontmatter parsed, title matched the brief, source count was two, body had no raw URL or in-body source list, and editorial violations were zero.
- `node --test test/synth.test.mjs`: 12/12 passed.
- `node --check` passed for `render_prompt.mjs`, `finalize_stories.mjs`, and `synth.mjs`.
- Full pipeline suite retained two known unrelated baseline failures; no lint/typecheck scripts are defined; the local Astro build is unavailable because dependencies are not installed.
- Pre-existing `pipeline/state/pick.json`, `pipeline/state/store.db`, and `pipeline/state/briefs/national-542.json` changes were preserved.
- No commit or push performed; no unpicked slug was authored or finalized.
