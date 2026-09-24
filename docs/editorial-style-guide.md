# JachaiDesk Editorial Style Guide

> Canonical editorial spec for যাচাইডেস্ক (jachaidesk.com). Registered 2026-09-24 per
> Editorial Upgrade Proposal #28. Everything a model author/auditor must follow. The
> deterministic bans below are ENFORCED by code (see "Enforcement" at the end) — bodies
> that violate them are not published.

## 0. The primary principle (Proposal #1)
Optimize for the **clearest human-readable representation of verified information**.
If 120 words is enough, that is the article. Length = information value, never padding.
Every article should answer: what happened, what is confirmed, what is unknown, why it
matters (only factually), and where the information came from.

## 1. Voice — write the news, not the research (Proposal #3, #11, #27)
The reader must never feel they are reading "an AI summary comparing newspapers." They
must feel they are reading a clear, concise, trustworthy Bangla news story.

- Merge every source into **ONE fact pool**. Write the event, not what outlets said about it.
- **Never** write "outlet A reported X, outlet B also said Y", "both reports said…",
  "সমকাল ও কালের কণ্ঠের প্রতিবেদনে…", "দুই ভিন্ন শিরোনামে…". This is blocked at the gate.
- **Never write a source's name in the body.** Sources are shown ONCE, after the news, in
  the automatic frontmatter `সূত্র:` block. (Enforced: `BANNED_OUTLET_NAMES`.)
- Attribute an action to a real **actor** only when attribution is genuine:
  "প্রধানমন্ত্রী বলেছেন…", "পুলিশ জানিয়েছে…", "মন্ত্রণালয়ের বিজ্ঞপ্তিতে বলা হয়েছে…".
- No invented observers: no "পর্যবক্ষকরা মনে করছেন", "বিশেষজ্ঞরা বলছেন", "সংশ্লিষ্টরা…",
  "কয়েকটি সূত্র…". (Enforced: `BANNED_INVENTED_ACTORS`.)

## 2. Structure (Proposal #4) — omit any empty section
1. Lead paragraph — most important fact up front (who/what/when/where), plain and short.
2. `**এক নজরে**` — 2–4 genuine key points. Never headline repetition, never generic
   background, never speculation, never adjectives, never source-analysis.
3. `## মূল খবর` — 2–5 short paragraphs, plain chronology or logic.
4. `## কী জানা গেছে` — ONLY when important verified details deserve their own explanation
   (numbers, dates, documents, decisions).
5. `## কী এখনো জানা যায়নি` — ONLY if real unknowns genuinely remain (agenda, details,
   identities, decisions). This section is JachaiDesk's signature transparency feature
   (Proposal #16). Omit entirely if nothing is unknown.

## 3. Facts, claims, interpretation (Proposal #8, #13)
- Three registers: **FACT** (verified), **ATTRIBUTED CLAIM** (someone said it — say who),
  **ANALYSIS** (only when a source provides it, or labelled JachaiDesk analysis).
- Never silently choose between conflicting reports — say the difference ("৫.২ মাত্রার
  ভূমিকম্প, কিছু সূত্রে ৫.৫ বলা হয়েছে; চূড়ান্ত সরকারি তথ্য এখনো পাওয়া যায়নি").
  (One way: Proposal #13 claim-level labels VERIFIED / CORROBORATED / SINGLE_SOURCE /
  UNCONFIRMED / CONFLICTING / OFFICIAL / REFUTED / OUTDATED → each constrains how a claim
  may be written.)
- No unsupported interpretation, no assumed public reaction, no speculative consequences.

## 4. Headlines (Proposal #14)
- Evidence-constrained: never stronger than the strongest supported claim. No exaggeration.
- Auditor checks headline + subheadline + summary + social title against the evidence graph.

## 5. Quotes (Proposal #15)
- **Never invent a quote.** An exact quote must exist in source evidence. Paraphrase without
  quote marks. No evidence → no quote. Never "clean up" a quote in a way that changes meaning.

## 6. Length (Proposal #6, dynamic)
Tiers by information value, not a fixed count: breaking 100–180, normal 180–350,
developing 300–600, complex/explainer 600–1000+. What matters: every sentence adds
information the reader did not already have.

## 7. Forbidden (deterministic gates — not only style)
Never write, even to be "natural":

| Class | Examples | Gate |
|---|---|---|
| outlet names in body | সমকাল, কালের কণ্ঠ, প্রথম আলো, বিবিসি, … | `BANNED_OUTLET_NAMES` |
| reporting-on-reporting | প্রতিবেদনে বলা হয়েছে, দুই প্রতিবেদনে, দুই ভিন্ন শিরোনামে, একাধিক সংবাদমাধ্যম, প্রতিবেদনে প্রকাশ পেয়েছে | `BANNED_SOURCE_META` |
| invented anonymous actors | পর্যবক্ষকরা মনে করছেন/বলছেন, বিশেষজ্ঞরা, সংশ্লিষ্টরা, কয়েকটি সূত্র, অনেকে মনে করছেন, এটি নিয়ে আলোচনা সৃষ্টি হতে পারে | `BANNED_INVENTED_ACTORS` |
| speculation | মনে করা হচ্ছে, আশা করা হচ্ছে (বিনা সূত্রে), … | `BANNED_SPECULATION` |
| AI filler | "আরও তথ্য প্রকাশের আশা…", "এ নিয়ে রাজনৈতিক অঙ্গনে আলোচনা…" | `BANNED_FILLER` |

Deliberate non-bans: "এদিকে / অন্যদিকে" are natural transitions — allowed. The noun
"বিশেষজ্ঞ" in a factual sense ("বিশেষজ্ঞদের মতে…" with a named source) is fine; the
vague invented-observer use is not.

## 8. Required
- Attribution to real, identifiable actors/sources wherever it matters.
- Uncertainty disclosed (`কী এখনো জানা যায়নি`, "চূড়ান্ত তথ্য এখনো পাওয়া যায়নি").
- Corrections/additions additive, never silent rewrites (Proposal #21): use
  `updated`/`correctionNote`/`updates[]` history.
- Natural, professional Bangla — no ChatGPT-isms, no transliteration where a Bangla word
  exists, sentence variety without repetition.

## 9. Formats (Proposal #19, #24, #25, #32)
- **Normal news** — the structure above.
- **Fact-check** — dedicated claim/ruling/source-of-claim/what-is-true/what-is-misleading
  template; never make normal news look like fact-check.
- **Breaking** — extremely short (a 30-word event gets a 30-word item), then update the same
  story, never a new 500-word article.
- **Developing** — মূল খবর / সর্বশেষ আপডেট / কী জানা গেছে / কী এখনো জানা যায়নি /
  সূত্র ও প্রমাণ; the SAME story evolves, never duplicate articles.

## 10. Reader value (Proposal #23, #30)
Publish only if the body adds a concrete fact beyond the headline. If the reader who read
only the headline gains nothing new → do not publish standalone (update existing / merge /
discard). This is enforced by the `rv1` reader-value gate (editorial.mjs).

## 11. Definitions (badges, Proposal #17)
- **নিশ্চিত (green, A)** — ≥2 independent reliable sources matched.
- **যাচাইকৃত (blue)** — official/primary source confirmed.
- **একক/আংশিক (yellow)** — one/limited source.
- **সন্দেহজনক (red)** — insufficient reliable proof.
Badge is justified by the verification state; never upgrade a badge the evidence does not
support.

## Enforcement (code — keep in sync)
- `pipeline/lib/synth.mjs` — `findEditorialViolations` (+ banned lists) run by the live
  author path before publishing; any hit BLOCKS the body.
- `pipeline/lib/audit.mjs` — mechanical audit points c1–c10 + `rv1` reader-value gate.
- `pipeline/lib/editorial.mjs` — `readerValueCheck` / `editorialValue`.
- `.github/workflows/auto-author.yml` — the FRESH-NEWS VOICE writer prompt.
- This guide is the human/spec source of truth; the listed files are the executable mirror.
  When changing one, change both.