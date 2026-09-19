# Architecture — newsdesk-bd (বাংলা সংবাদ ডেস্ক)

> Status: PROPOSED v2 (authenticity engine added 2026-09-19 after discussion). Last updated: 2026-09-19
> Owner: Zulfikar Rahman. Budget: zero. Deploy: Vercel (testing). Platform: Termux (Node.js).
> Promise: **authentic-first** — every published story shows its evidence and confidence badge.

## 1. Vision

An automated **verified** Bengali news desk for Bangladesh. Every ~30 minutes it collects fresh
reports from ~12 Bangladeshi sources, finds the same topic across papers (duplicate / piece-by-piece
reports), **merges them into one original, detailed, evidence-backed Bengali article per topic**, and —
before anything is published — subjects it to a verification pass: corroboration across reputable
papers, confirmation from official/agency channels, and contradiction scanning. Only stories that
clear an evidence threshold go live, each carrying a **confidence badge + a visible list of evidence**
(সূত্র + প্রমাণ). Human reviews before anything goes live.

**Product identity:** not "the fastest," but **"বাংলাদেশের সবচেয়ে যাচাই-করা সংবাদ"** (the most
checkable news). In a fake-news-heavy market, trust is the differentiator.

## 2. Non-negotiable decisions (recorded)

| # | Decision | Why |
|---|----------|-----|
| D1 | Original synthesis + attribution. Never repackage full article text | Legal safety (copyright/press law) + unique text that ranks on Google |
| D2 | Draft-first: every story starts as `draft: true` | Accuracy & trust; same habit as mustwatch.live |
| D3 | Every fact traceable to a source line; no invented detail | No fabricated/merged-in-error facts |
| D4 | AI provider-swap: one config value switches `local` (HF/llama.cpp) ↔ `gemini` (free) | Zero budget now, quality upgrade anytime without rewrite |
| D5 | Static site: **Astro** on **Vercel** free tier | Node-native; Hugo won't run on Termux (bionic); Vercel builds from git |
| D6 | Pipeline in **Node.js** | Only runtime already installed |
| D7 | Cadence 30 min, polite to sources (≤1 fetch/source/30min) | Reliability + don't get blocked |
| D8 | ~12 sources from user's approved mix | Coverage across Bangla dailies + English-based |
| D9 | **Only verified stories publish.** Single-source / unconfirmed stay in a "pending verification" queue | Trust first; site only shows checked news |
| D10 | **Tiered verification (A/B/C)** by topic sensitivity | Sensitive news fully verified; routine fast; opinion labeled |
| D11 | Social signals v1 = **official/agency channels + self-hosted SearXNG meta-search**; direct X/FB scraping deferred to a later paid phase | Free + stable; X/FB APIs are paid and fragile |
| D12 | "Authentic" publicly = **evidence + confidence badge** (যাচাইকৃত / নিশ্চিত / একক-সূত্র / সন্দেহজনক) with all sources clickable | No one guarantees absolute truth; we show our bar and proof |
| D13 | **Tier B breaking fast lane** — instance/routine news (tech, business, gadget approvals…) publishes as a **thin factual ALERT** in ~1 run (~30–60 min) at the `একক/আংশিক` bar, explicitly marked "বিস্তারিত আসছে" (details pending); the full story later **updates the same post**. Tier A (accident/crime/politics…) never rushes — stays pending until corroborated/official | D9 + D10: instance news gets speed *without* breaking the trust bar; Tier B non-sensitive topics can honestly carry a partial badge |
| D14 | **One topic = ONE evolving article.** Story identity == cluster identity. A published cluster **re-rocks** (maturity resets) when new corroborating items arrive → the **same story** (same slug/URL) is regenerated/updated: `date` unchanged, `updated` bumped, append-only `updates[]` revision log, badge upgraded with new evidence. Never a second near-duplicate post. Old revisions stay visible (append, never silently rewrite) | SEO (one growing URL, `dateModified`), reader trust (one evolving story), and the correction-loop rule hold |

> Note: site/design decisions D13–D17 referenced in project memory continue the same series; D13/D14 here are the pipeline-story decisions and keep the numbering monotonic.

## 3. System overview

```
                ┌─────────────────────────────────────────────────────┐
                │               pipeline/ (Node.js)                  │
                │                                                     │
                │  1 FETCH ─► 2 NORMALIZE ─► 3 CLUSTER                │
                │      │           │             │                    │
                │      ▼           ▼             ▼                    │
                │  sources.yaml store.db    clusters.json             │
                │  trust.json  (SQLite)                               │
                │                                                     │
                │  4 VERIFY ──► 5 EXTRACT ──► 6 SYNTHESIZE            │
                │  (badge+      (facts carry  (story.carries          │
                │   evidence)   verified flag) badge + evidence)      │
                │      │                      │                       │
                │      ▼                      ▼                       │
                │  verdicts.db      content/news/*.md (draft)         │
                └──────────────────────────────┬──────────────────────┘
                                               │
               7 REVIEW  (human flips draft → false)
                                               ▼
                ┌─────────────────────────────────────────────────────┐
                │        site/ (Astro, static build)                  │
                │  category·article·badge·evidence·RSS·sitemap        │
                ▼                                                     ▼
           git push ────────────────────► Vercel (free hobby) auto-build
```

Every component is a small, independently testable script. Nothing is a monolith.

## 4. Pipeline stages (detail)

### 1 · FETCH
- **Input:** `pipeline/config/sources.yaml` — one entry per source:
  `{ id, nameBn, nameEn, lang, feedUrl, homeUrl, categories[], reputation }`.
- **Input (new):** `pipeline/config/trust.json` — the **trust register**:
  source reputation (A-tier reputable / B-tier minor / X-blocklist clickbait) +
  official/agency channels per topic area (Police, Fire Service, DMP, ministries, PMO, Met Office,
  BBS…) — each channel is just a page/feed URL we can poll. Built/expanded during Phase 1.
- **Method:** RSS/Atom first (if verified to exist), HTML scraper fallback per source,
  headless-browser fallback (Playwright) if a site is JS-rendered (decided per source after the probe).
  Phase 1 probe determines which method fits which source. No guessing.
- **Politeness:** cache each feed per source ≥30 min; honor `ETag/Last-Modified`; delays; respect
  robots.txt where parseable; back off on 403/429.
- **Output:** `store.db` table `raw_items(seen_at, source_id, url, title, body, published_at, category)`.

### 2 · NORMALIZE
- Clean: strip boilerplate/nav text, normalize Unicode, drop generic titles ("সবশেষ", "আরো পড়ুন").
- **Dedupe** by (a) exact URL hash, (b) near-identical title similarity → mark duplicates,
  never double-process.
- Tag `lang: bn|en`, assign category from feed section or title-keyword rules →
  **category implies tier (A/B/C)** via `tiers` policy in config.

### 3 · CLUSTER (the "same topic" brain)
- Goal: group same-event articles from different sources (and later part-reports from one source).
- **Bengali-aware tokenizer** → **TF-IDF → cosine similarity** over a sliding window (last ~8 h,
  threshold ~0.45).
- **Cluster life:** `open` → `mature` (no new member for N runs) → `closed`. Story is synthesized
  from mature clusters only, so we don't write a half-story.
- Hard rule: one article → exactly one cluster.
- Upgrade path: swap TF-IDF for embeddings later; cluster interface unchanged.

### 4 · VERIFY (the authenticity engine — this is the product's heart)
Ordered by the trust ladder (not by loudness). See §4A for the full spec:
- **Gather** corroboration signals: which *reputable* papers are in this cluster; then an
  **official/agency check** (poll the trust register's channels/SearXNG for the topic); then a
  **contradiction scan** (meta-search for opposing claims / denials / official refutations).
- **Score** each cluster (transparent point system, §4A), assign **confidence badge**, apply the
  **tier policy** (§4A) → `publishable` / `pending_verification` / `blocked` / `send_to_human`.
- **Never publish** without passing the tier threshold (D9). Pending stories *upgrade* automatically
  as new corroboration arrives.
- Output: `verdicts.db` table `verdicts(cluster_id, badge, score, signals[], tier, status)`,
  plus per-cluster evidence list (source/link/type).

### 5 · EXTRACT (facts with proof)
- LLM (or deterministic extractor) produces structured facts per article:
  `{ fact, source: source_id, url, excerpt, time }` — who/what/where/when/how-many/quotes/status.
- Facts deduped across articles; each fact inherits **corroboration count + verified flag** from the
  cluster's verified members.
- Contradictions kept flagged (`conflict: true`, both versions listed) — never silently picked.
- Motion rule (D3): facts are the ONLY raw material for the story; no invented detail.
- Output: `store.db` table `facts(cluster_id, fact, source_id, url, excerpt, published_at, verified, conflict)`.

### 6 · SYNTHESIZE (one detailed Bengali story + badge)
- LLM receives: verified facts with source refs, best titles, **short excerpts only** (never full
  bodies), style guide, and the cluster's **verdict badge**.
- Produces `site/src/content/news/<slug>.md` with front matter
  `title, categories, date, sources[], draft: true, summary` **and**
  `verification: { badge, tier, evidence[] }`.
- Body = coherent Bengali story: angle lead → deeper than any single source →
  time-line when the topic unfolded part-by-part → `সূত্র:` + **প্রমাণ (evidence)** list with links.
- For Tier A, story text is written **only from verified facts**; single-source details are omitted
  or marked as awaiting confirmation.
- Style guide (`pipeline/config/style.md`): neutral, no hype, no fabricated quotes, headline ≤ 80 chars.

### 7 · REVIEW (human gate)
- Editor opens pending drafts; UI/CLI shows each draft **with its verdict, evidence list, and any
  conflict flags** for fast fact-checking. Flip `draft: false` only when satisfied.
- Stories below threshold never appear as publish candidates (they are in `pending_verification`).

### 8 · PUBLISH
- `git add` reviewed files → `git push` → **Vercel** builds `site/` (Astro), deploys.
- Astro generates: homepage grid (সর্বশেষ), 9 category pages, article pages (with badge + evidence),
  RSS, sitemap. Served on `https://<project>.vercel.app` (no domain yet).

## 4A · VERIFY engine spec (trust core)

### Trust register (`config/trust.json`)
- `sources.reputation`: `top` (major reputable dailies), `minor`, `block` (known clickbait/fake
  impersonators — their links never count as evidence).
- `channels`: official/agency topics → page/feed URLs, e.g.
  `{ "topic": "fire", "name": "Fire Service", "feed": "…facebook…|…rss…" }`.
- `blocklist`: domains that impersonate real newspapers (e.g. lookalike `.info` domains).

### Scoring (transparent, every point explainable in UI)
| Signal | Points |
|---|---|
| Each additional *top* paper corroborating core facts | +2 |
| Official/agency channel confirms the event | +3 |
| Journalist/eyewitness from a reputable outlet | +0.5 (Phase+ social) |
| Each contradiction found (source/Official refutation) | −1 |
| Sole source is `minor`/unverified channel | −2 |

### Badge mapping (thresholds)
| Score | Badge | Published? |
|---|---|---|
| ≥5 (incl. an official signal) | **যাচাইকৃত** (verified) | Tier A/B always |
| ≥3 | **নিশ্চিত** (confirmed) | Tier A (min), Tier B always |
| 2 | **একক/আংশিক** (partial, single-source) | Tier B only; never Tier A |
| ≤1 | **সন্দেহজনক** (suspect) | never — → human check queue |

### Tier policy
- **Tier A** (sensitive/breaking: accident, crime, politics, health, prices, weather): minimum
  **নিশ্চিত**, prefer **যাচাইকৃত**. Synthesis only from verified facts.
- **Tier B** (routine: sports, entertainment, business): minimum **একক/আংশিক**, normal speed.
- **Tier C** (opinion/analysis): labeled মতামত/বিশ্লেষণ; no claim verification, clearly attributed.

### Correction loop
- New info contradicts a published story → badge downgraded, status `সংশোধন প্রয়োজন`, shown on the
  page; auto-reconciled only with explicit evidence, else flagged for human. Old version kept visible
  (append, never silently rewrite).

### Honest limits (free budget)
- v1 social signals = official pages/feeds + **SearXNG meta-search** (self-hosted on VPS, free)
  used like a human fact-checker's search. Direct X/FB scraping is **deferred** (APIs paid, fragile).
- Comments are never "proof" — they are red flags that may surface contradictions (D11/D12).

## 4B · Breaking lane & story updates (instance news + unfolding topics) — D13/D14

Handles exactly the "12:00 announcement → 15:00 event happens" case and ad-hoc instance
news (gadget approval, fire incident, launch…) without betraying the verification bar.

### Two-track publication model
- **Track 1 — breaking ALERT (fast, thin, honest).** Eligible for **Tier B only** (tech,
  business, entertainment, routine topics). Publishes in ~1 run (~30–60 min) with a single
  reliable source if the headline is clear; badge `একক/আংশিক`; short factual body (what is
  known + source links); the excerpt/headline plainly states **"বিস্তারিত আসছে"** (details
  pending). The partial badge *is* the honesty — no claim of full verification.
- **Track 2 — FULL story (the SAME topic → the SAME post).** When corroboration arrives
  (event happens, more papers report, official channel confirms), the cluster re-rocks and
  the **same URL** is regenerated: upgraded title/lede, full details + timeline
  (12:00 announcement → 15:00 event), evidence list grown, badge upgraded
  (`একক/আংশিক → নিশ্চিত/যাচাইকৃত`). Never a new post for the same topic.
- **Tier A never uses Track 1.** A fire/accident/crime stays in `pending_verification` until
  it clears `≥ নিশ্চিত` (+ official signal where available). Breaking speed is a Tier B perk
  only — that is the deliberate trust-over-speed trade (risk #7).

### Cluster life with stories
- `open → mature → closed`, plus: a **published cluster never closes while it is the same
  topic** — each new member resets the maturity timer (re-rock) and triggers a story
  **update** on the next mature pass, not a new story.
- A cluster only generates a **new** story when (a) no new member for N runs AND (b) no story
  exists yet, or the topic has genuinely split (verified divergent facts) — rare, human-reviewed.
- One article → exactly one cluster → one story/one slug (hard rule, mirrors cluster rule).

### Data model additions
- `stories` gains `updated_at` (ISO) + `updates` (JSON list of `{ date, note, badge, score }`,
  append-only) + `releases` (JSON snapshot of each past story state — the visible revision
  history; never silently rewritten, consistent with the correction loop).
- `clusters` status adds `living` for published-and-still-updatable clusters.

### Site/UI requirements
- Article header shows original `date` **and** "সর্বশেষ আপডেট: `updated`" when present.
- An **আপডেট ইতিহাস** (update history) block lists the append-only `updates[]` with times —
  readers see exactly how the story evolved and that the badge was upgraded.
- JSON-LD already emits `dateModified` from `updated` (site scaffold ships this).

## 5. AI provider interface (D4)

`pipeline/config.yaml`:
```yaml
ai:
  provider: local        # local | gemini
  local:
    model: Qwen2.5-3B-Instruct-Q4_K_M   # llama.cpp server
    server: http://127.0.0.1:8082
  gemini:
    model: gemini-2.x-flash
    apiKeyEnv: GEMINI_API_KEY
```
Both implement `extractFacts(items)`, `writeStory(facts, style)`. Switching = one value.
- `local`: llama.cpp OpenAI-compatible server; small quantized model (Qwen2.5 / Gemma-2). Honest
  expectation: **passable Bengali, must be fact-checked** — exactly why VERIFY+facts run before it.
- `gemini`: Google free tier; better Bengali; also free at site scale; key via env var only.

## 6. Site (Astro) — D5

```
site/
  astro.config.mjs          # output:'static', sitemap+RSS
  public/                   # favicon, og-image, robots.txt
  src/
    content/news/*.md       # pipeline output (draft:true till reviewed)
    content.config.ts       # schema incl. verification badge + evidence[]
    layouts/Base.astro      # Bengali, mobile-first
    components/             # Card, CategoryPill, VerificationBadge, EvidenceList, SourceList
    pages/
      index.astro           # সর্বশেষ grid (badges visible)
      categories/[cat].astro
      news/[...slug].astro  # article page + badge + full evidence list
      rss.xml.js
```
- **VerificationBadge** + **EvidenceList** are first-class UI: readers see the confidence level and
  every source/proof link on every card and article (this is the honest trust promise — D12).
- Bengali typography: system + Noto Sans Bengali (fontsource, self-hosted, free).

## 7. Data model (SQLite `store.db` + `verdicts.db`)

| Table | Key columns |
|---|---|
| raw_items | id, source_id, url(unique), url_hash, title, body, published_at, seen_at, category, lang, dup_of_id |
| clusters | id, status(open/mature/closed/**living**), tier, first_seen, last_update, member_count, headline |
| cluster_members | cluster_id, item_id, score, added_at |
| verdicts | cluster_id(unique), badge, score, signals(json), tier, status(publishable/pending/blocked/human), decided_at |
| facts | id, cluster_id, fact, source_id, url, excerpt, published_at, verified, conflict, resolved |
| stories | cluster_id(unique), slug, status(draft/reviewed/published), verification(json mirror), updated_at, updates(json append-only), releases(json snapshots), written_at |
| meta | fetch_history(source_id, fetched_at, etag, modified, http_status) |

All state is resumable; runs are idempotent (safe to re-run after a crash).

## 8. Security, legal & ethics

- **Copyright:** only short excerpts feed the LLM; site publishes original synthesis; every story
  links all sources and states `সূত্র:`. Never mirror images/full articles.
- **Accuracy:** fact→source traceability (D3), contradiction flags open, draft-first (D2), and the
  **only-publish-verified** bar (D9).
- **Neutrality:** style guide bans partisan/hype language; coverage mirrors the sources, not our bias.
- **Anti-fake:** blocklist of impersonator/clickbait domains; `block` sources are never evidence.
- **No secrets:** API keys in env vars only; `.gitignore` for `config.yaml` secrets.
- **Politeness:** robots.txt, fetch intervals, honor 403/429, per-source ETag caching.

## 9. Operations

- **Run modes:**
  - Manual/testing (now): `node pipeline/run.js fetch|normalize|cluster|verify|extract|synth`
    from Termux with opencode — each stage independently callable.
  - Automated (later): same commands under cron/systemd on the VPS; all stages idempotent.
- **Cadence:** 30 min default; configurable windows + cluster thresholds.
- **Logging:** `pipeline/logs/YYYYMMDD.log`; failures never destroy prior state.

## 10. Build phases (deliverables per phase)

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 1 Fetch + trust | `probe_feeds.mjs`; `sources.yaml` (verified per source + method); `trust.json` seed (reputations + first official channels); `fetch.js` | All 12 sources returning real items + basic trust/blocklist in place |
| 2 Normalize | `normalize.js`, dedupe, category→tier mapper | New/dup counts correct; boilerplate gone |
| 3 Cluster | `cluster.js` (Bengali TF-IDF) | Same topic from ≥2 sources → 1 cluster |
| 4 Verify | `verify.js` (gather official/SearXNG signals, score, badge, tier policy); `verdicts.db`; human-check queue | Verdicts correct on a hand-labelled sample (badge matches human judgment) |
| 5 Extract+Synth | `extract.js`, `synth.js` (+ llama.cpp local, Gemini swap); badge+evidence written to front matter; **re-rock → story update path (`updated_at` + append `updates[]`)** | Draft .md per mature *publishable* cluster with correct badge+evidence; updates regenerate the SAME slug |
| 6 Site | Astro build with badge/evidence UI; **updated-at + আপডেট ইতিহাস UI**; breaking lane alert style | Local build: categories, articles, badges, RSS |
| 7 Deploy+Expand | Vercel project + git flow; full sources; 30-min automation | Reviewed & verified story live on vercel.app; pipeline unattended |

## 11. Open questions / risks (for review)

1. **Feed availability** unverified for most of the 12 → Phase 1 probe picks RSS/scraper/headless
   per source (sources may end up mixed-method).
2. **Local model Bengali quality** mediocre → can ship Phase 5 with `provider: gemini` for quality,
   local stays a config option. User's call.
3. **SearXNG needs hosting** on the Servarica VPS for the official/contradiction search signal
   (free, but a new piece to install later).
4. **Official-channel list** is the weak point for Tier A — it needs care (which FB pages/rss are
   genuinely official) and maintenance. We grow it defensively, verified manually at seed time.
5. **Badge calibration:** start thresholds above, adjust only after a human-labelled sample run.
6. **Domain TBD** — testing lives on `*.vercel.app`.
7. **Cadence vs verification:** verification delays publication (maturity + signal gathering).
   Accepted trade-off — trust over speed. Breaking news may lag by a run or two; that is the
   point. Mitigation for Tier B instance news = the **breaking fast lane** (D13, §4B).

## 12. Recommended next step (only after architecture approval)

Phase 1 probes — read-only:
1. Probe each candidate source for working RSS; note which need scraper/headless.
2. Seed the trust register: reputations for the 12 + the first ~10 verified official/agency channels
   (only ones Zulfikar / docs confirm as genuine).
3. Deliver `sources.yaml` + `trust.json` seed + probe report.
No fetching automation, no installs, no site code until this passes.