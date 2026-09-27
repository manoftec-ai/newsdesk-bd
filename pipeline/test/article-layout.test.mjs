// test/article-layout.test.mjs — the article page's layout contract.
//
// 2026-09-27. Four separate regressions of the same kind, reported one at a time
// by the user, each of which had to be found and fixed again:
//
//   1. an excerpt/standfirst under the headline
//   2. a photo credit under the image, from thumbnailAlt used as a figcaption
//      and as the img alt
//   3. a "সূত্র" line beside the date, duplicating the source list
//   4. a "সূত্র" block under the story, duplicating the প্রমাণ দেখুন panel
//
// Each was fixed where it was visible and came back from a different render
// site, because nothing recorded the decision. This test is that record: it
// reads the templates and fails if any of them draws a thing the user asked to
// have removed. It does not try to prove the page looks right - it proves the
// removed markup is absent, which is what kept coming back.
//
// It reads source rather than rendered output on purpose. A rendered check
// needs a full site install, and a test that cannot run in CI is not a guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SITE = join(import.meta.dirname, '../../site/src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.astro') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.astro')) out.push(p);
  }
  return out;
}

const templates = walk(join(SITE, 'pages')).concat(walk(join(SITE, 'components')));
const article = readFileSync(join(SITE, 'pages/article/[slug].astro'), 'utf8');
const index = readFileSync(join(SITE, 'pages/index.astro'), 'utf8');
const card = readFileSync(join(SITE, 'components/PostCard.astro'), 'utf8');

test('no excerpt or standfirst is rendered under any headline', () => {
  // the deck under the article headline
  assert.ok(
    !/standfirst && \(/.test(article),
    'article page renders a standfirst under the headline again',
  );
  // the excerpt under the homepage lead headline
  assert.ok(
    !/\{lead\.excerpt\}/.test(index),
    'homepage lead renders {lead.excerpt} under the headline again',
  );
  // the excerpt under the hero card headline
  assert.ok(
    !/\{post\.excerpt\}<\/p>\s*<div class="mt-4 text-xs/.test(card),
    'PostCard hero variant renders the excerpt under the headline again',
  );
  // the excerpt must still reach the machine-readable places
  assert.ok(/articleBody: post\.excerpt/.test(article), 'JSON-LD lost the articleBody excerpt');
  assert.ok(/post\.seoDescription \?\? post\.excerpt/.test(article), 'meta description lost the excerpt');
});

test('no photo credit is rendered under any image', () => {
  // a visible caption carrying the credit
  assert.ok(
    !/<figcaption[^>]*>\s*\{post\.thumbnailAlt\}/.test(article),
    'article page renders a figcaption with the photo credit again',
  );
  // the credit leaking through the img alt, which shows whenever an image fails
  for (const file of templates) {
    const src = readFileSync(file, 'utf8');
    assert.ok(
      !/alt=\{\w+\.thumbnailAlt \|\| ""\}/.test(src),
      `${file} renders the raw thumbnailAlt, which still contains "ছবি: <outlet>"`,
    );
  }
  assert.ok(
    !/text-sm font-bold">সূত্র<\//.test(article),
    'the "সূত্র" heading block is back',
  );
});

test('no সূত্র line beside the date, and no সূত্র block under the story', () => {
  // the byline that used to sit left of the date
  assert.ok(
    !/\{byline &&/.test(article),
    'the সূত্র byline is rendered beside the date again',
  );
  // and the byline that built it
  assert.ok(
    !/const byline = /.test(article),
    'the dead byline IIFE is back',
  );
  // the source list under the main news, duplicating the evidence panel
  assert.ok(
    !/post\.sources\.length > 0 && \(/.test(article),
    'the সূত্র source list under the story is rendered again',
  );
  assert.ok(
    !/class="source-list/.test(article),
    'the source-list block is back under the story',
  );
});

test('the প্রমাণ দেখুন panel renders BELOW the story, not above the headline', () => {
  const h1 = article.indexOf('<h1');
  const panel = article.indexOf('class="evidence-panel');
  assert.ok(h1 > 0, 'could not find the article h1');
  assert.ok(panel > 0, 'could not find the evidence panel');
  assert.ok(
    panel > h1,
    'the evidence panel is above the headline again - it must sit below the main news',
  );
  // and it must come after the body, not merely after the h1
  const body = article.indexOf('id="update-history"');
  assert.ok(
    panel < body,
    'the evidence panel must come before the update history, i.e. after the body',
  );
});

test('the verification status is stated once, not twice above the story', () => {
  // 2026-09-27: the header badge and the badge-legend paragraph printed the same
  // sentence - "নিশ্চিত [A] — দুই বা ততোধিক স্বাধীন সংবাদসূত্রে তথ্য মিলে গেছে" -
  // one above the headline and one under the date, so the reader met "নিশ্চিত"
  // twice in the same words before reaching the story.
  assert.ok(
    !/class="badge-legend"/.test(article),
    'the badge-legend paragraph is back - it repeats the header VerificationBadge',
  );
  // the compact badge must survive, or the story loses its status indicator
  assert.ok(
    /<VerificationBadge/.test(article),
    'the header VerificationBadge was removed with the duplicate legend',
  );
  // and the detail the legend used to carry must still exist somewhere: the
  // evidence panel below the story owns the tier, the score and the outlet list
  const panel = article.slice(article.indexOf('class="evidence-panel'));
  assert.ok(/post\.verification\.tier/.test(panel), 'the evidence panel lost the tier');
  assert.ok(/post\.verification\.score/.test(panel), 'the evidence panel lost the score');
  assert.ok(/evidenceLabelBn/.test(panel), 'the evidence panel lost the outlet list');
});

test('attribution is still available where machines need it', () => {
  // removing the visible সূত্র must not remove the record of where the story came from
  assert.ok(/articleBody: post\.excerpt/.test(article), 'JSON-LD articleBody missing');
  assert.ok(!/post\.sources\.length > 0 && \(/.test(article), 'source list rendered again');
  // the outlets themselves must survive in the front matter schema
  const config = readFileSync(join(SITE, 'content.config.js'), 'utf8');
  assert.ok(/sources/.test(config), 'the sources field was removed from the content schema');
});
