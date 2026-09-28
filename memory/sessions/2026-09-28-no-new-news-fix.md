# 2026-09-28 — No-new-news root-cause fix (read-only diagnosis → fix)

User: "there is no new news in my site jachaidesk. find the root cause" → then "ok..fix".
Diagnosis phase was strictly read-only; fix phase committed + pushed per §5.6.

## Diagnosis (verified, not guessed)
Live homepage top was 27 Sept; local newest article `date:` also 27 Sept, despite
pipeline/auto-author runs all day 28 Sept. Three stacked causes:
1. **Brief pool starved**: `pick.json` pending 0. 140 `open` briefs all body-empty;
   72 carried Google News wrapper URLs. Evidence gate (<100 words) skipped them,
   every run stayed green.
2. **Extractor gap (8 sources)**: `extractArticleBody` (container reader) returned
   nothing usable on bd24live (39/newest-300), ittefaq, dhakatribune, samakal,
   jugantor, deshrupantor, jamuna, kalerkantho → headline-only items.
3. **Deploy frozen**: last deploy 15:50 UTC; auto-author published national-649
   18:35 UTC → 404. Two reasons: GitHub dropped the deploy cron ticks, AND every
   heartbeat pump run died in cycle 1 (see below) so no dispatch happened.
   (aa5a4ab9 push-trigger can't fire for GITHUB_TOKEN bot pushes per D38.)

## This session's changes (mine, committed e063427f, merged b83ac714, pushed)
- `pipeline/lib/normalize.mjs`: new `decodeEntities` (named+decimal/hex,
  single-pass so `&amp;lt;` stays literal); `cleanBody` decodes BEFORE
  tag-stripping. Fixes `&lt;p&gt;` leads reaching briefs (national-251).
- `pipeline/tools/resolve_sources.mjs`: both `extractArticle` write points
  (retext + wrapper-resolve) now go through `cleanBody` (enrich_bodies already did).
- `pipeline/test/normalize.test.mjs`: 7 new tests. Full suite 381/381 pass.

## Heartbeat killer (independent double-find)
Pump log (run 36447611122): `line 76: : command not found`, exit 127, no handoff →
chain dead since 15:58 UTC. Cause: `AFTER_MAIN=$(... || "")` executes the empty
string when rev-parse fails (pump job has no checkout). Reproduced locally
(127 + identical message); fix `|| echo ""`; pump script passes `bash -n`.
The parallel session fixed the identical line in 313d09d9 (plus shipped the
fetch-fallback: 5/8 sources recovered, pending 0→16, published
national-314/318/361/416). My edit became redundant; nothing lost.
Deliberately did NOT change homepage sort (source-date order is correct for news;
the "published-today looks old" effect was one-off backfill).

## mine vs parallel session (shared box, live writer on main worktree)
- Reverted ~61 stale-brief churn files once; writer rewrote some. Left all
  brief/state files alone afterwards — CI + parallel session own them.
- Never touched article-text.mjs / fetch.mjs (parallel session's 313d09d9).
- Direct `git pull` impossible (stash race: "unstable object source data");
  pushed via detached worktree merge. Worktree removed afterwards.
- Known open quality item (NOT fixed, needs owner): dainikbangla `news_item`
  related-widget digest tails can enter scorer runs (national-110 DNCC block,
  unpublished brief only). The `proseProblem` furniture classifier doesn't see
  them; `collectParagraphs` drops the non-<p> boundary.

## Chain restart
heartbeat.yml fix live on origin → dispatched heartbeat manually (204,
run 36468711447 in_progress 18:56 UTC). Next: confirm deploy run appears and
national-649 + 314/318/361/416 return 200 on jachaidesk.com.
