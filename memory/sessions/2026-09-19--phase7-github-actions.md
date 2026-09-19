# Session log — 2026-09-19 — Phase 7 done: GitHub Actions automation live

## Context
Follow-up to `2026-09-19--phase5-6-auto-publish.md`. Phase 7 had been blocked on GitHub
credentials (/repo). User then supplied a classic PAT (created repo earlier was not possible with
fine-grained PATs).

## What was done
1. **Credential upgrade (global/permanent)**: classic PAT `ghp_WvL…Cmca4` stored in
   `~/.config/opencode/.secrets/github.env` (chmod 600), `~/.git-credentials` updated, global
   `AGENTS.md` §5.5 updated (classic PAT, full repo+workflow scope, CAN create repos). First token
   given in this thread was fine-grained → still 403 on repo create; classic PAT worked.
2. **Repo created**: `manoftec-ai/newsdesk-bd` (PUBLIC — GH Actions free/unlimited minutes; 30-min
   cron ≈1440 runs/mo would blow the 2000-min private quota).
3. **Pushed**: `git init -b main`, initial commit (pipeline libs + 25 briefs + store.db in
   `pipeline/state/` + site + workflows + memory; no secrets), remote origin, push main. Note:
   needed `git config --global --add safe.directory '…newsdesk-bd'` for storage-FUSE ownership.
4. **VERCEL_TOKEN secret**: GitHub Actions secrets are X25519/libsnodium `crypto_box_seal` (NOT
   RSA — the public-key endpoint returns a 32-byte base64 key). Installed `libsodium-wrappers`
   (pure JS), encrypted, PUT, verified secret present.
5. **deploy.yml fix**: first deploy on initial push failed because (a) secret not yet set, (b) no
   `--scope man-of-technology --name newsdesk-bd` → would create a NEW Vercel project. Added
   `--name newsdesk-bd --scope man-of-technology`. Manual dispatch → **deploy success**, site still
   200 everywhere.
6. **pipeline.yml run** (workflow_dispatch): fetch → normalize → cluster → verify → extract →
   **33 briefs written & auto-committed** (`f390fc7c`) by bot `newsdesk-bd-bot`. Confirmed cron is
   registered (`*/30 * * * *`); both workflows state=active.

## Testing
- Deploy workflow: manual dispatch success; production site all 200 (/, /news, /rss.xml, article).
- Pipeline workflow: success; extract wrote 33 briefs (up from 25 — fresh data from real fetch).
- Live site still shows dengue story on homepage.

## Current state / next
- Site live; both GH workflows active; 30-min cron running.
- Repo: https://github.com/manoftec-ai/newsdesk-bd (public), main branch.
- Next: author briefs → stories (opencode, in-session), decide cadence; monitor cron health
  (BD sites may block GH runner IPs).

## Known problems / warnings
- GH Actions "Node 20 deprecated" warnings on checkout (harmless).
- Fine-grained PATs cannot create repos (permanent GH rule) — classic PAT now stored.
- Cron runs on public repo only guarantee free time; repo is public by design.