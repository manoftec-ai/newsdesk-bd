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
//   node tools/sweep_quarantine.mjs                 report only
//   node tools/sweep_quarantine.mjs --commit        delete + quarantine
//   node tools/sweep_quarantine.mjs --commit --push and commit, push, file an issue
//
// outputs (for the workflow): removed=<n>  slugs=a,b,c

import { existsSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = import.meta.dirname;
const SITE = resolve(HERE, '../../site/src/content/news');
const BRIEFS = resolve(HERE, '../state/briefs');
const QUARANTINE = resolve(HERE, '../state/quarantine.json');
const REPO = resolve(HERE, '../..');
const commit = process.argv.includes('--commit');
const push = process.argv.includes('--push');

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
const noBrief = [];
for (const o of offenders) {
  const file = `${SITE}/${o.slug}.md`;
  if (existsSync(file)) {
    rmSync(file);
    removed.push(o.slug);
    if (!existsSync(`${BRIEFS}/${o.slug}.json`)) noBrief.push(o.slug);
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
  console.log(`    ${s.padEnd(30)}${hasBrief ? 'brief still on disk - fix the BRIEF, not the article' : 'no brief, nothing can republish it'}`);
}

process.stdout.write(`\nremoved=${removed.length}  slugs=${removed.join(',')}\n`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `removed=${removed.length}\nslugs=${removed.join(',')}\n`, 'utf8');
}

if (!push || !removed.length) process.exit(0);

// The workflow's first version gated its commit and issue steps on
// `steps.sweep.outputs.removed`, but this tool only ever printed that line to
// stdout and never wrote $GITHUB_OUTPUT. The output was therefore always null,
// both steps were SKIPPED, and the first live run reported "withheld 1" while
// leaving the article on the site and opening no issue - a green check that did
// nothing. So the tool now owns its own consequences: one step, no plumbing
// between steps that can silently no-op.
const git = (...args) => execFileSync('git', args, { cwd: REPO, stdio: 'inherit' });
git('config', 'user.name', 'newsdesk-bd-bot');
git('config', 'user.email', 'bot@newsdesk-bd.local');
git('add', '-A', 'site/src/content/news', 'pipeline/state/quarantine.json');
try {
  git(
    'commit',
    '-m', 'sweep: withhold articles that fail the content audit',
    '-m', 'Found by the hourly sweep, not by a reader. The audit REFUSES these rather than repairing them: every defect class found so far came from bad source text, and the writer reproduced it faithfully. Rewriting would mean inventing clauses the source never contained.',
  );
} catch {
  console.log('  (nothing to commit - a concurrent run won the race)');
  process.exit(0);
}
git('push');

if (process.env.GITHUB_TOKEN) {
  const slug = process.env.GITHUB_REPOSITORY ?? 'manoftec-ai/newsdesk-bd';
  const body = [
    'The hourly content sweep found article(s) that fail the audit and withdrew them.',
    'They are quarantined now, so the picker will not republish them.',
    '',
    ...removed.map((s) => {
      const why = list[s]?.why ?? '(no reason recorded)';
      return `- \`${s}\`${noBrief.includes(s) ? ' - no brief on disk, nothing can republish it' : ' - brief still on disk, fix the BRIEF'}\n  ${why}`;
    }),
    '',
    'They are NOT repaired. Every defect class found so far came from bad source text that the writer reproduced faithfully, so rewriting would mean inventing what the source did not say.',
    '',
    `Sweep run: https://github.com/${slug}/actions/runs/${process.env.GITHUB_RUN_ID ?? 'local'}`,
  ].join('\n');

  const res = await fetch(`https://api.github.com/repos/${slug}/issues`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'newsdesk-sweep',
    },
    body: JSON.stringify({
      title: `Content sweep withheld ${removed.length} article(s)`,
      body,
    }),
  });
  console.log(`  issue filed: HTTP ${res.status}${res.ok ? '' : ` ${await res.text()}`}`);
}
