#!/usr/bin/env node
// Sweep the published corpus and withhold what fails the audit.
//
// 2026-07-27. The user asked whether they had to open every article to find the
// defects. They had been doing exactly that, because the audit only ran when a
// human ran it. This is the same audit, on a clock.
//
// It WITHHOLDS, it does not repair. Every defect class found so far came from
// bad source text - a navigation menu, a publisher's "আরও পড়ুন" digest, a
// chopped press conference, a news-wire page's furniture - and the writer
// reproduced each of them faithfully. A repair pass asked to tidy such an
// article will invent the clauses the source never contained, which is the one
// thing this pipeline must never do.
//
// Withheld slugs go on the durable quarantine list, so the picker cannot
// republish them - the lesson from national-422, which was deleted and was back
// within the hour.
//
//   node tools/sweep_quarantine.mjs            report only
//   node tools/sweep_quarantine.mjs --commit   also delete + quarantine
//
// outputs (for the workflow): removed=<n>  slugs=a,b,c

import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = import.meta.dirname;
const SITE = resolve(HERE, '../../site/src/content/news');
const BRIEFS = resolve(HERE, '../state/briefs');
const QUARANTINE = resolve(HERE, '../state/quarantine.json');
const commit = process.argv.includes('--commit');

// A first-person piece does not repeat its headline's vocabulary, so c12 reads
// it as a different story. Deleting a correct article because a heuristic cannot
// read the first person is worse than the false positive it prevents.
const KNOWN_FALSE_POSITIVES = new Set(['national-132']);

const out = execFileSync(process.execPath, [resolve(HERE, 'content_audit.mjs'), '--json'], {
  cwd: resolve(HERE, '..'),
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
const findings = JSON.parse(out);

const list = existsSync(QUARANTINE) ? JSON.parse(readFileSync(QUARANTINE, 'utf8')) : {};

// A finding that reaches the reader, as opposed to one the renderer already
// compensates for. NON_ARTICLE_SOURCE and SELF_CORROBORATION stay in the front
// matter on purpose - the panel counts distinct article outlets and drops video
// urls - so withholding an article for them would be removing a correct story
// over a display detail that is already handled.
const REACHES_READER = new Set([
  'BODY_OFF_HEADLINE', 'FRAGMENTED_PROSE', 'REPEATED_PARAGRAPH',
  'NON_BENGALI_TITLE', 'MIDWORD_OPENER', 'MOJIBAKE', 'DATELINE_IN_TITLE', 'QUOTED_TITLE',
]);

const offenders = [];
for (const f of findings) {
  if (KNOWN_FALSE_POSITIVES.has(f.slug)) continue;
  if (list[f.slug]) continue;
  const bad = f.issues.filter((i) => REACHES_READER.has(i.code));
  if (!bad.length) continue;
  offenders.push({ slug: f.slug, reasons: bad });
}

console.log(`  sweep: ${findings.length} article(s) carry findings, ${offenders.length} reach the reader`);
for (const o of offenders) {
  console.log(`    ${o.slug.padEnd(30)}${o.reasons.map((r) => r.code).join(', ')}`);
}

if (!commit || !offenders.length) {
  console.log(`\n  removed=0  slugs=`);
  if (!commit) console.log('  (report only; pass --commit to withhold)');
  process.exit(0);
}

const removed = [];
for (const o of offenders) {
  const file = `${SITE}/${o.slug}.md`;
  if (existsSync(file)) {
    rmSync(file);
    removed.push(o.slug);
  }
  list[o.slug] = {
    why: o.reasons.map((r) => `${r.code}: ${r.detail}`).join(' | ').slice(0, 300),
    at: new Date().toISOString(),
    swept: true,
  };
}
writeFileSync(QUARANTINE, `${JSON.stringify(list, null, 2)}\n`, 'utf8');

console.log(`\n  withheld ${removed.length} and quarantined them so the picker cannot republish:`);
for (const s of removed) {
  const hasBrief = existsSync(`${BRIEFS}/${s}.json`);
  console.log(`    ${s.padEnd(30)}${hasBrief ? 'brief still on disk - fix the BRIEF, not the article' : 'no brief'}`);
}

process.stdout.write(`\nremoved=${removed.length}  slugs=${removed.join(',')}\n`);
