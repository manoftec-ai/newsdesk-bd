# Exact-pick authoring: national-543 (2026-09-25)

## Request
- Read `pipeline/state/pick.json` and author exactly its picked slugs via `render_prompt` + `finalize`.

## Work completed
- Read the current pick and froze exactly `national-543` (`pending: 1`).
- Rendered the canonical prompt with `node tools/render_prompt.mjs national-543 --out=/tmp/opencode/national-543.prompt.txt`.
- Authored only `pipeline/tmp/stories/national-543.b.md` from the thin verified fact pool.
- Kept the single-source assessment explicitly attributed and added no date, location, name, motive, reaction, or other unsupported detail.
- Ran `node tools/finalize_stories.mjs --site=../site/src/content/news --max=1`.
- The first run reported `wrote=1 skipped=0 failed=0 blocked=0`, but its generated SEO description cut mid-word. Shortened the same body at a sentence boundary, removed only the generated article, and reran the same finalizer.
- Final result: `wrote=1 skipped=0 failed=0 blocked=0`; created `site/src/content/news/national-543.md` with `draft: false` and two source links.

## Verification
- Final `pick.json` still listed exactly `national-543`.
- Target validation passed: frontmatter parsed, title matched the brief, source names and URLs matched, the body had no raw URL, outlet name, source meta-language, or editorial violation, and both single-source key points retained attribution.
- Excerpt and SEO description are identical and complete.
- `node --test test/synth.test.mjs`: 12/12 passed.
- `git diff --check` and `node --check` for the render/finalize/synth scripts passed.
- No lint or typecheck scripts are defined.
- Pre-existing `pipeline/state/pick.json` and `pipeline/state/store.db` modifications were preserved.
- No commit or push performed; no unpicked slug was authored or finalized.
