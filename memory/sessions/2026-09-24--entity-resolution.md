# Session: P0-10 Entity resolution + actor registry (2026-09-24)

## What / files
- **NEW `pipeline/lib/identity.mjs`** —
  - `ALIASES`: curated transliteration variants → canonical identity
    (এরদোগান/এরদোয়ান/এর্দোয়ান/আরদোয়ান → রিসেপ তাইয়েপ এরদোয়ান; সুজমান → মার্ক সুজম্যান;
    ট্রাম্প → ডোনাল্ড ট্রাম্প; শেখ হাসিনা ওয়াজেদ → শেখ হাসিনা).
  - `normalizeName`: strips honorifics from either side (প্রধানমন্ত্রী/ডা./অধ্যাপক/প্রফেসর…),
    removes particles/middots, NFC-normalizes.
  - `identityKey`: canonical identity for a mention; returns null for The Daily/com
    (no Bangla script), digit-bearing, danda/comma/ellipsis clauses, generic junk.
  - `extractActors(text,{strict})`: per-SENTENCE actor-cue regexes
    (জানিয়েছে/বলেছেন/বলে/…); comma-clause rule keeps only the subject of the clause
    holding the verb ("…আহত হয়েছেন, স্থানীয়রা বলেছেন…" → স্থানীয়রা); `strict` mode
    (registry-quality) keeps ONLY "X বলেন" attribution; `guardPass` rejects function-word‑only
    phrases and passive/impersonal tails ("…হয়েছেন বলে জানা গেছে" = NOT an actor).
  - Canonical dedupe: honorific duplicates collapse ("প্রধানমন্ত্রী শেখ হাসিনা" +
    "শেখ হাসিনা" → 1 mention).
- **Schema**: new tables `actors(canonical UNIQUE, aliases_json, kind, first_seen, last_seen,
  claim_count)` + `actors_claims(actor_id, claim_id, mention)` (additive, never touches claims).
- **NEW `tools/entity_index.mjs`**: extracts from claim_text + claim_evidence excerpts (strict),
  upserts actors + links; REBUILDS the derived registry each run (no stale junk).
- **CI**: informational "Actor registry (entity resolution)" step in pipeline.yml.
- **NEW `test/identity.test.mjs`** (7 tests).

## CRITICAL UTF bug found + fixed (the whole session's debugging was this)
- Bengali "য়" has TWO byte forms: the DB text is **composed U+09DF**; our literals were
  **decomposed য(U+09AF)+়(U+09BC)**. Regex/alias/Set literal matching is NOT canonically
  equivalent, so junk filters silently missed phrases (e.g. "আহত হয়েছেন" didn't match the DB
  text) and alias lookup failed.
- Fix: NFC-normalize every input (`normalizeName`, `clean`) AND build the junk filter from
  `.source.normalize('NFC')`; normalize FUNCTION_WORDS keys + alias keys at compare time.

## Results
- Full suite **106/106 pass** (was 99; +7 identity tests; other test files grew from
  parallel worker — all green).
- Live registry (rebuild): 213 claims scanned → **2 honest identities** —
  `আব্দুর রহমানেল মাছউদ` (real named person) and `স্থানীয় বাসিন্দারা`.
  Zero junk (previous versions leaked passive-voice clauses; fixed).

## Why the registry is small (and why that's fine)
- The current claim corpus is largely machine-synthesized bullet leads or same-event evidence
  paraphrases — few real "X বলেন" sentences. Strict low-recall extraction is the right call:
  a registry of TRUE attributed actors, honest about precision. Populates with real prose
  as the corpus grows.

## Next
- Continue down the roadmap: Structured contradiction detection (same actor → contradicting
  claims — now possible via actors_claims), Temporal truth ("earlier" vs "now" markers).