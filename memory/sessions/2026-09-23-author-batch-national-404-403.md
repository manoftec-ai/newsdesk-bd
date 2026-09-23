# Session — 2026-09-23 author batch national-404 + national-403

## Summary
2 stories authored from `pipeline/state/pick.json` (picked: national-404, national-403), finalized `draft:false`, **NOT committed** (task rule).

## Run
- `pick.json` → picked `[national-404 (2026-09-23T03:56Z), national-403 (2026-09-23T02:27Z)]`, pending 2.
- Authored body-only `.b.md` for BOTH slugs at `pipeline/tmp/stories/` (Bengali, numerals Bengali, `**এক নজরে**` bullet block, verification closing, sources list last; ends on সূত্র, no editorial/draft footer per D25).
- `node pipeline/tools/finalize_stories.mjs --site=site/src/content/news --max=6` → **wrote=2 skipped=0 failed=0**.

## national-404 (ফাতেহা-ই-ইয়াজদাহম / education holiday)
- Brief: confirmed/A/4, ittefaq (title+lead) + channeli (ধর্ম ও জীবন, title + etymology lead). Headline: "যথাযথ মর্যাদায় পালিত হচ্ছে ফাতেহা-ই-ইয়াজদাহম, শিক্ষাপ্রতিষ্ঠানে ছুটি".
- Authored facts (all trace to brief): আজ বুধবার (২৩ সেপ্টেম্বর) দিবসটি; দেশের সব শিক্ষাপ্রতিষ্ঠানে ছুটি; ফাতেহা-ই-ইয়াজদাহম = ১১তম দিনের ফাতিহা/ফাতেহা শরিফ; ইয়াজদাহম ফারসি শব্দ অর্থ এগারো; প্রতি বছর আরবি রবিউস সানি মাসের ১১ তারিখে পালিত। Body conservative re: specific programs (not in brief). TAGS ["education"] — inferTags 'শিক্ষা' hits 'শিক্ষাপ্রতিষ্ঠান' (legitimate).
- Body tokens: ২৬৬ incl bullets+sources.

## national-403 (Trump threatens Iran at UN)
- Brief: confirmed/A/6, ittefaq (ধূলিসাৎ) + bbc-bengali (নিশ্চিহ্ন, quote lead) + prothomalo (title-only). Headline: "জাতিসংঘের ভাষণে ইরানকে 'নিশ্চিহ্ন' করে দেওয়ার হুমকি ট্রাম্পের".
- Authored facts (all trace to brief): মার্কিন প্রেসিডেন্ট ডোনাল্ড ট্রাম্প জাতিসংঘের ভাষণে; হামলা না শান্তি চুক্তি — 'বড় সিদ্ধান্ত'; সংঘাতের সমাধান না হলে ইরানকে 'নিশ্চিহ্ন'; ইত্তেফাকের ভাষায় 'ধূলিসাৎ'. Conservative on what's not known (no specifics in brief). TAGS ["health","cricket"] — PRE-EXISTING inferTags substring false-hit class ('হাম' ⊂ 'হামলা'→health; 'রান' ⊂ 'ইরান'→cricket); left unfixed per precedent (national-367/395).
- Body tokens: ২৬২ incl bullets+sources.

## Outputs
- `pipeline/tmp/stories/national-404.b.md`, `pipeline/tmp/stories/national-403.b.md`
- `site/src/content/news/national-404.md`, `site/src/content/news/national-403.md` (both `draft:false`, keyPoints 3 each, sources from brief, verification block, seo fields auto-filled).

No git commit/push (task rule: "Do NOT git commit").