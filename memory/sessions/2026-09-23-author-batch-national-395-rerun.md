# Author batch 2026-09-23-national-395-rerun (already published, D-Q15 skip)

## Task
- Read `pipeline/state/pick.json` → picked: `national-395` (open, tier A, score 4; pending=1).
- No git commit/push (per task rule; only `pipeline/state/store.db` dirty from prior pipeline fetch).

## Result
- `site/src/content/news/national-395.md` ALREADY EXISTS and is committed (auto-author + thumbnail brand runs 2026-09-23T0145/0149). This is the documented D-Q15 state (picker lists a slug already finalized by a concurrent auto-author path) — expected, not a bug.
- Authored a fresh body (265 tokens incl. bullets+sources) → `pipeline/tmp/stories/national-395.b.md` (Bengali numerals, verification closing, no editorial footer / D25).
- `finalize_stories.mjs --site=site/src/content/news --max=6` → **wrote=0 skipped=1 failed=0** (`national-395: already exists, skip`). Nothing written; no duplicate; preserved existing thumbnail field.

## Facts pinned (no fabrication)
- এএফপি ৫১ বছর বয়সী এক ব্যক্তিকে গ্রেপ্তার (channeli lead)
- অভিযোগ: বাংলাদেশি বংশোদ্ভূত অস্ট্রেলীয় নারীর রহস্যজনক মৃত্যুর তদন্ত প্রভাবিত + বাংলাদেশ পুলিশের নথি থেকে নাম বাদ দেওয়ার চেষ্টা (channeli)
- এএফপির দাবি: বাংলাদেশে ~৯০ হাজার অস্ট্রেলীয় ডলার পাঠিয়েছেন (channeli body)
- প্রথম আলো: শিরোনামে ৮০ লাখ টাকা + "বাংলাদেশি" (prothomalo title-only)
- Currency discrepancy (৯০ হাজার AUD vs ৮০ লাখ টাকা) reported WITH attribution, not merged.

## Notes
- `inferTags` false-hits pre-existing: 'টাক'→economy, 'রেল' in 'অস্ট্রেলিয়ান'→transport (same class as national-367/381; left unfixed per precedent).
- Existing published copy's body was authored in the 2026-09-23 first batch; this re-run did not modify `site/src/content/news/national-395.md`.