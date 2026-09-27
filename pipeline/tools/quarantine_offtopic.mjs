#!/usr/bin/env node
// Remove published articles that a content audit proved are not publishable.
//
// 2026-09-27. The user reported national-532 as "rubbish" and could not say why.
// Measuring found 4 articles whose body is about entirely different stories from
// the headline, and 4 whose headline is in English on a Bengali site. Those 8 are
// not repairable by editing: the body is the wrong story, and an English headline
// on a Bengali site is a defect of the source, not of the layout.
//
// They are DELETED, not rewritten, because rewriting prose silently is how a
// story ends up saying something its source did not. Each returns to the brief
// pool and can be rebuilt from correct evidence.
//
// Deliberately KEPT, because the gate flags them and the gate is wrong:
//
//   national-132  "আইইএলটিএসে ৯-এ ৯ পেয়েছেন রাইসা, পড়ুন তাঁর পরামর্শ"
//     A first-person IELTS column. The body is genuinely about the headline but
//     never repeats the headline's words, because it is written in the first
//     person - so it scores 17% and trips c12. Deleting a correct article because
//     a heuristic cannot recognise the first person is worse than the false
//     positive it prevents. This is a known limit of the gate, recorded here so
//     the next person does not "fix" it by lowering the threshold.
//
//   node tools/quarantine_offtopic.mjs [--dry-run]

import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bodyHeadlineRelevance } from '../lib/audit.mjs';

const HERE = import.meta.dirname;
const SITE = resolve(HERE, '../../site/src/content/news');
const BRIEFS = resolve(HERE, '../state/briefs');

const dryRun = process.argv.includes('--dry-run');
const BENGALI = /[ঀ-৿]/u;

// national-132 is a correct article that the relevance heuristic cannot read.
// A first-person piece does not repeat its headline's vocabulary.
const KNOWN_FALSE_POSITIVES = new Set(['national-132']);

const remove = [];
const kept = [];

for (const f of readdirSync(SITE).filter((x) => x.endsWith('.md'))) {
  const slug = f.replace(/\.md$/, '');
  const raw = readFileSync(join(SITE, f), 'utf8');
  const fm = (raw.match(/^---\n([\s\S]*?)\n---/) ?? [])[1];
  if (!fm) { kept.push({ slug, why: 'no frontmatter' }); continue; }
  const title = (fm.match(/^title:\s*"?([^"\n]*)"?\s*$/m) ?? [])[1] ?? '';
  const body = raw.replace(/^---\n[\s\S]*?\n---/u, '');

  const reasons = [];
  if (title && !BENGALI.test(title)) reasons.push('NON_BENGALI_TITLE');

  const rel = bodyHeadlineRelevance(title, body);
  if (rel.coverage < 0.18 && rel.headlineTokens >= 4) {
    reasons.push(`BODY_OFF_HEADLINE (${Math.round(rel.coverage * 100)}% overlap)`);
  }

  if (!reasons.length) continue;
  if (KNOWN_FALSE_POSITIVES.has(slug)) {
    kept.push({ slug, why: `kept despite ${reasons.join(', ')} - known false positive` });
    continue;
  }
  remove.push({ slug, reasons, hasBrief: existsSync(join(BRIEFS, `${slug}.json`)) });
}

console.log(`  articles scanned                     : ${readdirSync(SITE).filter((x) => x.endsWith('.md')).length}`);
console.log(`  to be removed                        : ${remove.length}`);
for (const r of remove) {
  console.log(`    ${r.slug.padEnd(34)}${r.reasons.join('; ')}${r.hasBrief ? '' : '   (no brief on disk)'}`);
}
if (kept.some((k) => k.why.includes('false positive'))) {
  console.log('  deliberately kept (gate is wrong here):');
  for (const k of kept.filter((x) => x.why.includes('false positive'))) {
    console.log(`    ${k.slug.padEnd(34)}${k.why}`);
  }
}

if (dryRun) {
  console.log('  dry run, nothing deleted');
} else {
  for (const r of remove) rmSync(join(SITE, `${r.slug}.md`), { force: true });
  console.log(`  removed ${remove.length}; they return to the brief pool`);
}
