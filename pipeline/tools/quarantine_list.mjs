#!/usr/bin/env node
// Durable quarantine: remember that a slug must never be published again.
//
// 2026-07-27. tools/quarantine_offtopic.mjs deleted 12 articles, and one of them
// - national-422, whose body shares 0% of its headline's vocabulary - was BACK
// within the hour, with a fresh publication.checkedAt. Deleting the file is not
// a quarantine: the brief is still in the pool, the picker still selects it, and
// the author republishes the same wrong content.
//
// So a removal also records the slug here, and the picker skips it. A brief that
// produced an article about a different story has to be fixed at the BRIEF, not
// retried forever.
//
//   node tools/quarantine_list.mjs --add <slug> --why "…"
//   node tools/quarantine_list.mjs --remove <slug>
//   node tools/quarantine_list.mjs            list

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve(import.meta.dirname, '../state/quarantine.json');

function load() {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

/** value for a bare flag: --add national-422  ->  "national-422" */
const flagValue = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return null;
  return process.argv[i + 1] ?? null;
};

const list = load();

if (process.argv.includes('--add')) {
  const slug = flagValue('add');
  if (!slug) {
    console.error('  usage: --add <slug> --why "reason"');
    process.exit(2);
  }
  list[slug] = { why: arg('why') ?? 'unspecified', at: new Date().toISOString() };
  writeFileSync(FILE, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
  console.log(`  quarantined: ${slug}  (${Object.keys(list).length} total)`);
  process.exit(0);
}

if (process.argv.includes('--remove')) {
  const slug = flagValue('remove');
  if (!slug) {
    console.error('  usage: --remove <slug>');
    process.exit(2);
  }
  if (list[slug]) {
    delete list[slug];
    writeFileSync(FILE, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
    console.log(`  released: ${slug}`);
  } else {
    console.log(`  not quarantined: ${slug}`);
  }
  process.exit(0);
}

const keys = Object.keys(list);
console.log(`  quarantined slugs: ${keys.length}`);
for (const k of keys) console.log(`    ${k.padEnd(30)}${list[k].why}`);
