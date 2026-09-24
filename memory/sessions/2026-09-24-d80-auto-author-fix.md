# Session — D80: auto-author GitHub authoring fixed + proven green (2026-09-24)

## Context
User (after D75 #19/#32 shipped): "now what? do you write/edit the existing news? ... please push github to write a new news. i want to see how we are going with new setup." Then: "yes trigger one" (manual dispatch).

## What happened
1. Dispatched auto-author workflow (workflow_dispatch, run 35988169472).
2. Run FAILED at step "Author unpublished briefs": opencode authored all picked stories, all gate-clean, but the very end died:
   `line 66: said: command not found` exit 127.
3. Root cause: in `auto-author.yml` the author step passes the ENTIRE prompt as ONE bash double-quoted string to
   `opencode run --model "..." "You are the newsdesk-bd story author.\n......"`. The prompt text contained an
   UNESCAPED inner double-quote: `NEVER compare "one report said X, another said Y"`. Bash closed the string at that
   quote → prompt truncated → and treated `said` as a shell command → exit 127.
   (Same failure class as D53/D50: an inline prompt inside a YAML `run:` block breaking things silently.)
4. Fix: changed inner double-quotes to single quotes in that prompt block. Re-validated: YAML parses, run-block
   double-quote count balanced. Commit `f04d0a4` → rebased → pushed `1d7e265`.
5. Re-dispatched (run 35990305518) → **SUCCESS**:
   - pick: national-480, sports-481, national-483, national-482, national-455
   - opencode authored all 5 (news-brief + standard modes, gate-clean)
   - finalize + commit `7e64dab` "auto-author: publish drafted stories (20260924T1129)" (8 files, 5 new .md)
   - tolerant merge + push `bb28a3b`
6. Origin kept producing green runs after: c9a9436 (12:08), 45a309f (12:40), e589cc9 (13:23), 295f332 (13:47), ...
   → **469 stories on origin/main**.
7. Spot-checked `national-480.md` (e589cc9): correct frontmatter (title/thumbnail/thumbnailAlt/seoTitle/excerpt/
   seoDescription/date/category/tags/author/lang/draft:false/keyPoints/faq/sources/verification), Bengali body, clean.

## Nuance flagged (open next-step)
- The auto-author "Author unpublished briefs" step uses its OWN static bash-quoted prompt (news-only voice), NOT
  `synth.writingPrompt()`. So D75 FACT-CHECK/ANALYSIS format templates ship in the local/pipeline writer but are NOT
  automatically used when GitHub authors a factcheck or analysis brief. The gate machinery (claimRules N3, disclosure,
  quote gates, finalize factCheck front-matter) still applies. Options: (a) a node step emitting writingPrompt(brief)
  per picked brief; (b) mirror the templates into the runner prompt. Recorded in Next Steps.

## Local work (left untouched)
- `pipeline/lib/extract.mjs`, `pipeline/lib/synth.mjs`, `pipeline/test/synth.test.mjs` have a parallel worker's
  in-flight edits (excerpt strips `**`/keyPoints-related). NOT staged/committed — worker owns them.

## Files changed by me (committed via rebase, pushed)
- `.github/workflows/auto-author.yml` (inline prompt inner quotes single-quoted)
- memory/MEMORY.md (D80 row + header sessions 41 + WIP + next-step)
- memory/MEMORY.json (D80, sessions 52→53, wip, nextSteps+1)
- this session log

## Verify / next
- New stories live at jachaidesk.com (auto-deploy on push) — confirm on site.
- Drop/inspect worker stash if any. Keep repo synced with the constantly-running GH workers (rebase-on-push).