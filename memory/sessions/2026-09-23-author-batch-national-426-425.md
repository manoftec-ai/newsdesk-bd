# Author batch 2026-09-23 (national-426 + national-425 — 2 stories finalized, draft:false, NOT committed)

## Read pick.json
2 picked newest-first:
- **national-426** / 2026-09-23T11:10:52Z — হামের উপসর্গে একদিনে ১১ প্রাণ (banglatribune+channeli, স্বাস্থ্য, open/confirmed/tier A/score 4)
- **national-425** / 2026-09-23T07:38:24Z — মানবাধিকার সুরক্ষা প্রশ্নে কথা রাখতে পারেনি বিএনপি: হিউম্যান রাইটস ওয়াচ (bbc-bengali+channeli, বাংলাদেশ, open/confirmed/tier A/score 4)

Both already existed? NO — neither `site/src/content/news/national-426.md` nor `national-425.md` existed (checked). So this was a clean 2-story author.

## Bodies authored (pipeline/tmp/stories/)
- **national-426** (258 words incl bullets+sources; Bengali numerals ১১/২৪ ঘণ্টা/৮টা/১ হাজার ২৭০): গত ২৪ ঘণ্টায় (মঙ্গলবার সকাল ৮টা–বুধবার সকাল ৮টা) হামের উপসর্গে ১১ শিশুর মৃত্যু = সেপ্টেম্বরের এক দিনের সর্বোচ্চ; নতুন রোগী ১ হাজার ২৭০ জন। Strictly brief facts; location/how-to-respond detail left out (not in brief). tags ["health"] (legit — rawCategories স্বাস্থ্য). keyPoints ৩.
- **national-425** (263 words incl bullets+sources): subject DISCREPANCY handled WITH attribution not merged — bbc-bengali headline says বিএনপি failed to keep word; channeli headline uses 'সরকার' (government). Body attributes each outlet's version separately, flags the difference explicitly as a reporting divergence, notes three-passed-laws detail not elaborated in either lead. tags [] (no inferTags hit). keyPoints ৩.

Both: **এক নজরে** block → keyPoints ৩ + block stripped from body; verification-closing paragraph ("...দুই প্রতিষ্ঠিত সংবাদমাধ্যমের প্রতিবেদনের ভিত্তিতে যাচাই করা হয়েছে") + সূত্র: list last; no D25 editorial footer.

## finalize
`node pipeline/tools/finalize_stories.mjs --site=site/src/content/news --max=6` → **wrote=2 skipped=0 failed=0**
- `site/src/content/news/national-426.md` (draft:false, tags ["health"], thumbnail absent — images.yml brands later)
- `site/src/content/news/national-425.md` (draft:false, tags [])

No commits (task rule). Bodies remain in `pipeline/tmp/stories/` for reference.