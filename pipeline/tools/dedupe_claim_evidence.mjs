#!/usr/bin/env node
// tools/dedupe_claim_evidence.mjs — collapse the 58,015-row claim_evidence
// table to its 1,207 distinct rows, WITHOUT inventing timeline events.
//
// WHY (2026-09-26)
//   store.db crossed GitHub's 100 MB hard file-size limit at 100.89 MB, which
//   made every push fail with GH001. dbstat blames claim_evidence at 62 MB.
//
//   58,015 rows, 1,207 distinct (claim_id, url, excerpt) — a 48x duplication.
//   The pipeline re-attaches the same evidence on every run and never dedupes.
//
// WHY THIS IS NOT JUST "DELETE FROM claim_evidence WHERE ..."
//   lib/claim-verify.mjs:190 decides whether anything changed by comparing a
//   stored evidence_hash against a freshly computed one:
//     if (open.status === status && open.confidence === conf && open.evidence_hash === hash)
//       -> no state change, leave the open period running
//       -> otherwise CLOSE the open period and OPEN a new one, reason 'verify'
//   evidenceHash() maps every non-contradicted row to source|url|published_at
//   and hashes the lot, so duplicates are inside the hash. Deleting them without
//   repairing the hash would make all 571 open snapshots look like the evidence
//   had changed, and every affected published article would gain a false
//   "যাচাই-অবস্থা বদলেছে" timeline entry.
//
// SO: dedupe, then recompute each open snapshot's hash and counts from the
// deduped rows, in one transaction. After that the next verify run compares
// equal, writes nothing, and no reader sees a phantom update.
//
// SAFE BY DEFAULT: dry run. Nothing is written without --write.
//   node tools/dedupe_claim_evidence.mjs           # report only
//   node tools/dedupe_claim_evidence.mjs --write   # migrate + VACUUM
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = resolve(import.meta.dirname, '../state/store.db');
const WRITE = process.argv.includes('--write');

// Byte-for-byte the function in lib/claim-verify.mjs. If that one changes, this
// must change with it, or the migration will write hashes the pipeline will not
// reproduce.
function evidenceHash(evidence) {
  const parts = evidence
    .filter((e) => e.relation !== 'contradicts')
    .map((e) => [e.source_id, e.url ?? '', e.published_at ?? ''].join('|'))
    .sort();
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
}

const startSize = (statSync(DB_PATH).size / 1048576).toFixed(2);
const db = new DatabaseSync(DB_PATH, { readOnly: !WRITE });
if (WRITE) db.exec('BEGIN IMMEDIATE');

const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);

const before = {
  evidenceRows: one('SELECT COUNT(*) c FROM claim_evidence').c,
  distinctEvidence: one('SELECT COUNT(*) c FROM (SELECT DISTINCT claim_id,url,excerpt FROM claim_evidence)').c,
  claims: one('SELECT COUNT(*) c FROM claims').c,
  snapshots: one('SELECT COUNT(*) c FROM claim_snapshots').c,
  openSnapshots: one('SELECT COUNT(*) c FROM claim_snapshots WHERE valid_until IS NULL').c,
  statuses: all('SELECT status, COUNT(*) c FROM claim_snapshots WHERE valid_until IS NULL GROUP BY status'),
};

console.log(`store.db: ${startSize} MB`);
console.log(`  claim_evidence rows : ${before.evidenceRows}  (distinct: ${before.distinctEvidence})`);
console.log(`  claims              : ${before.claims}`);
console.log(`  snapshots           : ${before.snapshots} (open: ${before.openSnapshots})`);
console.log('');

const dupes = one(
  `SELECT COUNT(*) c FROM claim_evidence
    WHERE id NOT IN (SELECT MIN(id) FROM claim_evidence GROUP BY claim_id,url,excerpt)`,
).c;
console.log(`  removable duplicate rows: ${dupes}`);
console.log(`  mode: ${WRITE ? 'WRITE (migrate + VACUUM)' : 'DRY RUN — add --write'}`);
console.log('');

if (!WRITE) {
  console.log('DRY RUN — nothing was changed.');
  db.close();
  process.exit(0);
}

// 1. Collapse duplicates, keeping the earliest row of each distinct tuple.
db.exec(
  `DELETE FROM claim_evidence
    WHERE id NOT IN (SELECT MIN(id) FROM claim_evidence GROUP BY claim_id,url,excerpt)`,
);

// 2. Repair every open snapshot so the next verify run sees no change.
const claimIds = all('SELECT DISTINCT claim_id FROM claim_evidence').map((r) => r.claim_id);
const evStmt = db.prepare(
  'SELECT source_id, url, published_at, relation FROM claim_evidence WHERE claim_id = ?',
);
const openStmt = db.prepare('SELECT id FROM claim_snapshots WHERE claim_id = ? AND valid_until IS NULL');
const updStmt = db.prepare(
  'UPDATE claim_snapshots SET evidence_hash = ?, support_count = ?, contradiction_count = ?, evidence_count = ? WHERE id = ?',
);

let repaired = 0;
for (const claimId of claimIds) {
  const rows = evStmt.all(claimId);
  const support = rows.filter((r) => r.relation !== 'contradicts');
  const contradict = rows.filter((r) => r.relation === 'contradicts');
  const hash = evidenceHash(rows);
  for (const { id } of openStmt.all(claimId)) {
    updStmt.run(hash, support.length, contradict.length, rows.length, id);
    repaired++;
  }
}
db.exec('COMMIT');

console.log(`  deleted ${dupes} duplicate rows`);
console.log(`  repaired ${repaired} open snapshots (hash + counts)`);

// 3. Prove nothing reader-visible changed.
const after = {
  evidenceRows: one('SELECT COUNT(*) c FROM claim_evidence').c,
  claims: one('SELECT COUNT(*) c FROM claims').c,
  snapshots: one('SELECT COUNT(*) c FROM claim_snapshots').c,
  openSnapshots: one('SELECT COUNT(*) c FROM claim_snapshots WHERE valid_until IS NULL').c,
  statuses: all('SELECT status, COUNT(*) c FROM claim_snapshots WHERE valid_until IS NULL GROUP BY status'),
};
const fmt = (s) => JSON.stringify(Object.fromEntries(s.map((x) => [x.status, x.c])));
console.log('');
console.log('  VERIFICATION');
console.log(`    evidence rows  ${before.evidenceRows} -> ${after.evidenceRows}`);
console.log(`    claims         ${before.claims} -> ${after.claims}   ${after.claims === before.claims ? 'unchanged' : 'CHANGED'}`);
console.log(`    snapshots      ${before.snapshots} -> ${after.snapshots}   ${after.snapshots === before.snapshots ? 'unchanged' : 'CHANGED'}`);
console.log(`    open snapshots ${before.openSnapshots} -> ${after.openSnapshots}   ${after.openSnapshots === before.openSnapshots ? 'unchanged' : 'CHANGED'}`);
console.log(`    open statuses  ${fmt(after.statuses)}`);
console.log(`                    ${fmt(before.statuses)}`);

// Every stored hash must now equal what the pipeline would recompute.
let mismatched = 0;
for (const claimId of claimIds) {
  const rows = evStmt.all(claimId);
  const expected = evidenceHash(rows);
  for (const { id } of openStmt.all(claimId)) {
    const stored = one('SELECT evidence_hash FROM claim_snapshots WHERE id = ?', id).evidence_hash;
    if (stored !== expected) mismatched++;
  }
}
console.log(`    hashes the pipeline will not reproduce: ${mismatched}  ${mismatched === 0 ? '(so no phantom timeline events)' : 'INVESTIGATE'}`);

db.exec('VACUUM');
db.close();

const size = Number(statSync(DB_PATH).size) / 1048576;
console.log('');
console.log(`  store.db now ${size.toFixed(2)} MB (was  MB) — GitHub limit is 100.00 MB`);
if (size >= 100) console.log('  STILL OVER THE LIMIT — push will keep failing');
else console.log('  under the limit, pushes will work again');
