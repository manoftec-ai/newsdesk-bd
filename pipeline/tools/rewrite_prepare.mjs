#!/usr/bin/env node
// tools/rewrite_prepare.mjs — stage 1 of the stub-rewrite path.
//
// WHY: the body-substance floor (150 words) and the 1200-char evidence cap are
// FORWARD-ONLY. The 169 already-published stub articles still carry their old
// short bodies, and nothing regenerates them: exportBriefs() skips any headline
// that is already published (the title-duplicate guard), so `extract` will
// never rebuild their briefs.
//
// This tool builds the missing path, in two deliberate phases so that NO tool
// ever invents prose:
//   1. rewrite_prepare  — pick eligible stubs, rebuild a CURRENT brief from the
//                         cluster, render the real writingPrompt to a file.
//   2. (agent authors the body into pipeline/tmp/rewrite/<slug>.b.md)
//   3. rewrite_apply    — validate the body, then splice it in while keeping
//                         the published frontmatter BYTE-IDENTICAL.
//
// Eligibility: the article must currently FAIL the substance floor AND have at
// least one source whose stored body is real (>= --min-source chars). A stub
// whose sources are still headline-only cannot be honestly rewritten yet.
//
// Usage:
//   node tools/rewrite_prepare.mjs                     # report only
//   node tools/rewrite_prepare.mjs --limit=20          # write 20 prompt files
//   node tools/rewrite_prepare.mjs --min-source=1200
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openDb } from '../lib/db.mjs';
import { BRIEFS_DIR, buildBrief } from '../lib/extract.mjs';
import { writingPrompt } from '../lib/synth.mjs';
import { bodySubstanceCheck } from '../lib/editorial.mjs';

const SITE_DIR = resolve(import.meta.dirname, '../../site/src/content/news');
const OUT_DIR = resolve(import.meta.dirname, '../tmp/rewrite');
const INDEX = resolve(OUT_DIR, 'index.json');

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const LIMIT = Number(arg('limit') ?? 0);
const MIN_SOURCE = Number(arg('min-source') ?? 1200);
const flag = (n) => process.argv.includes(`--${n}`);

const DRY = !flag('write');
const db = openDb();

// published slugs
const published = new Set(readdirSync(SITE_DIR).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')));

const rows = [];
let thinTotal = 0;
let noBrief = 0;
let noRichSource = 0;

for (const slug of published) {
  const mdPath = join(SITE_DIR, `${slug}.md`);
  let text;
  try {
    text = readFileSync(mdPath, 'utf8');
  } catch {
    continue;
  }
  const parts = text.split(/^---\s*$/m);
  const title = ((parts[1] || '').match(/^title:\s*(.+)$/m) || [])[1];
  const body = parts.slice(2).join('\n').trim();
  if (!title || !body) continue;
  const headline = String(title).trim().replace(/^['"]|['"]$/g, '');
  if (bodySubstanceCheck(headline, body).pass) continue; // already fine
  thinTotal++;

  const briefPath = join(BRIEFS_DIR, `${slug}.json`);
  if (!existsSync(briefPath)) {
    noBrief++;
    continue;
  }
  let stored;
  try {
    stored = JSON.parse(readFileSync(briefPath, 'utf8'));
  } catch {
    noBrief++;
    continue;
  }

  // Build the CURRENT brief FIRST and judge eligibility from ITS members.
  // This ordering matters: the brief on disk can be stale (exportBriefs skips
  // already-published headlines), so its member list may name different rows
  // than the ones the cluster actually has now. Judging on the stored brief
  // while rendering the prompt from buildBrief() can mark a story eligible on
  // the strength of a source the prompt never shows - i.e. invite a rewrite
  // written from a headline-only pool.
  let fresh;
  try {
    fresh = buildBrief(stored.clusterId, { db });
  } catch {
    fresh = null;
  }
  if (!fresh || !Array.isArray(fresh.members) || !fresh.members.length) {
    noBrief++;
    continue;
  }

  let bestChars = 0;
  for (const m of fresh.members) {
    const r = db.prepare('SELECT length(body) lb FROM raw_items WHERE url = ?').get(m.url);
    if (r?.lb && r.lb > bestChars) bestChars = r.lb;
  }
  if (bestChars < MIN_SOURCE) {
    noRichSource++;
    continue;
  }

  rows.push({ slug, clusterId: stored.clusterId, headline, bestChars, brief: fresh });
}

rows.sort((a, b) => a.bestChars - b.bestChars);
const selected = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;

console.log(`published articles        : ${published.size}`);
console.log(`currently under the floor : ${thinTotal}`);
console.log(`  no brief on disk        : ${noBrief}`);
console.log(`  no rich source yet      : ${noRichSource}   (cannot be rewritten honestly yet)`);
console.log(`ELIGIBLE for rewrite      : ${rows.length}`);
console.log(`selected this run         : ${selected.length}   (min source ${MIN_SOURCE} chars)`);
console.log(`mode                      : ${DRY ? 'DRY RUN' : 'WRITE'}`);

if (!selected.length) {
  console.log('\nnothing to do — run tools/enrich_bodies.mjs to widen the eligible set.');
  db.close();
  process.exit(0);
}

if (DRY) {
  console.log('\ntop candidates by available material:');
  for (const r of rows.slice(0, 12)) console.log(`  ${String(r.bestChars).padStart(6)} chars  ${r.slug}`);
  console.log('\nadd --write to render the prompts.');
  db.close();
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
const index = [];
let rendered = 0;
const failures = [];

for (const row of selected) {
  try {
    // Rebuild a CURRENT brief so the leads carry the new 1200-char cap.
    const fresh = row.brief;
    if (!fresh) {
      failures.push({ slug: row.slug, why: 'buildBrief-null' });
      continue;
    }
    const prompt = writingPrompt(fresh);
    writeFileSync(join(OUT_DIR, `${row.slug}.prompt.txt`), prompt, 'utf8');
    index.push({
      slug: row.slug,
      headline: row.headline,
      clusterId: row.clusterId,
      bestSourceChars: row.bestChars,
      promptFile: `${row.slug}.prompt.txt`,
      bodyFile: `${row.slug}.b.md`,
    });
    rendered++;
  } catch (e) {
    failures.push({ slug: row.slug, why: String(e.message).slice(0, 120) });
  }
}

writeFileSync(INDEX, `${JSON.stringify({ generatedAt: new Date().toISOString(), minSource: MIN_SOURCE, items: index }, null, 2)}\n`, 'utf8');
db.close();

console.log(`\nprompts rendered: ${rendered} -> ${OUT_DIR}`);
if (failures.length) {
  console.log('failures:');
  for (const f of failures) console.log(`  ${f.slug}: ${f.why}`);
}
console.log(`\nnext: an agent writes each body to ${OUT_DIR}/<slug>.b.md,`);
console.log('then run: node tools/rewrite_apply.mjs --write');
process.exit(0);
