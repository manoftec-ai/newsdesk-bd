# Author batch — national-395 rerun #2 (D-Q15 skip expected)

Date: 2026-09-23 (author session)
Trigger: pick.json listed `national-395` (pending 1); task = author EXACTLY picked slugs only.

## Facts from brief (national-395, cluster 395)
- Badge: confirmed, tier A, score 4 (2 outlets: prothomalo + channeli).
- এক নারীর মৃত্যু তদন্ত প্রভাবিত করতে ঘুষ: প্রথম আলো শিরোনামে "৮০ লাখ টাকা ঘুষ, অস্ট্রেলিয়ায় বাংলাদেশি গ্রেপ্তার" (title-only lead).
- চ্যানেল আই lead: "বাংলাদেশি বংশোদ্ভূত এক অস্ট্রেলীয় নারীর রহস্যজনক মৃত্যুর তদন্ত প্রভাবিত করা এবং বাংলাদেশ পুলিশের নথি থেকে নিজের নাম বাদ দেওয়ার চেষ্টা করার অভিযোগে ৫১ বছর বয়সী এক ব্যক্তিকে গ্রেপ্তার করেছে অস্ট্রেলিয়ান ফেডারেল পুলিশ (এএফপি)"; URL confirms ~৯০ হাজার (90000) ডলার ঘুষ বিষয়।

## Currency discrepancy (NOT merged — presented WITH attribution)
- channeli: প্রায় ৯০ হাজার অস্ট্রেলীয় ডলার
- prothomalo (title): ৮০ লাখ টাকা
- Body states both, each attributed to its outlet; no single number chosen as fact. Follows precedent (same story authored earlier + documented D-Q15/rerun-1).

## Action
1. Confirmed `site/src/content/news/national-395.md` ALREADY EXISTS — published by concurrent auto-author (commit 0145 author + brand 0149, `draft:false`, thumbnail intact). Clean copy, no D25 footer.
2. Per task step 3, still wrote body-only file `pipeline/tmp/stories/national-395.b.md` (Bengali numerals, **এক নজরে** bullets, sources, verification closing, NO editorial footer; word count ~260 incl bullets+sources).
3. Ran `node pipeline/tools/finalize_stories.mjs --site=site/src/content/news --max=6` → **wrote=0 skipped=1 failed=0** ("national-395: already exists, skip"). storyExists gate (synth.mjs) = safety net (D-Q15).

## Outcome
- No duplicate published (D-Q14 dedup intact).
- Live copy left untouched (overwriting would drop its thumbnail field — correct to skip).
- `pipeline/state/pick.json` still lists national-395 as picked until next pipeline run recomputes it; D-Q15 designed for this.
- NO git commit / push performed (task rule).

## Files created (this session)
- `pipeline/tmp/stories/national-395.b.md` (body, not committed — tmp/ gitignored)
- `memory/sessions/2026-09-23-author-batch-national-395-rerun-2.md`
- MEMORY.md / MEMORY.json updated in sync.