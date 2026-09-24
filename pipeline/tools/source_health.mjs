// tools/source_health.mjs — SOURCE HEALTH report (read-only, advisory).
//
// Prints a per-source reliability profile derived from the claim/evidence/
// snapshot ledger: claims supported, conflict-affected share, stale-evidence
// share, independence, health score + label. Flags the flagged sources for the
// verify layer. Pure reads — never writes trust.json or the store.
//
// usage: node tools/source_health.mjs [--json] [--min-evidence=3]
import { openDb } from '../lib/db.mjs';
import { loadSourceHealth, HEALTH_LABELS } from '../lib/source-health.mjs';
import { loadTrust } from '../lib/verify.mjs';

const JSON_OUT = process.argv.includes('--json');
const minEv = Number(process.argv.find((a) => a.startsWith('--min-evidence='))?.split('=')[1]) || 3;

export function renderHealth(health, { minEvidence = minEv } = {}) {
  const rows = Object.values(health)
    .filter((h) => h.evidence_rows >= minEvidence)
    .sort((a, b) => a.health_score - b.health_score);
  const lines = [];
  for (const h of rows) {
    lines.push(
      `${h.source_id.padEnd(14)} ${h.health_label.padEnd(8)} score=${String(h.health_score).padStart(3)} ` +
      `claims=${String(h.claims_supported).padStart(2)} conflict=${String(h.conflict_affected).padStart(2)} ` +
      `stale=${(h.stale_share * 100).toFixed(0).padStart(2)}% indep=${h.independent ? 'own' : 'wire'} rep=${h.reputation ?? '-'}`,
    );
  }
  return lines.join('\n');
}

export function flaggedSources(health, { minEvidence = minEv } = {}) {
  return Object.values(health).filter((h) => h.evidence_rows >= minEvidence && h.health_label === HEALTH_LABELS.flagged);
}

function run() {
  const db = openDb();
  const health = loadSourceHealth(db, { trust: loadTrust() });
  const flagged = flaggedSources(health);
  if (JSON_OUT) {
    console.log(JSON.stringify({ sources: health, flagged: flagged.map((f) => f.source_id) }, null, 2));
    db.close();
    return;
  }
  console.log(renderHealth(health));
  console.log(`\n${Object.keys(health).length} sources profiled; ${flagged.length} flagged (evidence-driven reliability warning only — trust.json untouched).`);
  db.close();
}

if (import.meta.url === `file://${process.argv[1]}`) run();