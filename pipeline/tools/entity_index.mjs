// tools/entity_index.mjs — build the ACTOR REGISTRY from stored claims (P0-10).
// For every claim: extract actor mentions (lib/identity), resolve to a canonical
// identity, upsert actors + actors_claims links. Pure, idempotent, additive —
// the registry never mutates claims/verdicts.
//
// usage: node tools/entity_index.mjs [--dry-run] [--verbose]
import { openDb } from '../lib/db.mjs';
import { extractActors, identityKey } from '../lib/identity.mjs';

const DRY = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const REBUILD = !process.argv.includes('--no-rebuild');

function upsertActor(db, { canonical, mention, claimId }) {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id, aliases_json FROM actors WHERE canonical = ?').get(canonical);
  if (existing) {
    if (db.prepare('SELECT 1 FROM actors_claims WHERE actor_id=? AND claim_id=?').get(existing.id, claimId)) return existing.id;
    const aliases = new Set(JSON.parse(existing.aliases_json));
    if (mention !== canonical) aliases.add(mention);
    db.prepare('UPDATE actors SET aliases_json=?, last_seen=?, claim_count=claim_count+1 WHERE id=?')
      .run(JSON.stringify([...aliases].sort()), now, existing.id);
    return existing.id;
  }
  const info = db.prepare('INSERT INTO actors (canonical, aliases_json, kind, first_seen, last_seen, claim_count) VALUES (?,?,?,?,?,1)')
    .run(canonical, JSON.stringify(mention === canonical ? [] : [mention]), 'person', now, now);
  return Number(info.lastInsertRowid);
}

function run() {
  const db = openDb();
  if (!DRY && REBUILD) {
    // the registry is DERIVED data — rebuild it fresh each run so extraction
    // rule changes never leave stale/junk identities behind
    db.exec('DELETE FROM actors_claims; DELETE FROM actors;');
  }
  const claims = db.prepare(`
    SELECT c.id, c.cluster_id, c.claim_text, c.story_slug,
           (SELECT GROUP_CONCAT(COALESCE(e.excerpt,''), char(10)) FROM claim_evidence e WHERE e.claim_id = c.id) AS evidence
    FROM claims c
  `).all();
  if (!claims.length) { console.log('no claims in store — registry stays empty'); return; }

  let total = 0, linked = 0, unresolved = 0;
  const seen = new Map();
  for (const claim of claims) {
    const mentions = new Set([
      ...extractActors(claim.claim_text, { strict: true }),
      ...extractActors(claim.evidence ?? '', { strict: true }),
    ]);
    for (const m of mentions) {
      const canonical = identityKey(m);
      total++;
      if (!canonical) { unresolved++; continue; }
      if (seen.has(canonical)) { seen.set(canonical, seen.get(canonical) + 1); } else { seen.set(canonical, 1); }
      if (DRY) continue;
      const actorId = upsertActor(db, { canonical, mention: m, claimId: claim.id });
      db.prepare('INSERT OR IGNORE INTO actors_claims (actor_id, claim_id, mention, created_at) VALUES (?,?,?,?)')
        .run(actorId, claim.id, m, new Date().toISOString());
      linked++;
    }
  }

  const ranked = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`actors: ${claims.length} claims scanned, ${total} mentions, ${new Set(seen.keys()).size} distinct identities${DRY ? ' (DRY-RUN, nothing written)' : `, ${linked} links`}. unresolved=${unresolved}`);
  console.log('top identities by mention count:');
  for (const [k, n] of ranked) console.log(`  ${String(n).padStart(3)}  ${k}`);
}

run();