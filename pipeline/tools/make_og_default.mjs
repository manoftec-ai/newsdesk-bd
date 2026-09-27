#!/usr/bin/env node
// tools/make_og_default.mjs — generate the fallback social image.
// SEO audit 2026-09-27: hub pages (home, category, tags, ghotona) fell back to
// og-default.svg as og:image, which Facebook/X crawlers cannot render — every
// share of a hub page showed a broken image. This renders a 1200x630 PNG with
// the current যাচাইডেস্ক brand (same SVG+sharp path + font stacks as the
// article branded cards in lib/images.mjs, so Bengali shaping matches).
//
// Runs on GitHub Actions (sharp has no android-arm64 build, so Termux cannot
// run it — same reason thumbnails are built by images.yml, not locally).
// Idempotent: skips when og-default.png exists unless --force.
//
// Usage: node tools/make_og_default.mjs [--force]
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '../../site/public/images/og-default.png');
const FORCE = process.argv.includes('--force');

async function getSharp() {
  const mod = await import('sharp');
  return mod.default ?? mod;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a8281f"/>
      <stop offset="1" stop-color="#1a1a1a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect width="1200" height="14" fill="#ffffff" opacity="0.9"/>
  <rect x="90" y="120" width="12" height="90" rx="6" fill="#ffffff" opacity="0.9"/>
  <text x="120" y="200" font-family="Noto Serif Bengali, Noto Sans Bengali, serif" font-size="92" font-weight="700" fill="#ffffff">যাচাইডেস্ক</text>
  <text x="122" y="290" font-family="Noto Sans Bengali, sans-serif" font-size="40" font-weight="600" fill="#ffffff" opacity="0.95">বাংলাদেশের সবচেয়ে যাচাই-করা সংবাদ</text>
  <text x="122" y="540" font-family="Noto Sans Bengali, sans-serif" font-size="30" fill="#ffffff" opacity="0.8">jachaidesk.com</text>
</svg>`;

async function main() {
  if (existsSync(OUT) && !FORCE) {
    console.log('og-default: exists, skipping (use --force to rebuild)');
    return;
  }
  const sharp = await getSharp();
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(OUT, png);
  console.log(`og-default: wrote ${OUT} (${png.length} bytes)`);
}

main().catch((err) => {
  console.error(`og-default: FAILED: ${err.message}`);
  process.exit(1);
});
