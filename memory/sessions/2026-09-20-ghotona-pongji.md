# Session — ঘটনাপঞ্জি (Ghotona-Pongji / Event Flow) F1–F7

> Date: 2026-09-20
> Status: F1–F7 built + committed + pushed (main 18c6604); tests 19/19

## Summary
User idea "ঘটনা প্রবাহ": big-event hubs that collect ALL our coverage (current + historical).
Deep search 10–15 yr → master list → sort → hubs. Named **ঘটনাপঞ্জি (Ghotona-Pongji)**,
internal code key `ghotona-pongji`. User reads Bengali poorly in Termux → reply English/Avro,
keep Bengali raw in site content only.

## Constraints locked
- **No fabrication.** We cannot fetch/republish 10–15-yr-old news (RSS recent-only + copyright).
  Old events → OUR OWN original sourced overview articles; ongoing events → existing pipeline+watcher.
- Key answer to user: hubs are anchors (Tier-1 overview) + auto-adsorbed fresh coverage.

## Work done
- **F1** — `site/src/data/events.json`: 82 clean major BD events (2007–2026), fields
  id/name/nameBn/category/year/keywords/priority/status; cleaned from 86 (regex-removed junk rows);
  12 with `anniversary` (MM-DD). Commits `0eb1919`→pushed `cc4e7c0`.
- **F2** — `site/src/lib/events.js`: `matchesEvent` keyword-specificity matcher (title hit ×3,
  excerpt ×1, longer-specific-keyword bonus, `GENERIC_WORDS` stoplist 52 words, score ≥4);
  `eventsForPost`/`postsForEvent`/`eventCounts`; `with { type: "json" }` import. Tested 26/69.
- **F3** — `site/src/pages/ghotona/index.astro` + `[slug].astro` (count + cards + per-event timeline
  + anchor box + JSON-LD WebPage + sitemap entries); article `[slug].astro` gains `.event-flow-box`
  matched-events chips; `MORE_NAVIGATION` `/ঘটনাপঞ্জি`; `EVENT_CATEGORY_LABELS` Bengali categories.
  Committed `a4f70a0`.
- **F4** — `pipeline/tools/event_scheduler.mjs`: `workScore` = priority(high40/med20/low5) +
  statusActive30 + covered15 + anniversary≤14d20 + demandScore(log view); `daysUntilAnniversary`
  wraps to next year; `--json`; `isDirectRun` via `fileURLToPath`. Verified: dengue/nct top 70,
  Tazreen ann 65d ahead.
- **F5+F6** — `pipeline/tools/history_author.mjs`: Tier-1 anchor author from curated `DESCRIPTIONS`
  map (sagor-runi, rana-plaza, holly-artisan, june-july-2024-quota, oust-hasina-2024, dengue, nct);
  refuses uncurated events (no fabrication); writes `history-<id>.md` `draft:true`, `--publish` flips;
  `--list` for workflows; imports events.json lazily. `sagor-runi-murder` DRAFT written.
- **F7** — `.github/workflows/history-author.yml` weekly Mon 03:00 UTC: plan job (scheduler →
  `pipeline/state/history-plan.json` + commit) then author job (`--list` loop drafts) + commit/push.
  `deploy.yml` workflow_run list += `history-author`.

## Verification
- `node --check` both tools OK; `pipeline/test/scheduler.test.mjs` added (6 cases);
  `npm test` **19/19**.
- Commits: F2+F3 `a4f70a0`; this session F4–F7 + draft + tests + deploy wiring → `18c6604` (pushed).

## Files changed (this session)
- `.github/workflows/history-author.yml` (new), `.github/workflows/deploy.yml` (+history-author)
- `pipeline/tools/event_scheduler.mjs`, `pipeline/tools/history_author.mjs` (new)
- `pipeline/test/scheduler.test.mjs` (new)
- `site/src/content/news/history-sagor-runi-murder.md` (DRAFT anchor, draft:true)
- `site/src/data/events.json` (12 anniversary fields)
- `memory/MEMORY.md`, `memory/MEMORY.json` (D39, sessionsCount 11/14, WIP + nextSteps)

## Next steps
1. Verify `/ghotona` + event pages live after deploy.
2. Review `history-sagor-runi-murder` draft; consider `--publish` after fact-check.
3. Author more Tier-1 anchors via `history_author.mjs` (e.g. rana-plaza before 2027-04-24
   anniversary, holly-artisan 2027-07-01).
4. Consider a `/ghotona` nav/footer link.