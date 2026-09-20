---
Title: Newsdesk-bd instalasi non-interaktif berbasis GitHub (Hybrid) — penjadwalan penulis + kartu brand
Date: 2026-09-19
Status: In progress (rekap tujuan + artefak; tahap selanjutnya = set LLM secret di repo)
Sessions reference: this session
---

# 2026-09-19 — Authoring & branding on GitHub (Hybrid)

## Tujuan pengguna
- "For processing image we have to rely on github cause i cant open my termux always"
- "Is it possible through github? Can we make it happen through github? … including the
  authoring and the whole publishing."
- Requirement tetap (global, permanen): setelah APAPUN modifikasi di repo git → commit + push
  otomatis (§5.6 AGENTS.md).

## Jawaban arsitektural (Hybrid — keputusan user "Hybrid")
Dua lapis pengoperasian berjalan **sepenuhnya di GitHub Actions**, tanpa perlu Termux selalu terbuka:

1. **Lapisan pipeline (sudah jalan sejak 2026-09-19)** — `pipeline.yml` (fetch → normalize →
   cluster → verify → extract → briefs) berjalan via cron `*/30` + deploy Vercel otomatis.
2. **Lapisan penulis (BARU — sesi ini)** — cerita berbahasa Bengali sekarang **dapat** ditulis
   oleh GitHub Actions memakai **API LLM gratis** (Gemini free tier default).
3. **Lapisan gambar brand (BARU)** — setiap cerita mendapat thumbnail WebP 1200×675 ber-merek
   "নিউজডেস্ক বিডি" (Openverse → foto bebas-lisensi + overlay brand, atau kartu brand fallback).

## Yang dibuat (artefak sesi ini)

### pipeline/lib/llm.mjs — klien LLM HTTP provider-agnostic (OpenAI-compatible)
- Dipakai oleh tools penulis; memungkinkan tahap *writing* berjalan di GH Actions.
- Konfigurasi via env (default = free tier, semuanya bisa diganti):
  - `LLM_BASE_URL` — default `https://generativelanguage.googleapis.com/v1beta/openai`
  - `LLM_MODEL` — default `gemini-2.5-flash`
  - `LLM_API_KEY` — WAJIB ada (dipakai sebagai GH secret), atau `LLM_API_KEY_FILE`
    yang menunjuk file berisi token (disarankan utk run lokal agar token tidak pernah
    masuk history shell).
- Exports: `LLM_CFG`, `llmApiKey()`, `chatComplete(messages, {cfg, key})` → text / null.
- `chatComplete`:
  - Cutoff-safe: `llmApiKey()` async (import `node:fs` di dalamnya sudah valid — bukan
    `await import` di function non-async seperti sebelumnya).
  - Membuat request chat completions; timeout dari cfg; non-OK → lempar error deskriptif.
  - Mengembalikan `j?.choices?.[0]?.message?.content ?? null`.

### pipeline/tools/author_stories.mjs — penulis batch CLI (Hybrid)
- CLI: `--limit=8` `--dry-run` `--slug=<slug>` dll.
- Alur per brief: `listBriefs()` → filter belum-publish (`storyExists`) + plausibilitas
  (`briefPlausible`) → urutan newest-first → `writingPrompt(brief)` → `chatComplete`
  (pakai API) → `finalizeStory(slug, body, {siteDir})`.
  - **finalizeStory sudah secara internal memanggil `stripEditorialFooters()`** → footer
    editor "পর্যালোচনার অপেক্ষায়/খসড়া" TIDAK akan lolos, ke mana pun body berasal
    (opencode atau API). Persis aturan lama.
- Tanpa `LLM_API_KEY` → **no-op exit 0** (tidak merusak cron; penulisan tetap via opencode).
- `--dry-run` terbukti: 24 brief belum-publish terdeteksi, idempoten.

### .github/workflows/author.yml — workflow penulis terjadwal (BARU)
- Trigger: schedule cron `23,53 * * * *` (offset dari pipeline `0,30` dan images `17,47`
  agar tidak bentrok) + manual dispatch. Non-interaktif, tak perlu Termux.
- Steps: checkout → setup-node 24 → install fonts-noto-bengali (utk sharp SVG/WebP) →
  npm ci → `node tools/author_stories.mjs` → `node tools/add_images.mjs --strategy=mix`
  → commit + push (auto-publish; trigger Vercel deploy + images path).
- Konfigurasi LLM via **GH secrets**: `LLM_API_KEY` (wajib), opsi `LLM_BASE_URL`,
  `LLM_MODEL`, `LLM_MAX_TOKENS`.
- Tanpa key → step authoring & images di-skip (guard `LLM_API_KEY != ''`), commit tetap
  aman (guard diff). → saat user punya key, tinggal isi 1 secret, tidak perlu ubah kode.

### .github/workflows/images.yml — sadar GitHub, tanpa Termux
- Schedule `17,47 * * * *` + push paths + manual. Memakai `sharp` (locked di
  pipeline/package-lock.json, sharp ^0.33.5 di package.json) + font Bengali.
- `lib/images.mjs` (brand overlay + kategori card) + `tools/add_images.mjs` (CLI idempoten).
- Semua gambar commit ke `site/public/images/*.webp` → Vercel deploy otomatis.

## Status & next step
- [x] lib/llm.mjs (valid syntax, exports terverifikasi)
- [x] tools/author_stories.mjs (dry-run berhasil: 24 pending, idempoten, no-op tanpa key)
- [x] .github/workflows/author.yml + images.yml (dibuat)
- [ ] PUSH perubahan ini (belum dilakukan karena sesi paralel lain sedang memodifikasi repo;
      perlu koordinasi git agar tidak tabrakan commit). PEMBARUAN: session resmi lain sdh
      commit+push SEO; perubahan hasilkarya sudah di-track; tunggu serah terima sebelum push.
- [ ] Set GH secret `LLM_API_KEY` (mode-appropriasi: pakai free key; hindari key berbayar).
- [ ] Setelah secret ada → jalankan sekali manual dispatch author.yml untuk uji end-to-end.

## Catatan operasi
- Font Bengali utk sharp harus di-install di runner (apt fonts-noto-bengali) — sudah di workflow.
- `npm ci` di GH Actions memakai sharp linux-x64 (optional dep) — package-lock sudah sinkron.
- Budget zero/low: default base URL/model = Gemini flash free tier; tidak ada biaya tersembunyi.
