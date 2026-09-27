// Remove published articles whose body carries the website's own furniture.
//
// 2026-07-27. 24 live articles were published from leads that a naive extractor
// had filled with menu rows, "প্রকাশিত :" bylines, "ছবি:" photo credits and
// "সম্পর্কিত" link farms. Measured cause: 21 of 59 briefs with a fetched-page
// lead were affected, against 0 of 249 with a plain RSS lead.
//
// The articles are deleted rather than edited, so each returns to the brief pool
// and is republished from clean text. The composer now rejects furniture
// outright (lib/prose.mjs), so a brief can only return if its evidence is real.
//
//   node tools/quarantine_chrome.mjs [--dry-run]

import fs from 'node:fs';
import { proseProblem } from '../lib/prose.mjs';

const DIR = '../site/src/content/news';
const dryRun = process.argv.includes('--dry-run');

const removed = [];
const kept = [];

for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.md'))) {
  const raw = fs.readFileSync(`${DIR}/${f}`, 'utf8');
  // body only: everything after the closing frontmatter fence
  const body = raw.split(/^---$/mu).slice(2).join('\n');
  // a paragraph of furniture is a paragraph of furniture
  const paragraphs = body.split(/\n\s*\n/);
  const bad = paragraphs.find((p) => proseProblem(p) !== null);
  if (bad) removed.push({ slug: f.replace(/\.md$/, ''), why: proseProblem(bad) });
  else kept.push(f);
}

console.log(`  articles scanned : ${removed.length + kept.length}`);
console.log(`  contaminated      : ${removed.length}`);
const byWhy = {};
for (const r of removed) byWhy[r.why] = (byWhy[r.why] ?? 0) + 1;
for (const [k, v] of Object.entries(byWhy).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${k.padEnd(18)} ${v}`);
}

if (dryRun) {
  console.log('  dry run, nothing deleted');
} else {
  for (const r of removed) fs.rmSync(`${DIR}/${r.slug}.md`, { force: true });
  console.log(`  removed ${removed.length} articles; they return to the brief pool`);
}
