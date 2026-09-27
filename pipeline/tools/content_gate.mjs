#!/usr/bin/env node
// CI gate: fail the build when a NEW content defect appears.
//
// 2026-09-27. The defect classes behind national-532 were fixed in the audit
// (D121), but a fix in a tool only protects the path that uses the tool, and
// there are several: auto-author.yml, author.yml, history-batch.yml and
// watcher.yml all write into site/src/content/news, and only the first passes
// through mechanicalAudit's c12. content_audit.mjs was a manual tool that
// nothing ran.
//
// So the check runs over the PUBLISHED corpus instead, which covers every write
// path regardless of which tool wrote it. A committed baseline lists the
// findings that are known and accepted, so this fails on regressions rather than
// on history, and the baseline can be re-baselined deliberately.
//
// The baseline key includes a SEVERITY figure, not just slug+code. Keyed on
// slug+code alone, an article already in the baseline could take a third
// same-outlet source and still pass, because it was the same key - verified by
// injecting exactly that and watching the gate stay green.
//
//   node tools/content_gate.mjs            check against the baseline (CI)
//   node tools/content_gate.mjs --bless    accept the current findings
//
// Exit 0 = pass, 1 = new defect.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = import.meta.dirname;
const BASELINE = resolve(HERE, '../state/content-audit-baseline.json');
const AUDIT = resolve(HERE, 'content_audit.mjs');

// Reported but never failing: this detector cannot tell a proper noun from junk
// ("FBI MedLink" is a real programme name, not English leaking into Bengali).
// Recorded here so the exclusion is a decision on the record rather than
// something someone re-adds by hand later.
const ADVISORY = new Set(['MIXED_LANGUAGE']);

// REPEATED_PARAGRAPH and FRAGMENTED_PROSE are new and must not be baselined: the
// point of the baseline is to stop history blocking the build, not to give a
// class a permanent pass.

const out = execFileSync(process.execPath, [AUDIT, '--json'], {
  cwd: resolve(HERE, '..'),
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
const findings = JSON.parse(out);

const current = new Map();
for (const f of findings) {
  for (const i of f.issues) {
    if (ADVISORY.has(i.code)) continue;
    const severity = i.severity ?? '';
    const key = severity ? `${f.slug} ${i.code} ${severity}` : `${f.slug} ${i.code}`;
    current.set(key, { slug: f.slug, code: i.code, severity, detail: i.detail });
  }
}

if (process.argv.includes('--bless')) {
  writeFileSync(BASELINE, `${JSON.stringify([...current.keys()].sort(), null, 2)}\n`, 'utf8');
  console.log(`  baseline written: ${current.size} accepted finding(s)`);
  process.exit(0);
}

const baseline = new Set(existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : []);

const regressed = [...current.entries()].filter(([k]) => !baseline.has(k));
const cleared = [...baseline].filter((k) => !current.has(k));

console.log(`  content gate: ${findings.length} article(s) carry findings`);
console.log(`    accepted by baseline : ${current.size - regressed.length}`);
console.log(`    NEW (build fails)   : ${regressed.length}`);
console.log(`    fixed since baseline: ${cleared.length}`);

if (cleared.length) {
  console.log('  no longer reproducing (re-baseline with --bless):');
  for (const k of cleared.slice(0, 10)) console.log(`    ${k}`);
}

if (regressed.length) {
  console.log('');
  console.log('  NEW CONTENT DEFECTS — these must not ship:');
  for (const [, v] of regressed) {
    console.log(`    ${v.slug}  ${v.code}${v.severity ? ` [${v.severity}]` : ''}  ${v.detail}`);
  }
  console.log('');
  console.log('  Full report: node tools/content_audit.mjs');
  process.exit(1);
}
