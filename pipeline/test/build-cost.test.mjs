import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SITE = join(import.meta.dirname, '../../site/src');
const newsData = readFileSync(join(SITE, 'lib/news-data.js'), 'utf8');

test('the related-posts sort does not rescan events per comparison', () => {
  // 2026-10-02. relatedPosts() called eventsForPost() from inside its
  // comparator — including eventsForPost(post), whose argument never changes, so
  // it was recomputed ~5,000 times per article page. Every event scan walks all
  // 83 events, so 584 pages did hundreds of millions of string matches and a
  // build that used to take 53 seconds ran for hours. Nothing reached
  // production because no build ever finished.
  const start = newsData.indexOf('export const relatedPosts');
  assert.ok(start > 0, 'relatedPosts is missing from news-data.js');
  const body = newsData.slice(start, newsData.indexOf('\n};', start));

  const comparator = body.slice(body.indexOf('.sort('));
  assert.ok(comparator.length > 0, 'relatedPosts no longer sorts');
  assert.ok(
    !/eventsForPost/.test(comparator),
    'eventsForPost is called inside the comparator again — that is the quadratic build cost',
  );
  assert.ok(
    /new Set\(eventsForPost\(post\)/.test(body),
    "the post's own event ids must be resolved once, outside the comparator",
  );
  assert.ok(
    /new Map\(\)/.test(body) && /eventBonus\.has\(candidate\.slug\)/.test(body),
    'each candidate must be scored at most once',
  );
  // The ranking itself must survive the optimisation.
  assert.match(body, /\? 10 : 0/, 'same-event bonus of 10 was lost');
  assert.match(body, /candidate\.category === post\.category \? 2 : 0/, 'same-category bonus was lost');
  assert.match(body, /candidate\.tags\.filter\(\(tag\) => post\.tags\.includes\(tag\)\)\.length/, 'shared-tag score was lost');
  assert.match(body, /\(b\.ts \?\? 0\) - \(a\.ts \?\? 0\)/, 'recency tiebreak was lost');
});

test('the article collection is parsed once per build, not once per page', () => {
  // getCollection() re-reads and re-parses all 584 markdown files on every call
  // (measured ~2.4s), and posts() sits under nearly every helper — so every page
  // paid it again, ~23 minutes of pure re-parsing per build.
  assert.match(newsData, /export const newsEntries = async \(\)/, 'newsEntries() is missing');
  assert.match(newsData, /let cachedEntries = null/, 'the collection has no build-time cache');
  assert.match(newsData, /cachedEntries \?\?= getCollection\("news"/, 'the cache is never populated');
  assert.match(
    newsData,
    /if \(!import\.meta\.env\.PROD\) return getCollection\("news"/,
    'dev must stay uncached, otherwise a newly added article needs a restart to appear',
  );
  assert.match(newsData, /let cachedPosts = null/, 'posts() has no build-time cache');
});

test('no per-page template reads the collection directly', () => {
  // A getStaticPaths() body runs once per build, so reading the collection there
  // is free. A component body runs once per generated page, so reading it there
  // re-parses all 584 articles for every page. Those must go through the
  // memoized newsEntries()/posts() helpers instead.
  //
  // One-shot endpoints (rss.xml.js, sitemap*.xml.js, status.astro) are exempt:
  // each is generated exactly once, so a single parse is correct there and
  // routing them through the cache would gain nothing.
  const exempt = new Set([
    'rss.xml.js',
    'sitemap.xml.js',
    'sitemap-images.xml.js',
    'news-sitemap.xml.js',
    'status.astro',
  ]);
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name === '.astro') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!name.endsWith('.astro') && !name.endsWith('.js')) continue;
      if (exempt.has(name)) continue;
      if (p.endsWith(join('lib', 'news-data.js'))) continue; // the cached source itself
      const src = readFileSync(p, 'utf8');
      if (!/getCollection\(/.test(src)) continue;
      // Drop the getStaticPaths block: anything left runs per page.
      const withoutPaths = src.replace(
        /export (?:async )?function getStaticPaths\(\)[\s\S]*?\n}\n/g,
        '',
      );
      if (/getCollection\(/.test(withoutPaths)) offenders.push(p.replace(SITE, 'site/src'));
    }
  };
  walk(SITE);
  assert.deepEqual(
    offenders,
    [],
    `these read the collection once per page instead of using the cache:\n${offenders.join('\n')}`,
  );
});
