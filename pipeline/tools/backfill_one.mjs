#!/usr/bin/env node
// tools/backfill_one.mjs — dry-run re-render of ONE old article with today's mirrored prompt.
// Usage: node pipeline/tools/backfill_one.mjs --slug=national-103 [--write]
// --write actually calls LLM via render_prompt → opencode? No LLM here — it only re-validates
// the existing MD against today's gates (findEditorialViolations, readerValue, headline) and
// shows what the mirrored prompt WOULD require (mode, length, claim rules). Safe, no pipeline break.
// For real LLM re-render, run: node pipeline/tools/render_prompt.mjs <slug> | llm

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BRIEFS_DIR } from '../lib/extract.mjs';
import { findEditorialViolations, prepBody } from '../lib/synth.mjs';
import { readerValueCheck } from '../lib/editorial.mjs';
import { verifyHeadline } from '../lib/headline-verify.mjs';
import yaml from 'yaml';

const slugArg = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1] || process.argv[2];
const write = process.argv.includes('--write');

if (!slugArg) {
  console.error('usage: node pipeline/tools/backfill_one.mjs --slug=<slug> [--write]');
  process.exit(1);
}

const siteDir = resolve(import.meta.dirname, '../../site/src/content/news');
const mdPath = join(siteDir, `${slugArg}.md`);
if (!existsSync(mdPath)) {
  console.error(`no such article: ${mdPath}`);
  process.exit(1);
}

const raw = readFileSync(mdPath, 'utf8');
const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
if (!m) { console.error('invalid frontmatter'); process.exit(1); }
const fm = yaml.parse(m[1]);
const body = m[2];

console.log(`=== backfill ${slugArg} ===`);
console.log(`title: ${fm.title}`);
console.log(`date: ${fm.date} category: ${fm.category} badge: ${fm.verification?.badge}`);
console.log(`body words: ${body.trim().split(/\s+/).length} tags: ${(fm.tags||[]).join(',')}`);

const violations = findEditorialViolations(body);
console.log(`violations: ${violations.length ? violations.map(v=>v.type+':'+v.match).join(' | ') : 'none'}`);

const rv = readerValueCheck(fm.title, body);
console.log(`readerValue: ${rv.ok ? 'PASS' : 'FAIL'} novel=${rv.novel.join(',')||'-'} bodyWords=${rv.bodyWords} headWords=${rv.headWords}`);

const hv = verifyHeadline(fm.title, { leads: [], claim: null });
console.log(`headline: ${hv.status} support=${Math.round(hv.support*100)}%`);

// Brief-driven prompt preview (if brief exists)
const briefPath = join(BRIEFS_DIR, `${slugArg}.json`);
if (existsSync(briefPath)) {
  const brief = JSON.parse(readFileSync(briefPath,'utf8'));
  const { default: synth } = await import('../lib/synth.mjs');
  // dynamic import to avoid circular
  const { writingPrompt } = await import('../lib/synth.mjs');
  const prompt = writingPrompt(brief);
  console.log(`\n--- mirrored prompt preview (first 600 chars) ---\n${prompt.slice(0,600)}\n... (${prompt.length} chars total)`);
  console.log(`prompt mode: ${brief.category} verification:${brief.verdict?.badge}`);
} else {
  console.log('no brief JSON — prompt preview skipped (brief pruned)');
}

if (write) {
  console.log('\n--write not implemented for LLM re-render in this dry-run tool — use render_prompt + LLM manually');
} else {
  console.log('\nDry-run only — no file written. Use --write to actually re-render via LLM (requires human review).');
}
