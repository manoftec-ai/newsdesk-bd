#!/usr/bin/env node
// tools/enrich_bodies.mjs — backfill real article bodies into store.db.
//
// WHY THIS EXISTS (2026-09-25)
//   Live audit: output collapsed from a 216-word median (2026-09-19) to 43 words
//   (2026-09-25). 27 of the last 30 published articles are stubs, all carrying
//   `badge: confirmed, tier: A`.
//
// ROOT CAUSE: the bodies were never captured, not badly written.
//   1. fetch.mjs's enrichThinBodies() is wired into the scraper and Google-News
//      paths ONLY. fetchRss() never calls it, so every plain-RSS source keeps
//      its `contentSnippet` — which on most BD outlets is just the headline plus
//      the outlet name.
//   2. ENRICH_MAX = 10 per run, so even the enriched paths drop the remainder.
//   3. The enrichment error handler is `catch {}` — failures are invisible, so
//      nothing is ever retried or reported.
//   Result: 3,558 of 7,960 raw_items (44.7%) still hold a headline-length body.
//   The author agent then has nothing to write from and emits a restatement.
//
// WHAT THIS DOES: re-fetch those source URLs, extract the real body with the
//   SAME extraction code the live pipeline uses, and persist it to
//   raw_items.body — which is what buildBrief() reads (`lead: excerptOf(m.body)`).
//   Updating only the brief JSON would be undone by the next `extract` run.
//
// SAFE BY DEFAULT: dry-run. Nothing is written without --write.
//   node tools/enrich_bodies.mjs --limit=20                 # dry run
//   node tools/enrich_bodies.mjs --limit=20 --write         # persist
//   node tools/enrich_bodies.mjs --limit=20 --host=bd24live  # one outlet
//   node tools/enrich_bodies.mjs --resolve-gnews --limit=10  # decode wrappers first
//
// NOT wired into any workflow. Local, developer-invoked only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as cheerio from 'cheerio';
import { openDb } from '../lib/db.mjs';
import { cleanBody, urlHash } from '../lib/normalize.mjs';
import { extractArticleBody, needsBodyEnrichment, resolveGoogleNewsUrl, googleNewsArticleId } from '../lib/fetch.mjs';

const DB_PATH = resolve(import.meta.dirname, '../state/store.db');
const REPORT_PATH = resolve(import.meta.dirname, '../state/enrich-report.json');

// fetch.mjs's mobile UA returns a 0-byte body on several BD outlets (verified
// against bd24live). A desktop UA works. Try both rather than trusting one.
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36',
];
const TIMEOUT_MS = Number(process.env.ENRICH_TIMEOUT_MS || 20000);
const DELAY_MS = Number(process.env.ENRICH_DELAY_MS || 700);
const MIN_GAIN = Number(process.env.ENRICH_MIN_GAIN || 200);

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const flag = (n) => process.argv.includes(`--${n}`);

const WRITE = flag('write');
const LIMIT = Number(arg('limit') ?? 20);
const HOST = arg('host') || '';
const RESOLVE_GNEWS = flag('resolve-gnews');
const MIN_WORDS = Number(arg('min-words') ?? 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  for (const ua of UAS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: ctrl.signal,
        headers: {
          'user-agent': ua,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'bn,en;q=0.8',
        },
      });
      if (!res.ok) return { ok: false, status: res.status, text: '', finalUrl: res.url };
      const text = await res.text();
      if (text.length < 200) continue; // 0-byte / challenge page: try the next UA
      return { ok: true, status: res.status, text, finalUrl: res.url };
    } catch (e) {
      const last = { ok: false, status: 0, text: '', error: e.name };
      if (ua === UAS[UAS.length - 1]) return last;
    } finally {
      clearTimeout(t);
    }
  }
  return { ok: false, status: 0, text: '', error: 'all-ua-failed' };
}

function bodyFrom(html, url) {
  try {
    const $ = cheerio.load(html);
    const body = cleanBody(extractArticleBody($));
    return { body, finalUrl: url };
  } catch {
    return { body: '', finalUrl: url };
  }
}

const db = openDb(DB_PATH);
const where = [];
const params = [];
if (HOST) {
  where.push('url LIKE ?');
  params.push(`%${HOST}%`);
}
// Ordering matters more than it looks.
//
// 2026-09-26: this was `ORDER BY id`, oldest first, so every batch walked the
// dead tail of the archive — pages that now 404, redirect to a homepage, or
// serve a consent wall. Measured: 130 attempted, 0 improved, across the
// default pool, --only=direct and --only=gnews.
//
// The same tool run against a RECENT direct item (id 271697, ittefaq) improved
// it by 2,539 chars — 417 words of real article text. Recent direct URLs enrich
// reliably; the old ones generally cannot.
//
// So default to newest-first, and let --days= bound the window. `--order=id`
// keeps the historical sweep available for when the archive is the goal.
const ORDER = arg('order') || 'recent';
const DAYS = Number(arg('days') || '') || 0;
const ORDER_SQL = {
  recent: 'seen_at DESC, id DESC',
  id: 'id',
  published: 'published_at DESC, id DESC',
}[ORDER];
if (!ORDER_SQL) throw new Error(`invalid --order=${ORDER} (use recent|id|published)`);

const rows = db
  .prepare(`SELECT id, source_id, url, url_hash, title, body, published_at, seen_at FROM raw_items ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${ORDER_SQL}`)
  .all(...params);

const thin = rows.filter((r) => needsBodyEnrichment(r));
const ONLY = arg('only') || ''; // 'gnews' | 'direct' | ''
const IDS = (arg('id') || '').split(',').map((s) => s.trim()).filter(Boolean);
let pool = thin;
if (IDS.length) pool = thin.filter((r) => IDS.includes(String(r.id)));
else if (ONLY === 'gnews') pool = thin.filter((r) => googleNewsArticleId(r.url));
else if (ONLY === 'direct') pool = thin.filter((r) => !googleNewsArticleId(r.url));
if (DAYS > 0) {
  const cutoff = Date.now() - DAYS * 86400000;
  const kept = pool.filter((r) => {
    const t = Date.parse(r.seen_at || r.published_at || '') || 0;
    return t >= cutoff;
  });
  console.log(`--days=${DAYS}: ${kept.length} of ${pool.length} candidates are recent enough`);
  pool = kept;
}
console.log(`store.db: ${rows.length} items, ${thin.length} still thin${HOST ? ` (host ~ ${HOST})` : ''}`);
if (IDS.length) console.log(`filter: ids=${IDS.join(',')} -> ${pool.length} candidates`);
if (ONLY) console.log(`filter: only=${ONLY} -> ${pool.length} candidates`);
console.log(`mode: ${WRITE ? 'WRITE' : 'DRY RUN'}   limit: ${LIMIT}   minGain: ${MIN_GAIN} chars\n`);

const report = {
  startedAt: new Date().toISOString(),
  mode: WRITE ? 'write' : 'dry-run',
  totalThin: thin.length,
  attempted: 0,
  improved: 0,
  unchanged: 0,
  failed: 0,
  improvedItems: [],
  failures: {},
  gnewsResolved: 0,
};

const candidates = pool.slice(0, LIMIT);
for (const item of candidates) {
  report.attempted++;
  let target = item.url;
  const isGnews = Boolean(googleNewsArticleId(item.url));

  if (isGnews) {
    if (!RESOLVE_GNEWS) {
      report.failures.gnews_not_resolved = (report.failures.gnews_not_resolved || 0) + 1;
      continue;
    }
    try {
      const resolved = await resolveGoogleNewsUrl(item.url);
      if (resolved && resolved !== item.url && !googleNewsArticleId(resolved)) {
        target = resolved;
        report.gnewsResolved++;
      } else {
        report.failures.gnews_undecodable = (report.failures.gnews_undecodable || 0) + 1;
        continue;
      }
    } catch (e) {
      report.failures.gnews_error = (report.failures.gnews_undecodable || 0) + 1;
      continue;
    }
  }

  let outcome = { ok: false, status: 0, text: '' };
  try {
    outcome = await fetchText(target);
  } catch (e) {
    report.failed++;
    const k = `fetch_threw_${e.name}`;
    report.failures[k] = (report.failures[k] || 0) + 1;
    await sleep(DELAY_MS);
    continue;
  }

  if (!outcome.ok) {
    report.failed++;
    const k = `http_${outcome.status || 'err'}`;
    report.failures[k] = (report.failures[k] || 0) + 1;
    await sleep(DELAY_MS);
    continue;
  }

  const { body } = bodyFrom(outcome.text, outcome.finalUrl || target);
  const oldLen = String(item.body ?? '').trim().length;

  if (body.length - oldLen < MIN_GAIN || body.length < MIN_WORDS) {
    report.unchanged++;
    const k = body.length < 50 ? 'extracted_empty_or_short' : 'gain_below_threshold';
    report.failures[k] = (report.failures[k] || 0) + 1;
    await sleep(DELAY_MS);
    continue;
  }

  report.improved++;
  report.improvedItems.push({
    id: item.id,
    source_id: item.source_id,
    url: item.url,
    resolvedUrl: target !== item.url ? target : null,
    oldChars: oldLen,
    newChars: body.length,
    gain: body.length - oldLen,
    title: item.title,
  });
  console.log(
    `  +${String(body.length - oldLen).padStart(6)} chars  ${String(item.id).padStart(5)}  ${item.source_id.padEnd(14)} ${(target || '').slice(0, 62)}`,
  );

  if (WRITE) {
    // Only the body here. URL rewriting on resolve is deliberately NOT done in
    // this pass: raw_items.url is UNIQUE and rewriting it would silently
    // re-point evidence. A resolved URL is recorded for a follow-up decision.
    db.prepare('UPDATE raw_items SET body = ? WHERE id = ?').run(body, item.id);
  }

  await sleep(DELAY_MS);
}

if (WRITE) {
  for (const it of report.improvedItems) {
    if (!it.resolvedUrl) continue;
    try {
      db.prepare('UPDATE raw_items SET url_hash = ? WHERE id = ?').run(urlHash(it.resolvedUrl), it.id);
    } catch {}
  }
}

report.finishedAt = new Date().toISOString();
mkdirSync(resolve(import.meta.dirname, '../state'), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
db.close();

console.log(`\nattempted ${report.attempted}  improved ${report.improved}  unchanged ${report.unchanged}  failed ${report.failed}`);
if (report.gnewsResolved) console.log(`google-news wrappers decoded: ${report.gnewsResolved}`);
if (Object.keys(report.failures).length) {
  console.log('failures (recorded, not swallowed):');
  for (const [k, v] of Object.entries(report.failures).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }
}
console.log(`report: ${REPORT_PATH}`);
console.log(WRITE ? 'WRITTEN to store.db — re-run `node run.js extract` to rebuild briefs.' : 'DRY RUN — add --write to persist.');
process.exit(0);
