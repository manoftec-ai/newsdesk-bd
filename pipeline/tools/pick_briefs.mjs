// tools/pick_briefs.mjs — deterministic selection of the newest N unpublished briefs.
//
// WHY: the auto-author prompt asked the LLM to "author the newest briefs by published
// date", but the model picked arbitrary (often stale, backfill) briefs instead of the
// fresh ones, so the site's top stories looked old. Selection must NOT be left to the
// model — this script computes it and writes a pick file the author must follow.
//
// usage: node tools/pick_briefs.mjs [--max=N] [--site=/path/to/site] [--out=/path/to/pick.json]
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BRIEFS_DIR } from '../lib/extract.mjs';

const maxArg = Number(process.argv.find((a) => a.startsWith('--max='))?.split('=')[1]);
const max = Number.isFinite(maxArg) && maxArg > 0 ? maxArg : 6;

const siteArg = process.argv.find((a) => a.startsWith('--site='))?.split('=')[1];
const siteDir = siteArg
  ? resolve(siteArg)
  : resolve(import.meta.dirname, '../../site/src/content/news');

const outArg = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];
const outPath = outArg
  ? resolve(outArg)
  : resolve(import.meta.dirname, '../state/pick.json');

const briefs = readdirSync(BRIEFS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const slug = f.replace(/\.json$/, '');
    let date = '';
    try {
      date = JSON.parse(readFileSync(join(BRIEFS_DIR, f), 'utf8')).date || '';
    } catch {
      // unreadable brief -> treat as no-date, never first.
    }
    return { slug, date, published: existsSync(join(siteDir, `${slug}.md`)) };
  });

const pending = briefs.filter((b) => !b.published);
pending.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.slug.localeCompare(b.slug));

const picked = pending.slice(0, max);

if (picked.length) {
  writeFileSync(
    outPath,
    JSON.stringify(
      { picked: picked.map((p) => ({ slug: p.slug, date: p.date })), pending: pending.length },
      null,
      2,
    ),
  );
}
console.log(`pick: ${picked.length}/${pending.length} pending briefs (newest by date) -> ${outPath}`);
for (const p of picked) console.log(`  ${p.date || 'no-date'}  ${p.slug}`);
if (!picked.length) console.log('  -> no unpublished briefs');