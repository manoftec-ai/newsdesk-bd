# Author batch 2026-09-23-national-400

## Task
- Read `pipeline/state/pick.json` → picked: `national-400` (open, tier A, confirmed, score 4, date 2026-09-23T02:41:39Z; pending=1).
- Authored Bengali article body → `pipeline/tmp/stories/national-400.b.md` → ran `node pipeline/tools/finalize_stories.mjs --site=site/src/content/news --max=6`.
- No git commit/push (per task).

## Story: national-400 — প্রধানমন্ত্রী ↔ তুরস্কের প্রেসিডেন্ট এরদোয়ান বৈঠক
- Headline (brief): "তুরস্কের প্রেসিডেন্টের সঙ্গে প্রধানমন্ত্রীর বৈঠক, সম্পর্ক আরও জোরদারের প্রত্যয়".
- Facts pinned to brief + store.db raw_items (120880 prothomalo, 124516 jugantor — both title/lead-level only, no fuller bodies):
  - prothomalo: প্রধানমন্ত্রীর সঙ্গে তুরস্কের প্রেসিডেন্টের বৈঠক; relationship-boost commitment; lead = আঞ্চলিক-আন্তর্জাতিক অঙ্গন + পারস্পরিক স্বার্থসংশ্লিষ্ট ইস্যুতে ঘনিষ্ঠ সহযোগিতা ও সমন্বয় অব্যাহত রাখা।
  - jugantor: এরদোয়ানের সঙ্গে তারেক রহমানের বৈঠক (names the PM; consistent merge → প্রধানমন্ত্রী তারেক রহমান).
- Conservative: no venue/time/agenda claimed (none in brief); official-statement-pending caveat. No fabrication; verification closing + সূত্র list present; no D25 footer.
- Body: ২৬৭ words incl bullets+sources (excl sources ২৫৭) — within ২৫৫–২৯০. Bengali text only, no Latin digits in prose.
- **keyPoints extraction caveat**: first write used `**এক নজরে:**` (bold + colon) → `extractKeyPoints` regex matcher did NOT match (only handles `**এক নজরে**` or `এক নজরে:`), so keyPoints stayed `[]` and the block leaked into the body. Fixed to `**এক নজরে**` (bold, no colon), removed the stale `national-400.md`, re-ran finalize → 3 keyPoints extracted, block removed from body.
- finalize: wrote=1 skipped=0 failed=0 → `site/src/content/news/national-400.md` (draft:false, badge confirmed tier A score 4, tags []).

## Notes
- No commits (task rule). `pipeline/tmp/stories/` dir did not exist at run start — recreated via mkdir.