# 2026-10-02 — Logo installed as the Open Graph card

## Request
User sent a ChatGPT share link as "the logo" and asked for it to be set on the
site. Then: **"can u make it transparent"** + **social/OG preview only**.

## Getting the asset
The share page is JS-rendered, so a plain fetch returns no image. The image is
the `og:image` meta pointing at a ChatGPT estuary URL — and that asset is
**1200x630**, exactly OpenAI's social-preview size. It is a preview render, not a
source file. There is no original PNG/SVG behind that link.

## Why measurement came first
The instinct was "white background, so remove white". Measurement said otherwise:

| property | measured |
|---|---|
| border colour | 100% `rgb(0,0,0)` |
| near-white anywhere | 0% |
| artwork colour | dark navy `(21,38,58)` |
| brightest content | luma 163 (the wordmark is LIGHT) |
| artwork coverage | 43% of width, 54% of height |
| interior pure black | 88.18% |

Two consequences:
- **transparent means removing black**, not white;
- the logo is **light-on-dark** artwork, so transparency makes the wordmark
  invisible on a light surface.

Checked the surfaces before compositing: header is `bg-background/85` (light),
`og-default-v2.png` is light cream `(246,234,233)`. Pasting onto either would have
hidden the wordmark. Used the brand dark `#2b231c` from `public/favicon.svg`.

## Built
- `site/public/brand/jachaidesk-logo.png` — 545x363 RGBA. Cropped to the measured
  content bbox with a 12px pad. Black removed at a hard `luma <= 12` cutoff, so
  navy (luma ~35) and the wordmark stay fully opaque. A soft ramp was rejected
  because it erodes the mark's anti-aliased edge.
- `site/public/images/og-jachaidesk-logo.png` — 1200x630 opaque card, artwork at
  62% width centred on `#2b231c`. Verified: corners brand dark, **0 pure-black
  pixels** (no rectangle), luma max 173 (wordmark intact).

Opaque on purpose: transparent OG images get composited onto black by some
crawlers and ignored by others.

## Bonus fix
`og:image:type` was `.png ? image/png : image/webp`, which declared `image/webp`
for every JPEG. Now returns png/webp/jpeg correctly.

## Verified live
- card URL → 200, `image/png`, 124,717 bytes, 1200x630 RGB, **byte-identical** to
  the repo file
- homepage `og:image` = new card, width 1200, height 630, type `image/png`
- article pages still use their own image (unchanged)
- 6-route sweep 200

Suite **495/495**, +8 tests in `pipeline/test/og-logo-card.test.mjs`.

## Open caveats
1. **Nobody has seen this logo.** No vision in this model — spelling, colour and
   balance are unverified. Human eye required before trusting it.
2. Default social card is now **dark**; previous cards were light cream.
3. `og-default-v2.png` kept, so revert is one line.
4. A re-share from the original generator may yield a transparent/vector original
   that would allow a favicon and header logo too.
