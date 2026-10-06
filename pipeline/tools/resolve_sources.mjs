#!/usr/bin/env node
// Resolve Google News wrappers to the publisher's own article, and recover the
// article text.
//
// WHY (2026-09-27). For the Cloudflare-walled outlets the pipeline fetches
// through Google News search RSS, so every item URL comes back as
// news.google.com/rss/articles/... - a wrapper, not a citable source. Measured
// on the live corpus: 383 of 508 thin-evidence member URLs were wrappers, 208
// of 283 unpublished briefs carried at least one, and 127 briefs had nothing
// but wrappers. Every one of those briefs is unpublishable twice over: the gate
// refuses an unresolvable source (GOOGLE_NEWS_WRAPPER_UNRESOLVED), and a
// headline with no article text can never reach the evidence floor.
//
// Two things that looked like dead ends first:
//   - the old base64-protobuf decode returns nothing now; Google moved to a
//     signed format, so 0 of 383 decoded.
//   - following the wrapper with a browser UA lands on a 590KB JavaScript page
//     with no publisher URL in it.
//
// What does work: the wrapper page still carries data-n-a-sg / data-n-a-ts, and
// those sign a batchexecute RPC that returns the real URL. A resolved bd24live
// article then yields ~3,600 Bengali characters - a full article, not a
// headline.
//
// This does not weaken any gate. It replaces an uncitable redirect with the
// publisher's own URL, and gives the evidence gate real text to measure.
//
//   node tools/resolve_sources.mjs [--limit=N] [--concurrency=N] [--dry-run]

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { extractArticle } from '../lib/article-text.mjs';
import { cleanBody } from '../lib/normalize.mjs';

const HERE = import.meta.dirname;
const BRIEFS_DIR = resolve(HERE, '../state/briefs');
const SITE_DIR = resolve(HERE, '../../site/src/content/news');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const isWrapper = (u) => /news\.google\.com\/rss\/articles/i.test(String(u ?? ''));
const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const limit = Number(arg('limit', '0')) || Infinity;
const concurrency = Math.max(1, Math.min(8, Number(arg('concurrency', '4')) || 4));
const dryRun = process.argv.includes('--dry-run');

/** Sign and run the batchexecute RPC that returns the publisher URL. */
async function resolveWrapper(wrapper, timeoutMs = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const page = await fetch(wrapper, { headers: { 'user-agent': UA }, signal: ctl.signal });
    const html = await page.text();
    const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
    const id = wrapper.match(/articles\/([^?]+)/)?.[1];
    if (!sg || !ts || !id) return { ok: false, why: 'no-signature' };

    const inner = JSON.stringify([
      'garturlreq',
      [
        ['en-US', 'US', ['FINANCE_TOP_INDICES', 'WEB_TEST_1_0_0'], null, null, 1, 1, 'US:en', null,
          180, null, null, null, null, null, 0, null, null, [1608992183, 723341000]],
        'en-US', 'US', 1, [2, 3, 4, 8], 1, 0, '655000234', 0, 0, null, 0,
      ],
      id,
      Number(ts),
      sg,
    ]);
    const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST',
      headers: {
        'user-agent': UA,
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: `f.req=${encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]))}`,
      signal: ctl.signal,
    });
    const text = await res.text();
    // the RPC echoes a handful of google URLs; the publisher is the first
    // non-Google one
    const all = text.match(/https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&()*+,;=%-]{15,200}/g) ?? [];
    const real = all.find((u) => !/google\.com|gstatic|googleapis/i.test(u));
    return real ? { ok: true, url: real } : { ok: false, why: 'no-url-in-response' };
  } catch (err) {
    return { ok: false, why: err?.name === 'AbortError' ? 'timeout' : 'fetch-error' };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const retext = process.argv.includes('--retext');
  const files = readdirSync(BRIEFS_DIR).filter((f) => f.endsWith('.json'));
  const targets = [];
  for (const f of files) {
    const slug = f.replace(/\.json$/, '');
    const brief = JSON.parse(readFileSync(join(BRIEFS_DIR, f), 'utf8'));

    if (retext) {
      // 2026-07-27. The first extractor wrote up to 4,000 characters of stripped
      // page - menus, bylines, photo credits and "সম্পর্কিত" link farms
      // included - into brief.members[].lead, and 24 articles were published from
      // it. Those leads are already resolved to publisher URLs, so the normal
      // pass never revisits them. Re-extract every lead that the old extractor
      // touched: page text is far longer than an RSS lead ever is.
      const dirty = (brief.members ?? []).filter(
        (m) => !isWrapper(m.url) && String(m.lead ?? '').length > 1200,
      );
      if (dirty.length) targets.push({ file: f, brief, wrapped: dirty });
      continue;
    }

    if (existsSync(join(SITE_DIR, `${slug}.md`))) continue; // already published
    const wrapped = (brief.members ?? []).filter((m) => isWrapper(m.url));
    if (wrapped.length) targets.push({ file: f, brief, wrapped });
    if (targets.length >= limit) break;
  }

  console.log(
    retext
      ? `retext: ${targets.length} briefs carry page text from the old extractor`
      : `resolve: ${targets.length} unpublished briefs carry a google wrapper ` +
        `(${targets.reduce((n, t) => n + t.wrapped.length, 0)} urls), concurrency ${concurrency}`,
  );
  if (!targets.length) return;

  const stats = { resolved: 0, text: 0, failed: new Map(), briefsChanged: 0 };
  const queue = targets.flatMap((t) => t.wrapped.map((m) => ({ t, m })));
  let done = 0;

  async function worker() {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      if (retext) {
        // URL is already the publisher's; only the text is being rebuilt
        const art = await extractArticle(job.m.url, { expectTitle: job.m.title });
        // 2026-09-28: extractArticle returns raw scorer text — escaped markup
        // (`&lt;p&gt;`) and runaway whitespace survived into brief leads
        // (national-251). cleanBody decodes entities and normalizes, same as
        // the enrich_bodies path.
        if (art.ok) { stats.text++; job.m.lead = cleanBody(art.text); }
        else {
          stats.failed.set(art.why, (stats.failed.get(art.why) ?? 0) + 1);
          // 2026-10-06: reader fallback observability — direct code alone
          // hides whether the reader also failed and how.
          if (art.readerWhy) stats.failed.set(`reader:${art.readerWhy}`, (stats.failed.get(`reader:${art.readerWhy}`) ?? 0) + 1);
          if (art.via === 'reader') stats.readerRecovered = (stats.readerRecovered ?? 0) + 1;
        }
        done++;
        if (done % 25 === 0) console.log(`  ${done}/${queue.length} re-extracted...`);
        continue;
      }
      const r = await resolveWrapper(job.m.url);
      if (!r.ok) {
        stats.failed.set(r.why, (stats.failed.get(r.why) ?? 0) + 1);
      } else {
        stats.resolved++;
        job.m.__original = job.m.url;
        job.m.__resolved = r.url;
        job.m.url = r.url;
        const art = await extractArticle(r.url, { expectTitle: job.m.title });
        if (art.ok) {
          stats.text++;
          // keep the richer text: the RSS lead is a headline, this is the article
          const clean = cleanBody(art.text);
          if (clean.length > String(job.m.lead ?? '').length) job.m.lead = clean;
          if (art.via === 'reader') stats.readerRecovered = (stats.readerRecovered ?? 0) + 1;
        } else {
          stats.failed.set(art.why, (stats.failed.get(art.why) ?? 0) + 1);
          if (art.readerWhy) stats.failed.set(`reader:${art.readerWhy}`, (stats.failed.get(`reader:${art.readerWhy}`) ?? 0) + 1);
        }
      }
      done++;
      if (done % 25 === 0) console.log(`  ${done}/${queue.length} resolved...`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  // Keep every copy of the URL in step. The gate compares
  // memberKey = source_id|url|title (publication-gate.mjs:93) between the brief
  // and the cluster it loads from the database, and it also requires every
  // member URL to appear in brief.sources[]. Rewriting members alone therefore
  // trades GOOGLE_NEWS_WRAPPER_UNRESOLVED for CLUSTER_MEMBERSHIP_MISMATCH and
  // SOURCE_MANIFEST_INVALID - measured on the first pass: 56 briefs past the
  // mechanical audit, 0 past the gate, 50 of them failing on exactly that.
  const map = new Map();
  for (const t of targets) {
    for (const m of t.wrapped) if (m.__resolved) map.set(m.__original, m.__resolved);
  }
  stats.resolved = map.size;

  if (!dryRun && map.size) {
    const { openDb, DB_PATH } = await import('../lib/db.mjs');
    const db = openDb(DB_PATH);
    const findItem = db.prepare('SELECT id FROM raw_items WHERE url = ?');
    const updItem = db.prepare('UPDATE OR IGNORE raw_items SET url = ? WHERE url = ?');
    const markDup = db.prepare('UPDATE raw_items SET dup_of_id = ? WHERE url = ?');
    const updEv = db.prepare('UPDATE OR IGNORE claim_evidence SET url = ? WHERE url = ?');
    // claim_evidence carries a partial unique index on (claim_id, url), so the
    // same collision happens there. When a resolved row already backs that
    // claim, the leftover wrapper row is the same piece of evidence twice over
    // and is removed rather than left holding an uncitable URL.
    const dropDupEv = db.prepare(
      'DELETE FROM claim_evidence WHERE url = ? AND claim_id IN (SELECT claim_id FROM claim_evidence WHERE url = ?)',
    );
    let collisions = 0;
    for (const [from, to] of map) {
      updItem.run(to, from);
      // raw_items.url is UNIQUE, so two Google News wrappers can resolve to the
      // same publisher article. That is a duplicate, not an error: the row that
      // lost the race is recorded as a duplicate of the winner rather than
      // crashing the run or being left holding an uncitable wrapper.
      if (findItem.get(from)) {
        const winner = findItem.get(to);
        if (winner) {
          markDup.run(winner.id, from);
          collisions++;
        }
      }
      updEv.run(to, from);
      dropDupEv.run(from, to);
    }
    db.close();
    stats.collisions = collisions;

    for (const t of targets) {
      // brief.sources is a manifest, not a member list: a source whose URL is a
      // wrapper adopts the resolved URL of its member
      for (const src of t.brief.sources ?? []) {
        const resolved = map.get(src?.url);
        if (resolved) src.url = resolved;
      }
      writeFileSync(join(BRIEFS_DIR, t.file), `${JSON.stringify(t.brief, null, 2)}\n`, 'utf8');
      stats.briefsChanged++;
    }
  } else {
    for (const t of targets) {
      for (const src of t.brief.sources ?? []) {
        const resolved = map.get(src?.url);
        if (resolved) src.url = resolved;
      }
      if (!dryRun) writeFileSync(join(BRIEFS_DIR, t.file), `${JSON.stringify(t.brief, null, 2)}\n`, 'utf8');
      stats.briefsChanged++;
    }
  }

  console.log(`  urls resolved to publisher : ${stats.resolved}`);
  console.log(`  article text recovered     : ${stats.text}`);
  if (stats.readerRecovered) console.log(`  of which via reader proxy : ${stats.readerRecovered}`);
  console.log(`  briefs updated             : ${dryRun ? 0 : stats.briefsChanged}`);
  console.log(`  raw_items + claim_evidence urls rewritten: ${map.size}`);
  if (stats.collisions) console.log(`  duplicate articles collapsed        : ${stats.collisions}`);
  if (stats.failed.size) {
    console.log('  failures:');
    for (const [why, n] of [...stats.failed].sort((a, b) => b[1] - a[1])) console.log(`    ${why}: ${n}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('resolve_sources.mjs')) {
  await main();
}
