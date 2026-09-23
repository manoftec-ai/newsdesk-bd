# Session 2026-09-23 — D54: Homepage thumbnail rows + BD date-time

## Context
Homepage "secondary line" (2x2 mini rows under the hero, `secondLine` = 4 newest after lead)
showed only a leading `<time>` date column plus the headline. User wanted:
- a small thumbnail matching each headline (instead of the date on the left),
- the date kept, but alongside the headline,
- BD Time with the date, so visitors can gauge posting frequency.

## Changes (commit `f23475f`, deploy GREEN run 35885996379)
1. `site/src/pages/index.astro` — secondLine rows rebuilt:
   - `<a class="mini-row-thumb">` wrapping a lazy `img` (src=thumbnail, alt=thumbnailAlt)
   - `.mini-row-body` = title `<a>` + `<time class="mini-row-datetime" datetime=ISO>` with
     `{formatDateTimeBDShort(post.ts)}`
   - imported `formatDateTimeBDShort` from news-data.js
2. `site/src/lib/news-data.js` — two new helpers:
   - `formatDateTimeBD(ts)`: `Intl.DateTimeFormat` with `timeZone: 'Asia/Dhaka'`, `bn-BD`,
     date part (day/month/year) + time part (hour/minute, hour12) → "২৩ সেপ্টেম্বর, ২০২৬ · ৫:১০ PM";
     separ shows no awkward "এ" by formatting date+time separately.
   - `formatDateTimeBDShort(ts)`: same but omits the year when it equals the current BD year.
   - fallbacks to `tryDate` if Intl fails
3. `site/src/styles.css` — `.mini-row-thumb` (5.5x3.2rem, hidden overflow, rounded, cover, align-self:start),
   `.mini-row-body`, `.mini-row-body a(:hover)` (headline styles moved here), `.mini-row-datetime`;
   kept legacy `.mini-row-time` + added `.mini-row > div > a(:hover)` for the article "আরও পড়ুন" rows.

## Verification
- Intl output spot-checked in node: "২৩ সেপ্টেম্বর, ২০২৬ | ৫:১০ PM", "১ জানুয়ারি, ২০২৬ | ১২:৩০ AM" (cross-midnight handled via timeZone)
- Live homepage: 4 `mini-row-thumb` rows with `/images/national-445/447/437/441.webp` (HTTP 200);
  datetime labels `২৩ সেপ্টেম্বর · ৭:১৬ PM` etc (UTC+6 correct)
- Article page "আরও পড়ুন" rows still render `.mini-row-time` + link (legacy path intact)
- Remote had advanced (auto-author 108cd8f) → rebased cleanly before push

## Notes
- All 433 articles have `thumbnail:` + full `date` timestamps → no missing-thumb fallback needed
- Push needed rebase (remote auto-author commit) — standard dance now