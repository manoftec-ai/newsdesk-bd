#!/usr/bin/env node
// tools/measure_source_yield.mjs — how much article text does each source
// actually give us?
//
// WHY THIS EXISTS (2026-09-26)
//   Asked why articles sat at a 192-word median against a 269-word market
//   median. Measuring first showed the writer is not the constraint: briefs hand
//   it a median of 49 words of source material and it already expands that 4x.
//   So the question became "can we get more text", and the answer was not
//   obvious — HTTP 200 tells you nothing.
//
// MEASURED, per source, one recent non-Google-News article URL:
//   dainikbangla 870  tbs 723  ittefaq 624  channeli 619  bdnews24 598
//   dhakatribune 394  bd24live 346  bbc-bengali 316  banglatribune 152
//   prothomalo 91  samakal 58
//   atnbangla 14  dainikazadi 1  deshrupantor 1  guardian-world 1
//   daily-observer 0  voa-bangla 0
//   jamuna 403  jugantor 403  kalerkantho 403
//
// Six sources return HTTP 200 and yield ~0 words. Those are the dangerous ones:
// a brief built from them looks multi-sourced when only one member carries real
// text, which is how the site ended up publishing confident, thin articles.
//
// SAFE BY DEFAULT: dry run. Nothing is written without --write.
//   node tools/measure_source_yield.mjs                  # report only
//   node tools/measure_source_yield.mjs --write          # update config/source-yield.json
//   node tools/measure_source_yield.mjs --days=3         # tighter recency window
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as cheerio from 'cheerio';
import { openDb } from '../lib/db.mjs';
import { extractArticleBody } from '../lib/fetch.mjs';
import { cleanBody } from '../lib/normalize.mjs';

const DB_PATH = resolve(import.meta.dirname, '../state/store.db');
const OUT_PATH = resolve(import.meta.dirname, '../config/source-yield.json');
const WRITE = process.argv.includes('--write');
const arg = (k, d = '') => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const DAYS = Number(arg('days', '5')) || 5;
const TIMEOUT_MS = 20000;

// The same desktop UA the pipeline found necessary: fetch.mjs's mobile UA
// returns a 0-byte body on several BD outlets.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const db = openDb(DB_PATH);
const rows = db
  .prepare(
    `SELECT source_id, MAX(url) AS url FROM raw_items
      WHERE url NOT LIKE '%news.google.com%'
        AND seen_at > datetime('now', ?)
      GROUP BY source_id`,
  )
  .all(`-${DAYS} days`);

console.log(`measuring ${rows.length} sources over the last ${DAYS} days (${WRITE ? 'WRITE' : 'dry run'})\n`);
console.log('source            HTTP   words   verdict');
console.log('-'.repeat(52));

const usable = {};
const marginal = {};
const hollow = {};
const blocked = {};

for (const r of rows) {
  let status = 0;
  let words = 0;
  try {
    const res = await fetch(r.url, {
      headers: { 'user-agent': UA, 'accept-language': 'bn,en;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = res.status;
    if (res.ok) {
      const html = await res.text();
      const body = cleanBody(extractArticleBody(cheerio.load(html)) || '');
      words = body.split(/\s+/).filter(Boolean).length;
    }
  } catch (e) {
    status = 'ERR';
  }

  let verdict;
  if (status === 403) {
    blocked[r.source_id] = status;
    verdict = 'BLOCKED (cloudflare)';
  } else if (words >= 100) {
    usable[r.source_id] = words;
    verdict = 'usable';
  } else if (words >= 50) {
    marginal[r.source_id] = words;
    verdict = 'marginal';
  } else {
    hollow[r.source_id] = words;
    verdict = 'HOLLOW - looks like a source, yields nothing';
  }
  console.log(`  ${r.source_id.padEnd(16)}${String(status).padStart(5)}${String(words).padStart(8)}   ${verdict}`);
}

const rank = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
console.log(`\n  usable (>=100 words): ${Object.keys(usable).length}`);
console.log(`  hollow (200 but no text): ${Object.keys(hollow).length}  <- do not trust a brief built only from these`);
console.log(`  blocked: ${Object.keys(blocked).length}`);

if (WRITE) {
  writeFileSync(
    OUT_PATH,
    `${JSON.stringify(
      {
        _comment:
          'Measured extraction yield per source. Re-measure with `node tools/measure_source_yield.mjs --write` before changing anything here. HTTP 200 does NOT mean the extractor can read the page.',
        measuredAt: new Date().toISOString().slice(0, 10),
        method: `1 recent non-google-news raw_items.url per source; HTTP 200 + extractArticleBody; words = cleanBody(body) token count; window ${DAYS}d`,
        usable: rank(usable),
        marginal: rank(marginal),
        hollow: {
          _comment:
            'HTTP 200 but the extractor finds almost nothing. Likely JS-rendered, paywalled, or a selector mismatch. Do not trust a brief whose members are all hollow sources.',
          ...rank(hollow),
        },
        blocked: {
          _comment: 'HTTP 403. Cloudflare bot protection. Cannot be enriched at all.',
          ...rank(blocked),
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nwritten to ${OUT_PATH}`);
} else {
  console.log('\nDRY RUN — add --write to update config/source-yield.json');
}
