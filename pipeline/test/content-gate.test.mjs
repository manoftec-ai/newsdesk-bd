// The content gate is the only thing standing between a bad article and
// production for the write paths that never touch mechanicalAudit: author.yml,
// history-batch.yml and watcher.yml all write into site/src/content/news, and
// only auto-author.yml runs the c12 check. The gate reads the PUBLISHED corpus
// instead, so it covers every path.
//
// Keyed on slug+code alone it was not enough, and that is what these two tests
// are about: an article already in the baseline must not be able to get worse
// without failing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = import.meta.dirname;
const TOOLS = resolve(HERE, '../tools');
const BASELINE = resolve(HERE, '../state/content-audit-baseline.json');

function gate() {
  try {
    const out = execFileSync(process.execPath, [join(TOOLS, 'content_gate.mjs')], {
      cwd: resolve(HERE, '..'),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

test('a baseline exists, so history does not fail the build forever', () => {
  assert.ok(existsSync(BASELINE), 'state/content-audit-baseline.json is missing');
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  assert.ok(Array.isArray(baseline), 'the baseline must be a list');
  for (const key of baseline) {
    assert.match(key, /^\S+ [A-Z_]+( .+)?$/, `baseline key is not slug+code[+severity]: ${key}`);
  }
});

test('the gate passes on the current corpus', () => {
  const r = gate();
  assert.equal(r.code, 0, `the content gate failed on an unchanged corpus:\n${r.out}`);
  assert.match(r.out, /NEW \(build fails\)\s*:\s*0/, `expected zero new defects:\n${r.out}`);
});

test('the gate key carries severity, not just slug and code', () => {
  // A self-corroborating article that takes a THIRD same-outlet source is a
  // worse defect, and keyed on slug+code alone it was the same key - so the
  // article could quietly get worse and the gate would stay green.
  const src = readFileSync(join(TOOLS, 'content_audit.mjs'), 'utf8');
  assert.match(src, /severity:/, 'the audit emits no severity figure');
  const g = readFileSync(join(TOOLS, 'content_gate.mjs'), 'utf8');
  assert.match(
    g,
    /const key = severity \? `\$\{f\.slug\} \$\{i\.code\} \$\{severity\}`/,
    'the gate key does not include severity',
  );
});
