# 2026-09-23 — Iran–Israel war chronicle (ঘটনাপঞ্জি) + precise event matching

User asked: "iran war is a major news but we don't have ponji on that — should we cover broadly?" → agreed; implemented chronicle + living tracked story.

## What was done
- **events.json**: new event `iran-israel-war-2026` (nameBn ইরান-ইসরায়েল যুদ্ধ, category international, status active, priority high, years [2026], excludeCategories [history], strongKeywords [ইরান, ইসরায়েল]).
- **events.js**: added THREE backward-compatible hard gates any event can set (other events unaffected — validated rohingya 8 / bdr 2 / tazreen 4 matches unchanged):
  - `strongKeywords` — topic-defining words; an article MUST mention ≥1 to link, and they score at full weight (fixes short-word e.g. ইরান being "generic" 0.1).
  - `years` — restrict chronicle links to allowed years (number-safe `Number(year)` compare).
  - `excludeCategories` — e.g. exclude `history` retrospectives from a current-crisis chronicle.
- **tracked-stories.json**: tracked living story for the war anchored at `national-436` (watcher appends future developments to that article; ট্র্যাক করা box shows now via frontmatter `tracked: true`).
- **article/[slug].astro** + **ghotona/[slug].astro**: pass `year` (and category already passed) into matching so the gates work on both pages.

## Verification (simulated chronicle matching over all 425 non-draft articles)
- Matched exactly: national-239, national-403, national-177, national-408, national-436 (the 5 real war articles).
- Excluded false positives: international-178 (Moscow/Ukraine drone — no Iran/Israel), national-393 (Surat India fire — প্রতিশোধ generic), history-iran-hostage-crisis-1979 (1979 retrospective — years gate).
- `international-96` (Iran FM on Mideast security) intentionally NOT matched — diplomacy, not the war (precision choice).

## Outcome
New page `/ghotona/iran-israel-war-2026` auto-lists the war articles + the chronicle box now appears on each. Future pipeline articles about the war link in automatically. Commits: `5750c50`, merged/pushed (`b6c3367`), Vercel redeploy auto.