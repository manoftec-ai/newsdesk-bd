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
import { clusterCoherence } from '../lib/cluster-coherence.mjs';
import { composeBody } from '../lib/compose.mjs';
import { runPublicationGate } from '../lib/publication-gate.mjs';
import { openDb, DB_PATH } from '../lib/db.mjs';

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

// 2026-07-27: a slug removed from the site must STAY removed. Deleting the
// article is not a quarantine - national-422, whose body shares 0% of its
// headline, was deleted and republished within the hour because its brief was
// still in the pool. Anything listed here is skipped, whatever else passes.
const QUARANTINE = (() => {
  const f = resolve(import.meta.dirname, '../state/quarantine.json');
  if (!existsSync(f)) return new Set();
  try {
    return new Set(Object.keys(JSON.parse(readFileSync(f, 'utf8'))));
  } catch {
    return new Set();
  }
})();

const MIN_EVIDENCE_EARLY = Number(process.env.MIN_EVIDENCE_WORDS) || DEFAULT_MIN_EVIDENCE_WORDS;
const publishedTitles = loadPublishedTitles(siteDir);

// 2026-09-27: the picker now proves a brief can publish before selecting it. See
// the long note by the gate block below - three gates in a row have been taught
// to the picker the hard way, and each lesson cost a full authoring run.
const db = existsSync(DB_PATH) ? openDb(DB_PATH) : null;

const briefs = readdirSync(BRIEFS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    const slug = f.replace(/\.json$/, '');
    let date = '', headline = '';
    let ev = { score: 0 };
    let tier = null;
    let coherence = { pass: true, minMax: 1, members: 0 };
    let evidence = { pass: false, evidenceWords: 0, minWords: DEFAULT_MIN_EVIDENCE_WORDS, members: 0 };
    let gate = { pass: false };
    let needsReview = false;
    try {
      const j = JSON.parse(readFileSync(join(BRIEFS_DIR, f), 'utf8'));
      needsReview = j.needsReview === true;
      date = j.date || '';
      headline = j.headline || '';
      ev = editorialValue(j);
      evidence = evidenceSufficiency(j);
      // 2026-09-27: the finalizer already refuses an incoherent cluster, but only
      // AFTER the author has spent a run writing a body for it. Measured on a real
      // run: 6 picked, 5 rejected CLUSTER_INCOHERENT, 1 published - so four fifths
      // of the authoring budget was spent on stories that could never ship.
      coherence = clusterCoherence(j);
      tier = (j.verdict && j.verdict.tier) || null;

      // 2026-09-27. The picker has been taught three times to stop selecting
      // briefs the finalizer will reject - coherence (D107), evidence (D109),
      // and then Google News wrappers, missing claim evidence and unrelated
      // cluster members. Every lesson cost a full authoring run spent on stories
      // that could never ship.
      //
      // The lesson generalises, so rather than chase the next rule, the picker
      // runs the real publication gate itself, against the exact body the
      // deterministic composer will write. Composing and gating costs
      // milliseconds per brief and was never the bottleneck, and it makes
      // "picked" mean "can publish" - so a run can never select a doomed story.
      if (db && coherence.pass && evidence.evidenceWords >= MIN_EVIDENCE_EARLY) {
        const composed = composeBody(j);
        if (composed.body && composed.body.length >= 80 && !composed.short) {
          gate = runPublicationGate(j, composed.body, db);
        }
      }
    } catch {
      // unreadable brief -> treat as no-date/headline, never first.
    }
    return {
      slug,
      date,
      headline,
      evScore: ev.score,
      tier,
      coherence,
      evidence,
      gate,
      published: existsSync(join(siteDir, `${slug}.md`)),
      titleDup: isTitleDuplicate(headline, date, publishedTitles),
      needsReview,
    };
  });

// Do not START a story the evidence cannot finish (2026-09-26). Measured: 407
// of 423 briefs carry under 250 words of source material, and the writer
// already expands the median 49 words into a 192-word body. Picking these wastes
// an authoring run to produce a thin article that the finalizer would reject.
const MIN_EVIDENCE = Number(process.env.MIN_EVIDENCE_WORDS) || DEFAULT_MIN_EVIDENCE_WORDS;
const tooThin = briefs.filter((b) => b.evidence.evidenceWords < MIN_EVIDENCE && !b.published);
const quarantined = briefs.filter((b) => QUARANTINE.has(b.slug) && !b.published);
const incoherent = briefs.filter((b) => !b.coherence.pass && !b.published);
const needsReviewList = briefs.filter((b) => b.needsReview && !b.published);
const pending = briefs.filter(
  (b) =>
    !QUARANTINE.has(b.slug) &&
    !b.published &&
    !b.titleDup &&
    !b.needsReview &&
    b.evidence.evidenceWords >= MIN_EVIDENCE &&
    b.coherence.pass &&
    b.gate.pass,
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
console.log(`quarantine: ${quarantined.length} brief(s) permanently withheld, skipped`);
console.log(`evidence gate: ${tooThin.length} briefs under ${MIN_EVIDENCE} words of source material, skipped`);
console.log(`coherence gate: ${incoherent.length} briefs whose members are not all about the same event, skipped`);
console.log(`pick: ${picked.length}/${pending.length} pending briefs (newest by date, then editorial value, title-unique) -> ${outPath}${dupCount ? `; ${dupCount} title-duplicates filtered` : ''}`);
for (const p of picked) console.log(`  ${p.date || 'no-date'}  ev=${p.evScore}  ${p.slug}`);
if (!picked.length) console.log('  -> no unpublished briefs');
if (!picked.length) console.log('  -> no unpublished briefs');