# Author batch 2026-09-23 (national-464 — 1 story finalized, draft:false, NOT committed)

## Read pick.json
1 picked:
- **national-464** / 2026-09-23T11:58:11Z — মোহাম্মদপুর থেকে সাবেক এমপি মোশতাক আহমেদ রুহী গ্রেপ্তার (bd24live+ittefaq, national, open/confirmed/tier A/score 4)

`site/src/content/news/national-464.md` did NOT exist (checked) → clean 1-story author.

## Body authored (pipeline/tmp/stories/national-464.b.md)
- 128 words (2 sources → target 100–180), Bengali numerals, strict brief facts, no padding.
- Synthesis-first: single narrative, NOT walk-through of outlets. Facts: former MP Moshtaq Ahmed Ruhi arrested from Mohammadpur, Dhaka; ittefaq names him + exact area, bd24live only says a former MP arrested from the capital — handled WITH attribution (each outlet named once, difference stated).
- **এক নজরে** block (3 bullets) → keyPoints ৩ + stripped from body by extractKeyPoints.
- **## যা এখনো জানা যায়নি** included — unknown who/which agency arrested him, which case, what charges.
- Closing prose verification line naming outlets once; no D25 footer; no source URLs in body.
- Editorial gate: 0 violations (verify script + finalize).

## finalize
`node pipeline/tools/finalize_stories.mjs --site=site/src/content/news --max=6` → **wrote=1 skipped=0 failed=0 blocked=0**
- `site/src/content/news/national-464.md` (draft:false, tags inferred ["health","dhaka"], thumbnail absent — images.yml brands later)

No commits (task rule). Body remains in `pipeline/tmp/stories/` for reference. DRY_RUN unset → real finalize (not dry-run).