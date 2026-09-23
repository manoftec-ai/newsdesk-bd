# Session — 2026-09-23 author batch national-417 + national-415 + national-416

## Summary
3 stories authored from `pipeline/state/pick.json` (picked: national-417, national-415, national-416), finalized `draft:false`, **NOT committed** (task rule).

## Run
- `pick.json` → picked `[national-417 (2026-09-23T08:04Z), national-415 (2026-09-22T14:39Z), national-416 (2026-09-22T08:17Z)]`, pending 3 → all authored (273/259/268 words incl bullets+sources, Bengali numerals, Bengali-only prose).
- `node pipeline/tools/finalize_stories.mjs --site=site/src/content/news --max=6` → **wrote=3 skipped=0 failed=0**.

## national-417 (Sakib Al Hasan + 14, share-market case report postponed)
- Brief: confirmed/A/4, banglatribune (আইন ও অপরাধ, title+lead) + prothomalo (বাংলাদেশ, lead). Headline: "সাকিবসহ ১৫ জনের বিরুদ্ধে শেয়ারবাজার কারসাজির মামলায় তদন্ত প্রতিবেদন জমার নতুন তারিখ ১৭ নভেম্বর".
- Facts (all trace to brief): জাতীয় ক্রিকেট দলের সাবেক অধিনায়ক ও সাবেক সংসদ সদস্য সাকিব আল হাসানসহ ১৫ জন; শেয়ারবাজার কারসাজি, জালিয়াতি ও অর্থপাচার; আজ বুধবার (২৩ সেপ্টেম্বর) ঢাকার মহানগর সিনিয়র স্পেশাল জজ শাহজাহান কবিরের আদালতে দুদকের দাখিলের দিন; দুদক জমা দিতে পারেনি; নতুন তারিখ ১৭ নভেম্বর (বাংলা ট্রিবিউন 'ফের পেছালো').
- Body conservative: দুদক কেন জমা দেয়নি / ১৫ জনের বাকিরা কারা — ইত্যাদি brief-এ নেই → বলা হয়নি. TAGS `[]`.

## national-415 (Bengal Commercial Bank 6th AGM)
- Brief: confirmed/A/4, bdnews24 (title-only) + prothomalo (করপোরেট সংবাদ lead: গত সোমবার রাজধানীর একটি হোটেলে ষষ্ঠ বার্ষিক সাধারণ সভা/এজিএম).
- Lead-thin brief → body deliberately conservative: সভা/স্থান/সময় নিশ্চিত, এজেন্ডা/সিদ্ধান্ত/হোটেলের নাম "অসম্পূর্ণ" caveat ✓. General AGM-definition sentence added as explanatory context only. TAGS ["dhaka"] (inferTags 'ঢাকা').

## national-416 (launch fare up after fuel price rise)
- Brief: confirmed/A/4 but CLUSTER BLEND: bd24live title = তেলের দাম বৃদ্ধির পর লঞ্চের ভাড়া বাড়ল; jugantor title-only = 'বাড়ল বাস ভাড়া' — two DIFFERENT transport modes in one cluster (like national-364 flag pattern).
- Body keeps attribution separate: launch-fare causation (oil) only from bd24live; jugantor's bus-fare rise reported as its own headline WITHOUT linking it to oil (no bridging inference). TAGS `[]`.

## Outputs
- `pipeline/tmp/stories/national-417.b.md`, `national-415.b.md`, `national-416.b.md`
- `site/src/content/news/national-417.md`, `national-415.md`, `national-416.md` (all `draft:false`, keyPoints 3 each, sources from brief incl. Google News proxy URLs for bdnews24/jugantor/bd24live, verification block, seo fields auto-filled via finalizeStory).

No git commit/push (task rule: "Do NOT git commit / push / touch anything else").