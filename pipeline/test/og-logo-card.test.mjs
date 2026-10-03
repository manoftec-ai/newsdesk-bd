import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SITE = join(import.meta.dirname, '../../site/src');
const base = readFileSync(join(SITE, 'layouts/BaseLayout.astro'), 'utf8');
const PUBLIC = join(import.meta.dirname, '../../site/public');

const CARD = join(PUBLIC, 'images/og-jachaidesk-logo.png');
const ART = join(PUBLIC, 'brand/jachaidesk-logo.png');

test('the default OG card exists and is exactly the Open Graph spec size', () => {
  // Facebook/X both reject anything that is not 1200x630 for a large card, and
  // a mis-sized card is the usual reason a preview renders as a tiny thumbnail.
  assert.ok(existsSync(CARD), 'images/og-jachaidesk-logo.png is missing from public/');
  const png = readFileSync(CARD);
  assert.equal(png.subarray(1, 4).toString(), 'PNG', 'the card must be a real PNG');
  // IHDR width/height live at bytes 16..24, big-endian.
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, 1200);
  assert.equal(height, 630);
});

test('the card is opaque, because scrapers flatten transparency unpredictably', () => {
  // A transparent OG image can be composited onto black by some crawlers and
  // ignored by others, so the shipped card carries its own background.
  const png = readFileSync(CARD);
  assert.equal(png[25], 2, 'expected an RGB (no alpha) PNG — colour type 2');
});

test('the logo artwork ships with real transparency', () => {
  assert.ok(existsSync(ART), 'brand/jachaidesk-logo.png is missing');
  const png = readFileSync(ART);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png[25], 6, 'expected RGBA — colour type 6 — so the black ground can be removed');
});

test('the dead black padding was cropped away', () => {
  // The supplied file was a 1200x630 preview whose logo occupied only 43% of the
  // width. Left uncropped the mark renders small and lost inside the card.
  const png = readFileSync(ART);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.ok(width < 1200, `artwork is still the full 1200px wide (${width}) — not cropped`);
  assert.ok(width / height > 1.2 && width / height < 1.8, `unexpected artwork aspect ${(width / height).toFixed(2)}`);
  assert.ok(height <= 630, `artwork is still full height (${height})`);
});

test('the default OG image is the logo card', () => {
  assert.match(base, /ogImage \|\| "\/images\/og-jachaidesk-logo\.png"/);
});

test('the previous OG card is kept, so the change is one line to revert', () => {
  assert.ok(
    existsSync(join(PUBLIC, 'images/og-default-v2.png')),
    'og-default-v2.png was deleted — the logo change is no longer reversible by editing one line',
  );
});

test('og:image:type reports the real MIME type', () => {
  // Was `.png ? image/png : image/webp`, which declared image/webp for a JPEG.
  // A wrong MIME type makes some scrapers discard the card entirely.
  assert.match(base, /"image\/png"/);
  assert.match(base, /"image\/webp"/);
  assert.match(base, /"image\/jpeg"/);
  assert.doesNotMatch(
    base,
    /ogImageUrl\.endsWith\("\.png"\) \? "image\/png" : "image\/webp"/,
    'the two-way MIME guess is back',
  );
});

test('the declared card dimensions match the shipped card', () => {
  assert.match(base, /ogImageWidth = 1200/);
  assert.match(base, /ogImageHeight = 630/);
});