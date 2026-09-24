# Session — D81: excerpt markdown leak fixed (newsdesk-bd)

> Date: 2026-09-24

## What happened
- User asked to check the live site's news section and whether it follows our writing standard.
- Live audit (jachaidesk.com): homepage ✓ leading story + category feeds (national/politics/
  economy/international …), each card with badge, timestamp and excerpt; article pages render
  মূল খবর + কী এখনো জানা যায়নি + the **এক নজরে** box (from keyPoints front matter).
- **Found one real defect**: homepage cards for auto-authored stories (national-485/486/488)
  showed the raw markdown fragment `**এক নজ…` inside the excerpt.
- Root cause (pipeline/lib/synth.mjs `finalizeStory`): `excerpt = extractExcerpt(body)` ran on the
  RAW body BEFORE `extractKeyPoints()` moved the "এক নজরে" bullet block into keyPoints front matter.
  When the writer placed that block early in the body, the `**এক নজরে**` marker got included in the
  180-char excerpt slice → leaked into `excerpt`/`seoDescription` and onto the live page.
- Fix: added `prepBody(md)` → `{ keyPoints, remaining, excerpt }` — strips keyPoints FIRST, then
  derives excerpt from the CLEANED remaining body; `extractExcerpt` also strips `**` markers and
  skips markdown heading lines. `finalizeStory` now calls `prepBody` once. One regression test added
  (`prepBody: excerpt stripped of এক নজরে block and markdown markers`) → suite 183→184.
- Also audited the writing prompt (user asked for it earlier): the full final prompt is rendered per
  brief by `writingPrompt()` (see pipeline/lib/synth.mjs — modes, formats, claim rules, hard
  constraints, fact pool, sources). Noted a cosmetic `- -` double-dash on the why-block line
  (harmless; not changed).
- Verified: the earlier "outlet names in body" flags were FALSE POSITIVES — they came from JSON-LD
  structured data and the legitimate "ছবি: প্রথম আলো" photo credit, not the visible body text.

## Verification
- `node --test test/synth.test.mjs` → 12/12; full `node --test test/*.test.mjs` → **184/184**.
- Restored `pipeline/state/store.db` after the test run (git checkout HEAD --).
- Note: this session overlapped a background auto-author worker session (D80 — auto-author
  bash-quote fix, its own session log 2026-09-24-d80-auto-author-fix.md, commits 1d7e265+).
  Decision id D81 was next-free for this work.

## Commits
- `d2f6c28` fix(synth): strip এক নজরে keyPoints before building excerpt (no markdown leak) + test.
- memory updates: MEMORY.md (D81 row + header), MEMORY.json (D81 decision + workInProgress), this log.

## Next
- Alternative: purge the already-leaked excerpts from live front-matter (national-485/486/488 …) by
  re-running finalize on those briefs so homepage cards show clean excerpts — automatic when the
  pipeline re-finalizes, or a manual re-write. Not blocking.