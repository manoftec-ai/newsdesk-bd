# 2026-09-26 — article page standards (D107)

## The user's report
> "but news are on my site are not looking standard for me. there so many
> things are missing. you please check it in live site"

## Audit of all 377 live articles
| Problem | Count | Share |
|---|---|---|
| Byline is generic `desk` | 377 | 100% |
| No standfirst (উপশিরোনাম) | 377 | 100% |
| English evidence labels shown to readers | 263 | 70% |
| Source link is a Google News redirect | 113 | 30% |
| `tags: []` empty | 100 | 27% |
| `faq: []` empty | 199 | 53% |
| Under 150 words | 26 | 7% |

Body length median **193**, p75 216. Market (Ittefaq, Dhaka Tribune, Deshrupantor,
New Age, BDNews24 — 51 articles): median **269**, mean 348. So articles run ~25%
short of standard.

## Fixed (render-time, so bots cannot undo it)
1. **617 English labels → Bengali** — new `site/src/lib/evidence-label.js`.
   "reputable paper corroboration (daily-observer)" → "ডেইলি অবজার্ভার-এ একই তথ্য প্রকাশ করেছে".
   Genuine English citations in the history archive (NASA — Sputnik 1) keep their
   own names deliberately: a citation names its source in the source's language.
2. **Machine text removed** — "এই নোটটি যাচাই-প্রক্রিয়ার সিদ্ধান্ত দেখায় (কোনো
   ব্যাখ্যা-প্রক্রিয়া নয়)" and "মন্তব্য GitHub Discussions-এ সংরক্ষিত — মডারেশন GitHub-এ।"
3. **Wrong event chips root-caused** — see below.
4. **Standfirst added** — 375/377 now render one.
5. **Reading time measured** — was hardcoded to 1.
6. **"(ঘটনাপঞ্জি)" jargon** dropped from the event box heading.
7. **Source names in Bengali** where known.

## The event-chip bug, in full
`national-378` — a World Bank meeting — carried chips for
"খেলাপি ঋণ ও মানি লন্ডারিং" and "পদ্মা সেতুর দুর্নীতি মামলা".

Not a word-list problem. Bengali is agglutinative and `eventMatchScore` used a
raw substring search, so the keyword `ব্যাংক` matched **inside** `বিশ্বব্যাংক`.
Counted across title (×3), excerpt (×1.5) and body (×0.8) it reached 6.9 against a
minimum of 4 — passing on its own.

Fix: `countWordOccurrences`, which only counts a hit whose neighbouring
characters are not Bengali letters, so the keyword must stand as its own word.
`GENERIC_WORDS` also grew 16 → ~55 (ঋণ, দুর্নীতি, সেতু, বৈঠক, প্রধানমন্ত্রী, …).

**First attempt over-corrected.** Requiring a strong keyword in the headline cut
chips 512 → 3 and killed all 116 `history-*` links — exactly where the feature
belongs. Reverted to the compound fix plus `minimum = 10`:
- min 4: 144 articles, 311 chips
- min 8: 41 articles, 67 chips
- min 10: 23 articles, 30 chips, ~20 of 23 correct

A wrong "more news on this event" link is worse than no link. Three misses remain
(চেরনোবিল → রূপপুর, both nuclear-themed) — the event registry's own keywords are
loose, which is a curation task, not code.

## Two false alarms I reported, both my own fault
- **Paragraph truncation** — my extraction script sliced to 150 chars. Bodies are intact.
- **Source names running together** — `.source-list` is already
  `display:flex; gap:0.4rem 0.9rem`. Artifact of stripping tags.
- **Reading time still 1 minute** after the "fix" — this one was real. Astro 7 does
  not expose `entry.body`, so the read silently returned nothing. Caught by
  checking the live page, then fixed by reading the markdown file directly.

## Deploy status
- Structural batch live and verified at `8af3987a21`.
- The 150-wpm reading-time tweak (`a29cfa3`) committed but **not live** — the deploy
  hit `api-deployments-free-per-day` because the trailing 24h window still contains
  2026-09-25's 100 attempts. Self-heals as the window rolls.
- D106 (hourly-only deploy) confirmed holding: no bot-triggered deploy runs since.

## Still open, needs a decision or separate work
- **Byline** — 377/377 say `desk`. Deferred by the user. Options: (a) real names,
  which I will not invent, (b) attribute to the source outlet, (c) house byline.
- **Google News wrapper source URLs** (113) — data fix, resolve to real outlet links.
- **Empty tags** (100) and **empty FAQ** (199) — sections already hide when empty;
  the data is missing, not the rendering.
- **Median 193 → 269 words** — content work, not code. Rewrite tooling exists.
- **Related stories are unrelated** — a World Bank meeting links to a murder story.
- **Event registry keywords** are loose (3 wrong chips remain).
