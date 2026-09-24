# Session 2026-09-24 — D76: search wiring fixed

## Context
Carried over from prior session: the P1 depth queue item was **search**, with an
unresolved suspicion that the live Pagefind index was broken (earlier probes found
`index/*.pf_index` → 404 and `pagefind-entry.js` → 404, while the meta file hash was
`bn_cc7887bc90`).

## Investigation — the earlier "search broken" verdict was wrong
- Probed the live `pagefind-entry.json` again: the language hash had **changed** to
  `bn_dcb414569d` (page_count 595). The site had been **auto-redeployed** since the
  earlier probes (worker pushes → new deploy → new index bundle), so the previous session
  was probing a **stale deployment** whose index chunks no longer resolved.
- On the CURRENT deployment every asset returns 200:
  - `pagefind.js`, `pagefind-worker.js`, `pagefind-ui.js`, `pagefind-ui.css`,
    `pagefind-highlight.js`, `pagefind-component-ui.js/.css`, `pagefind-entry.json`,
    `pagefind.bn_dcb414569d.pf_meta`
  - `fragment/*.pf_fragment` — 605 files (content pages, valid gzip+JSON)
  - `index/*.pf_index` — 9 index chunks (the 605 "hashes" from meta are mostly fragment
    names; the true index-chunk hashes were found by probing — 9 resolve 200)
- `pagefind-entry.js` → 404: confirmed **not** a deployment problem. It is a v0.x-era
  shim that Pagefind v1.5 no longer emits; `pagefind-ui.js` self-imports `pagefind.js`
  from its own `bundlePath` (defaults `/pagefind/`).
- `pagefind-ui.css` exists and serves (200, 14KB) but was **never linked** by the page.

## Real defects found & fixed
`site/src/pages/search.astro`:
1. **Critical:** `init` was bound to `focusin` on `#search`, a div with **no focusable
   child until PagefindUI mounts** → `init` never fired → search box showed
   "খোঁজার বাক্স লোড হচ্ছে…" forever. Now inits on `DOMContentLoaded` (and runs
   immediately if the document is already loaded).
2. Removed the dead `await loadScript("/pagefind/pagefind-entry.js")` (404 every visit).
3. Added `loadStylesheet()` to inject `/pagefind/pagefind-ui.css` (deduped against an
   existing `<link>`), so results render styled rather than unstyled HTML.

`site/src/layouts/BaseLayout.astro`:
- Added `data-pagefind-body` on `<main>` so Pagefind indexes page content only and skips
  header/footer/chrome (the build log previously warned no `data-pagefind-body` element
  was found and indexed all `<body>`).

## Verification
- Full pipeline test suite: **183/183 pass** (site-only changes; no pipeline tests touched).
- Could not run `astro build` locally (Termux `satteri` android-arm64 binding missing —
  pre-existing; Vercel build is the authority). Pagefind CLI also cannot run in Termux
  (no android-arm64 binary) — index verification done via live HTTP probes.

## Commit
- `c6b8bca` — fix(search): wire Pagefind search UI to initialize on load + style it
- Memory: MEMORY.md D76 row + header, MEMORY.json decisions[0]=D76, sessionsCount 51.

## Notes / lessons
1. **Always confirm the current alias-target deployment before diagnosing a live-site
   regression** — auto-deploys churn constantly while workers push, and a hash that
   404s on the stale deployment is meaningless.
2. Don't bind lazy init to an event on an element that is not focusable until after init
   completes (focusin on an empty div never fires).
3. Pagefind v1.5.2 has **no `pagefind-entry.js`** — that file is v0.x-era; the UI
   self-loads the core API.

## Next (P1 queue after search)
- Entity pages → then Why-This-Badge (parked until user activation).
