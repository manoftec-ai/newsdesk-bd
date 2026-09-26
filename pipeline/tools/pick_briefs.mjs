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
import { loadPublishedTitles, isTitleDuplicate, normTitle } from '../lib/published.mjs';
import { editorialValue, evidenceSufficiency, DEFAULT_MIN_EVIDENCE_WORDS } from '../lib/editorial.mjs';

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

const publishedTitles = loadPublishedTitles(siteDir);

const briefs = readdirSync(BRIEFS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const slug = f.replace(/\.json$/, '');
    let date = '', headline = '';
    let ev = { score: 0 };
    let tier = null;
    let evidence = { pass: false, evidenceWords: 0, minWords: DEFAULT_MIN_EVIDENCE_WORDS, members: 0 };
    try {
      const j = JSON.parse(readFileSync(join(BRIEFS_DIR, f), 'utf8'));
      date = j.date || '';
      headline = j.headline || '';
      ev = editorialValue(j);
      evidence = evidenceSufficiency(j);
      tier = (j.verdict && j.verdict.tier) || null;
    } catch {
      // unreadable brief -> treat as no-date/headline, never first.
    }
    return {
      slug,
      date,
      headline,
      evScore: ev.score,
      tier,
      evidence,
      published: existsSync(join(siteDir, `${slug}.md`)),
      titleDup: isTitleDuplicate(headline, date, publishedTitles),
    };
  });

// Do not START a story the evidence cannot finish (2026-09-26). Measured: 407
// of 423 briefs carry under 250 words of source material, and the writer
// already expands the median 49 words into a 192-word body. Picking these wastes
// an authoring run to produce a thin article that the finalizer would reject.
const MIN_EVIDENCE = Number(process.env.MIN_EVIDENCE_WORDS) || DEFAULT_MIN_EVIDENCE_WORDS;
const tooThin = briefs.filter((b) => b.evidence.evidenceWords < MIN_EVIDENCE && !b.published);
const pending = briefs.filter(
  (b) => !b.published && !b.titleDup && b.evidence.evidenceWords >= MIN_EVIDENCE,
);
// #22 — editorial-value ranking (internal only): either newest-first, and
// within the same publish date the higher-value story is picked first.
const TIER_RISK = { B: 0, C: 0, A: 1 };
const riskOf = (b) => TIER_RISK[b.tier] ?? 1;

pending.sort(
  (a, b) =>
    String(b.date).localeCompare(String(a.date)) ||
    (b.evScore - a.evScore) ||
    (riskOf(a) - riskOf(b)) ||
    a.slug.localeCompare(b.slug),
);

// Same-batch guard: two pending briefs can carry the SAME headline (same event
// clustered twice with identical members, e.g. national-290/292). Pick only the
// newest slug per normalized title so the same story can't be picked twice.
const seenTitle = new Set();
const picked = [];
for (const p of pending) {
  const key = p.headline ? normTitle(p.headline) : '';
  if (key && seenTitle.has(key)) continue;
  if (key) seenTitle.add(key);
  picked.push(p);
  if (picked.length >= max) break;
}

writeFileSync(
  outPath,
  JSON.stringify(
    { picked: picked.map((p) => ({ slug: p.slug, date: p.date, editorialValue: p.evScore })), pending: pending.length },
    null,
    2,
  ),
);
const dupCount = briefs.filter((b) => b.titleDup).length;
console.log(`evidence gate: ${tooThin.length} briefs under ${MIN_EVIDENCE} words of source material, skipped`);
console.log(`pick: ${picked.length}/${pending.length} pending briefs (newest by date, then editorial value, title-unique) -> ${outPath}${dupCount ? `; ${dupCount} title-duplicates filtered` : ''}`);
for (const p of picked) console.log(`  ${p.date || 'no-date'}  ev=${p.evScore}  ${p.slug}`);
if (!picked.length) console.log('  -> no unpublished briefs');
if (!picked.length) console.log('  -> no unpublished briefs');