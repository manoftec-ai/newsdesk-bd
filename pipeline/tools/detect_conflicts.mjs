// tools/detect_conflicts.mjs — write STRUCTURED contradiction rows (P0-10).
// Scans claims + their evidence per cluster, runs deterministic detectors
// (quantity mismatch / polarity flip), and upserts typed `conflicts` rows that
// feed verifyClaim → any affected claim drops to CONFLICTING (and, downstream,
// stories get re-verified/flagged by the corrections engine).
//
// usage: node tools/detect_conflicts.mjs [--dry-run] [--verbose]
import { openDb } from '../lib/db.mjs';
import { extractAmounts, quantityGap, DEFAULT_MIN_REL, polarityConflict } from '../lib/conflict-detect.mjs';

const DRY = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function pairKey(rows) {
  return rows.map((r) => r.id).sort((a, b) => a - b).join('+');
}

function run() {
  const db = openDb();
  const claims = db.prepare(`
    SELECT c.id, c.cluster_id, c.claim_text, c.status,
           (SELECT GROUP_CONCAT(COALESCE(e.excerpt,''), char(10)) FROM claim_evidence e WHERE e.claim_id = c.id) AS evidence
    FROM claims c WHERE c.cluster_id IS NOT NULL
  `).all();
  const byCluster = new Map();
  for (const c of claims) {
    if (!byCluster.has(c.cluster_id)) byCluster.set(c.cluster_id, []);
    byCluster.get(c.cluster_id).push(c);
  }

  let quantity = 0, polarity = 0, existing = 0;
  const written = new Set();

  const write = (entry) => {
    if (DRY) { quantity += entry.conflict_type === 'quantity' ? 1 : 0; polarity += entry.conflict_type === 'polarity' ? 1 : 0; return; }
    const already = db.prepare(
      'SELECT 1 FROM conflicts WHERE conflict_type=? AND field=? AND values_json=? AND resolution= ?').get(
      entry.conflict_type, entry.field, JSON.stringify(entry.values), 'unresolved');
    if (already) { existing++; return; }
    if (written.has(pairKey(entry.source_rows))) { existing++; return; }
    written.add(pairKey(entry.source_rows));
    db.prepare(`
      INSERT INTO conflicts (cluster_id, claim_id, conflict_type, field, values_json, sources_json, resolution, created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(entry.cluster_id, entry.claim_id ?? null, entry.conflict_type, entry.field,
      JSON.stringify(entry.values), JSON.stringify(entry.sources), 'unresolved', new Date().toISOString());
    quantity += entry.conflict_type === 'quantity' ? 1 : 0;
    polarity += entry.conflict_type === 'polarity' ? 1 : 0;
  };

  for (const [clusterId, clusterClaims] of byCluster) {
    const texts = clusterClaims.map((c) => ({ id: c.id, text: c.claim_text, excerpt: c.evidence ?? '', sources: [c.status] }));
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const A = texts[i], B = texts[j];
        if (A.id === B.id) continue;
        // --- quantity: amounts inside each claim's OWN text (comparing against
// evidence excerpts cross-multiplies distinct metrics — deaths vs admissions —
// and drowns the signal in false conflicts)
        const valsA = [...extractAmounts(A.text)].filter((v) => v.value >= 10);
        const valsB = [...extractAmounts(B.text)].filter((v) => v.value >= 10);
        for (const va of valsA) {
          for (const vb of valsB) {
            const gap = quantityGap(va, vb);
            if (gap === null || gap < DEFAULT_MIN_REL) continue;
            if (Math.abs(va.value - vb.value) < 2) continue;
            const mine = `${va.value} ${va.unit}`, yours = `${vb.value} ${vb.unit}`;
            if (mine === yours) { continue; } // identical scaled-value rows are not conflicts
            write({
              conflict_type: 'quantity', cluster_id: clusterId, claim_id: A.id,
              field: va.unit || mine, values: [mine, yours],
              sources: ['c' + A.id, 'c' + B.id], source_rows: [A, B],
            });
          }
        }
        // --- polarity: same anchor verb affirmed vs negated across the pair
        const pol = polarityConflict(A.text + ' ' + A.excerpt, B.text + ' ' + B.excerpt);
        if (pol) {
          write({
            conflict_type: 'polarity', cluster_id: clusterId, claim_id: A.id,
            field: pol.field, values: pol.values, sources: ['c' + A.id, 'c' + B.id], source_rows: [A, B],
          });
        }
      }
    }
  }

  const mode = DRY ? 'DRY-RUN (nothing written)' : 'rows written';
  console.log(`conflicts: ${claims.length} claims / ${byCluster.size} clusters scanned -> quantity=${quantity} polarity=${polarity} (${mode})${existing ? `, ${existing} already existing` : ''}`);
}

run();