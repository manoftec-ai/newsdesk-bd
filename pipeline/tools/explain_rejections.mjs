#!/usr/bin/env node
// tools/explain_rejections.mjs — turn the finalizer's rejection record into
// something a human can act on.
//
// WHY (2026-09-26)
//   The site went silent for hours: 6 briefs picked, 6 rejected. The finalizer
//   printed one line per story — which GATE fired — and pipeline/tmp/ is
//   gitignored, so the per-rule detail was never visible from CI. Worse, the
//   publication gate itself computed the individual audit failures (n14, rv1,
//   c3, c9 …) with human-readable notes and then discarded them, keeping only a
//   flat list of enum codes.
//
//   So diagnosing a blocked story meant reading source code and inferring from
//   code frequency. That is how several wrong conclusions got reached on the way
//   to finding the real cause.
//
// WHAT IT PRINTS
//   For each rejected story: why, the codes, the floor it was measured against,
//   the individual audit rule that fired with its note, and any cluster intruder.
//
// Usage:
//   node tools/explain_rejections.mjs tmp/finalize-rejections.json
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Rule ids come from lib/audit.mjs. Plain-language labels so the summary is
// readable without opening the source.
const RULE_LABEL = {
  n1: 'opening must not restate the headline',
  n2: 'must carry a concrete fact',
  n3: 'no placeholder or TODO text',
  n5: 'headline must be supported by the sources',
  n6: 'numbers and dates must be consistent',
  c3: 'speculation or filler wording',
  c6: 'headline support / overclaim / hype',
  c9: 'body length below the floor for this story',
  rv1: 'body adds no reader value over the headline',
  n14: 'a quotation is not word-for-word in the sources',
  rep1: 'repetition of the headline or lead',
};

const short = (s, n = 110) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

const path = resolve(process.argv[2] ?? 'tmp/finalize-rejections.json');
let record;
try {
  record = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.log(`Could not read ${path}: ${e.message}`);
  process.exit(0);
}

const written = record.written ?? [];
const rejected = record.rejected ?? [];
const skipped = record.skipped ?? [];

console.log(`## Finalize result: ${written.length} written, ${rejected.length} rejected, ${skipped.length} skipped`);

if (written.length) {
  console.log('');
  console.log('### Published');
  for (const w of written) console.log(`- ${w.slug} -> ${w.path ?? ''}`);
}

if (skipped.length) {
  console.log('');
  console.log('### Skipped (not an error)');
  for (const s of skipped) console.log(`- ${s.slug}: ${s.reason}`);
}

if (!rejected.length) {
  console.log('');
  console.log('No rejections.');
} else {
  console.log('');
  console.log(`### Rejected: ${rejected.length}`);
  for (const r of rejected) {
    const d = r.detail ?? r;
    console.log('');
    console.log(`#### \`${r.slug}\` — ${r.reason}`);
    if (d.failureCodes?.length) console.log(`- codes: ${d.failureCodes.join(', ')}`);
    if (d.code) console.log(`- code: ${d.code}`);
    if (d.evidenceWords != null) {
      console.log(`- evidence available: ${d.evidenceWords} words (needs ${d.minEvidenceWords ?? '?'})`);
    }
    if (d.minWords != null) {
      console.log(`- length floor: ${d.minWords} words, body had ${d.bodyWords ?? '?'}`);
    }
    if (d.minMaxSimilarity != null) {
      console.log(`- cluster coherence: ${d.minMaxSimilarity} (needs ${d.minRequired ?? '?'}), members ${d.members ?? '?'}`);
    }
    if (d.richSourceRule) {
      const r2 = d.richSourceRule;
      console.log(`- rich-source rule: ${r2.sourcesAtOrAbove} sources at ${r2.perSourceWords}+ words, required ${r2.requiredWords}+`);
      if (r2.memberWords) console.log(`  member words: [${r2.memberWords.join(', ')}]`);
    }
    for (const f of d.auditFails ?? []) {
      console.log(`- audit \`${f.id}\`${RULE_LABEL[f.id] ? ` (${RULE_LABEL[f.id]})` : ''}: ${short(f.note)}`);
    }
    for (const t of d.intruders ?? []) {
      console.log(`- unrelated member: ${short(t.title, 80)} (best match ${t.best})`);
    }
    if (d.claimIds?.length) console.log(`- claims: ${d.claimIds.join(', ')}`);
  }
}

console.log('');
console.log('_Rule labels live in tools/explain_rejections.mjs; the rules themselves are in lib/audit.mjs._');
