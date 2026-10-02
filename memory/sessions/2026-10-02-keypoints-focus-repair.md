# 2026-10-02 — "এক নজরে" focus-point repair (D142)

## Why
User reported the focus box was "not really providing focus point" and asked for the
last 100 articles to be audited and fixed, then the pipeline and the live site checked.

## Audit (last 100 articles)
- 99/100 had `keyPoints`; one did not.
- 192 bullets ended on a dangling connective/particle; 53 more had no terminal
  punctuation. Roughly a quarter of the corpus was not a readable sentence.
- Visible examples: a bullet cut to `…যাত্রা শ`, another to `…প্রয়োজ`.

## Root causes fixed (all in the generator, not the corpus)
1. `asBullet` cut long sentences at a clause boundary to fit a word budget; the cut
   lands mid-phrase. A bullet is now always a whole sentence; over-long sentences are
   refused rather than cut.
2. Whole-sentence reintroduced half-quotations → an unpaired-quote sentence is refused.
3. `quotesBalanced` scanned only the KEYS of `QUOTE_PAIRS`; closing marks (`’`, `”`, `»`)
   are only VALUES, so every closing mark was skipped and any sentence containing a
   quotation was judged unbalanced. Now scans keys+values, and treats an apostrophe
   inside a word (`শি’র`) as part of the word. The preceding char is often a vowel
   sign (`Mn`), so marks count as word characters.
4. `sentences()` could return a blob spanning a blank line → rendered as a single-line
   YAML item that is invalid YAML and fails the whole site build. Candidates with a
   newline are rejected.

## repair_keypoints.mjs — verified rewrite, not a clever guess
Guesses the extent of the `keyPoints` block, then VERIFIES the rewrite: must parse, keep
every other front-matter key identical in value, and preserve front-matter comments.

Two silent corruption paths were caught by that guard (both would have shipped):
- block end guessed one line too early → orphaned fragment → invalid YAML → whole build fails;
- a re-serialise fallback deleted 69 comment lines across the corpus (291/503 files carry
  real explanatory comments).

Also fixed: `keyPoints:` with an empty inline value followed by indented items is a BLOCK,
not an empty key. Treating it as single-line orphaned the items and silently changed
`draft` on economy-263 — that was why 40 articles could not be repaired at all.

A refusal is reported as `blocked`, never as "changed". The first version counted a
refusal as success, wrote the original bytes back, and the article stayed broken while
the tool reported 76 files written. A tool that cannot prove it worked must say so.

## Gates added so it cannot regress
- `site_preflight`: `KEY_POINT_INCOMPLETE`.
- Corpus test: no published article carries an incomplete key point.

## Result
- 65 articles repaired (52 boxes fixed, 3 boxes removed where no body sentence qualified).
- 10 more repaired that `auto-author` published during the merge (old generator).
- Corpus: 556 articles, 1364 points, 0 incomplete, 0 truncated, 0 under five words.
- Integrity verified file by file vs HEAD: no body text, no other front-matter key, and
  no comment changed anywhere.
- Suite 457/457 (was 445/445 before this work; +12 new tests).
- Live: 30 articles sampled from jachaidesk.com/news — all render the box, 93 points,
  0 incomplete.
- `tests` + `images` green on the pushed commit; `deploy` green on the follow-up commit.

## Push
- `8a66a784` fix(site): make every "ek nজরে" point a whole, complete sentence
- `a63199c5` merge into origin/main (52 bot commits ahead)
- `72bf03e1` fix(site): repair focus points on articles published since the generator fix
- `830ce895` merge remote-tracking origin/main
One conflict: `national-976.md` was deleted on origin/main and modified locally → kept the
deletion (the bot's decision).

## Pre-existing, NOT caused by this work
- `Lighthouse` fails on every run since 05:45 today. `lighthouserc.json` asserts
  `minScore: 1` (a perfect 1.0) on performance/seo/accessibility/best-practices, which a
  real news page will not hold. This is a misconfigured assertion, not a regression.
- `content-sweep` `BODY_OFF_HEADLINE` false positives on poetic/inflected headlines (D140).
- `heartbeat` holds a job in_progress for hours (redundant pump).

## Environment notes
- `git apply --3way` cannot be used to land a commit here: the bot deletes articles, and a
  patch that modifies a since-deleted file fails with "does not exist in index". Use a real
  `git merge` in a worktree.
- A fresh worktree has no `node_modules`; symlink them or the suite fails ~24 tests and
  reports a misleadingly small total (285 instead of 457).