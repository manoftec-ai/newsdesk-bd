// 2026-07-27: national-422 was deleted from the site and BACK within the hour,
// with a fresh publication.checkedAt. Deleting the article is not a quarantine:
// the brief is still in the pool, the picker still selects it, and the author
// republishes the same wrong content. The removal has to be recorded somewhere
// the picker reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const HERE = import.meta.dirname;
const FILE = resolve(HERE, '../state/quarantine.json');
const picker = readFileSync(join(HERE, '../tools/pick_briefs.mjs'), 'utf8');

test('the quarantine list exists and records a reason per slug', () => {
  assert.ok(existsSync(FILE), 'state/quarantine.json is missing');
  const list = JSON.parse(readFileSync(FILE, 'utf8'));
  const keys = Object.keys(list);
  assert.ok(keys.length > 0, 'the quarantine list is empty');
  for (const k of keys) {
    assert.ok(list[k]?.why, `${k} has no reason recorded`);
    assert.ok(list[k]?.at, `${k} has no timestamp`);
  }
});

test('the picker reads the quarantine list and skips those slugs', () => {
  assert.match(picker, /quarantine\.json/, 'the picker never reads the quarantine list');
  assert.match(
    picker,
    /!QUARANTINE\.has\(b\.slug\)/,
    'the picker does not skip quarantined slugs',
  );
});

test('the slugs removed for real defects are on the list', () => {
  const list = JSON.parse(readFileSync(FILE, 'utf8'));
  // national-422 is the one that came back, and national-532 is the article the
  // user reported
  for (const slug of ['national-422', 'national-532']) {
    assert.ok(list[slug], `${slug} is not quarantined, so it can be republished`);
  }
});
