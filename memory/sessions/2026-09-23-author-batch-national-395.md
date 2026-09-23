# Author batch 2026-09-23-national-395

## Task
- Read `pipeline/state/pick.json` → picked: `national-395` (status open, tier A, score 4, date 2026-09-22T19:54:05Z; pending=1).
- Authored Bengali article body → `pipeline/tmp/stories/national-395.b.md` → ran `node pipeline/tools/finalize_stories.mjs --site=site/src/content/news --max=6`.
- No git commit/push (per task).

## Story: national-395 — অস্ট্রেলিয়ায় ঘুষ/গ্রেপ্তার (crime, cluster from prothomalo + channeli)
- Headline (brief): "বাংলাদেশি বংশোদ্ভূত নারীর মৃত্যু তদন্ত প্রভাবিত করতে ঘুষ, অস্ট্রেলিয়ায় গ্রেপ্তার এক ব্যক্তি".
- Facts pinned to brief + store.db member bodies:
  - AFP ৫১ বছর বয়সী এক ব্যক্তিকে গ্রেপ্তার (channeli lead).
  - অভিযোগ: বাংলাদেশি বংশোদ্ভূত অস্ট্রেলীয় নারীর রহস্যজনক মৃত্যুর তদন্ত প্রভাবিত করা + বাংলাদেশ পুলিশের নথি থেকে নিজের নাম বাদ দেওয়ার চেষ্টা (channeli lead).
  - এএফপির দাবি: বাংলাদেশি সরকারি কর্মকর্তাদের ঘুষ দিতে বাংলাদেশে পাঠিয়েছেন প্রায় ৯০ হাজার অস্ট্রেলীয় ডলার (channeli body).
  - প্রথম আলোর শিরোনামে ঘুষের অঙ্ক ৮০ লাখ টাকা; গ্রেপ্তার ব্যক্তিকে "বাংলাদেশি" বলা হয়েছে (prothomalo title).
- Currency discrepancy handled honestly: both figures reported WITH attribution; no merge into one amount. No date claimed (news-fresh, event date unknown).
- Body: ২৭৩ টোকেন incl bullets+sources (২৬২ excl sources) — within ২৫৫–২৯০. Bengali numerals (৫১, ৯০, ৮০ লাখ), no Latin digits in body text (digit only in source URL).
- "এক নজরে" ৪ bullets → extracted to keyPoints by finalize. Verification closing ("দুই সংবাদমাধ্যমের প্রতিবেদন থেকে যাচাই") present; NO editorial/draft footer (D25).
- finalize: wrote=1 skipped=0 failed=0 → `site/src/content/news/national-395.md` (draft:false, badge confirmed tier A score 4).

## Notes / flags (unfixed, pre-existing class)
- `tags: ["economy","transport"]` = inferTags substring false-hits: "টাক" (টাকা) → economy; "রেল" inside "অস্ট্রেলিয়ান" → transport. Same bug class as national-367 'বাস'/'স্বাস্থ্য' and national-381 'স্বাস্থ্য'→health. Left deterministic/unfixed per precedent; worth a central fix in `inferTags` full-word matching someday.
- Everything else green; not committed (task rule).