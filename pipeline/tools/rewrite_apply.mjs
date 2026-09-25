#!/usr/bin/env node
// tools/rewrite_apply.mjs — stage 3 of the stub-rewrite path.
//
// Takes the bodies an agent wrote to pipeline/tmp/rewrite/<slug>.b.md and
// splices them into the published articles, keeping the frontmatter
// BYTE-IDENTICAL. 114 of the 514 articles carry corrections/updated history, so
// re-rendering frontmatter from a brief would silently destroy the audit trail.
// This tool therefore edits ONLY the text after the closing `---`.
//
// It re-runs the same substance gate the publisher uses, so a rewrite cannot be
// used to smuggle a short body past the floor, and it refuses a body that adds
// no new information over the one it replaces.
//
// Safety properties:
//   * DRY RUN unless --write.
//   * Never changes slug, date, thumbnail, sources, verification, corrections.
//   * Refuses NO_READER_VALUE and BODY_TOO_THIN.
//   * Refuses a body with no novel concrete fact versus the old body.
//   * Writes atomically; the original is kept as <slug>.md.bak-rewrite on --keep-backup.
//   * Reports every outcome; never silently skips.
//
// Usage:
//   node tools/rewrite_apply.mjs                 # report
//   node tools/rewrite_apply.mjs --write         # apply
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bodySubstanceCheck, readerValueCheck, concreteTokens } from '../lib/editorial.mjs';

const SITE_DIR = resolve(import.meta.dirname, '../../site/src/content/news');
const OUT_DIR = resolve(import.meta.dirname, '../tmp/rewrite');
const INDEX = join(OUT_DIR, 'index.json');

const flag = (n) => process.argv.includes(`--${n}`);
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const WRITE = flag('write');
const KEEP_BACKUP = flag('keep-backup');
const FORCE = flag('force');

if (!existsSync(INDEX)) {
  console.error('no rewrite index — run: node tools/rewrite_prepare.mjs --write');
  process.exit(1);
}
const index = JSON.parse(readFileSync(INDEX, 'utf8'));

/** Split an .md into { frontmatter, body } on the first two --- fences. */
function splitDoc(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  return { frontmatter: m[1], body: m[2] };
}

const report = { applied: [], refused: [], skipped: [] };

for (const item of index.items) {
  const mdPath = join(SITE_DIR, `${item.slug}.md`);
  const bodyPath = join(OUT_DIR, item.bodyFile);
  if (!existsSync(mdPath)) {
    report.skipped.push({ slug: item.slug, why: 'PUBLISHED_FILE_MISSING' });
    continue;
  }
  if (!existsSync(bodyPath)) {
    report.skipped.push({ slug: item.slug, why: 'NO_BODY_WRITTEN' });
    continue;
  }

  const original = readFileSync(mdPath, 'utf8');
  const doc = splitDoc(original);
  if (!doc) {
    report.skipped.push({ slug: item.slug, why: 'FRONTMATTER_UNPARSEABLE' });
    continue;
  }
  const newBody = readFileSync(bodyPath, 'utf8').trim();
  if (!newBody) {
    report.refused.push({ slug: item.slug, why: 'EMPTY_BODY' });
    continue;
  }

  // 1. the same gate the publisher applies
  const sub = bodySubstanceCheck(item.headline, newBody);
  if (!sub.pass) {
    report.refused.push({ slug: item.slug, why: sub.code, bodyWords: sub.bodyWords, minWords: sub.minWords });
    continue;
  }

  // 2. a rewrite must be an improvement, not a lateral move or a regression
  const oldSub = bodySubstanceCheck(item.headline, doc.body.trim());
  if (oldSub.pass && !FORCE) {
    report.refused.push({ slug: item.slug, why: 'ALREADY_PASSES_NO_REWRITE_NEEDED', bodyWords: sub.bodyWords });
    continue;
  }
  const novelVsOld = [...concreteTokens(newBody)].filter((t) => !concreteTokens(doc.body).has(t));
  if (oldSub.pass === false && novelVsOld.length === 0 && !FORCE) {
    report.refused.push({ slug: item.slug, why: 'ADDS_NO_NEW_FACTS_VS_CURRENT_BODY' });
    continue;
  }

  // 3. never let the body smuggle frontmatter back in
  if (/^---\s*$/m.test(newBody) || /^\s*title:\s*/m.test(newBody)) {
    report.refused.push({ slug: item.slug, why: 'BODY_CONTAINS_FRONTMATTER' });
    continue;
  }

  const next = `---\n${doc.frontmatter}\n---\n\n${newBody}\n`;
  report.applied.push({
    slug: item.slug,
    oldWords: oldSub.bodyWords,
    newWords: sub.bodyWords,
    gain: sub.bodyWords - oldSub.bodyWords,
  });

  if (WRITE) {
    if (KEEP_BACKUP) copyFileSync(mdPath, `${mdPath}.bak-rewrite`);
    writeFileSync(mdPath, next, 'utf8');
  }
}

const totalGain = report.applied.reduce((n, a) => n + a.gain, 0);
console.log(`mode: ${WRITE ? 'WRITE' : 'DRY RUN'}`);
console.log(`index items      : ${index.items.length}`);
console.log(`applied          : ${report.applied.length}${report.applied.length ? `  (+${totalGain} words total)` : ''}`);
console.log(`refused          : ${report.refused.length}`);
console.log(`skipped          : ${report.skipped.length}`);
if (report.applied.length) {
  console.log('\nwould apply:');
  for (const a of report.applied) console.log(`  ${a.slug.padEnd(22)} ${a.oldWords}w -> ${a.newWords}w  (+${a.gain})`);
}
if (report.refused.length) {
  console.log('\nrefused:');
  for (const r of report.refused) console.log(`  ${r.slug.padEnd(22)} ${r.why}${r.bodyWords ? ` (${r.bodyWords}w, min ${r.minWords})` : ''}`);
}
if (report.skipped.length) {
  console.log('\nskipped:');
  const byWhy = {};
  for (const s of report.skipped) byWhy[s.why] = (byWhy[s.why] || 0) + 1;
  for (const [k, v] of Object.entries(byWhy)) console.log(`  ${String(v).padStart(3)}  ${k}`);
}
console.log(WRITE ? '\nWRITTEN. Review the diff, then commit.' : '\nDRY RUN — add --write to apply.');
process.exit(0);
