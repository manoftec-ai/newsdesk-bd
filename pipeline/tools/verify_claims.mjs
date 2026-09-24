// tools/verify_claims.mjs — apply claim-level verification to the whole graph
// usage: node tools/verify_claims.mjs
import { openDb } from '../lib/db.mjs';
import { applyClaimVerification } from '../lib/claim-verify.mjs';

const db = openDb();
const n = applyClaimVerification(db);
const rows = db.prepare('SELECT status, count(*) AS n FROM claims GROUP BY status ORDER BY n DESC').all();
console.log(`claims verified: ${n}`);
for (const r of rows) console.log(`  ${r.status}: ${r.n}`);
db.close();