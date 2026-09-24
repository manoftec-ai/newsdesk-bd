// tools/reverify_stories.mjs — CORRECTIONS + AUTO RE-VERIFICATION (P0).
// Re-checks every published story against the LIVE claims/verdict state and
// appends dated corrections to frontmatter when evidence deteriorated
// (verdict no longer passed / badge dropped / contradictory claim surfaced /
// headline now overclaims). Additive frontmatter only — body & headline never
// touched. Idempotent (a note already in updates[] is not re-appended).
//
// usage: node tools/reverify_stories.mjs [--dry-run] [--max=N] [--slug=SLUG]
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openDb } from '../lib/db.mjs';
import { loadBrief, storyExists } from '../lib/synth.mjs';
import { verifyHeadline } from '../lib/headline-verify.mjs';
import { detectCorrections, applyCorrection, loadFrontmatter } from '../lib/reverify.mjs';
import { claimTransitions } from '../lib/claim-verify.mjs';

const SITE_DIR = resolve(import.meta.dirname, '../../site/src/content/news');
const DRY = process.argv.includes('--dry-run');
const slugArg = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];
const maxArg = Number(process.argv.find((a) => a.startsWith('--max='))?.split('=')[1]);
const max = Number.isFinite(maxArg) && maxArg > 0 ? maxArg : Infinity;
// Never correct on stale evidence: a verdict older than this (hours) means the
// claims store has not been re-verified since — we cannot judge, so we skip.
const STALE_HOURS = Number(process.env.REVERIFY_STALE_HOURS ?? 26);
const maxVerdictAgeMs = STALE_HOURS * 60 * 60 * 1000;
const asOf = Date.now();
const isStale = (evaluatedAt) => {
  if (!evaluatedAt) return true;
  const t = new Date(evaluatedAt).getTime();
  if (Number.isNaN(t)) return true;
  return asOf - t > maxVerdictAgeMs;
};

function run() {
  const db = openDb();
  const files = readdirSync(SITE_DIR).filter((f) => f.endsWith('.md')).sort();
  let checked = 0, corrected = 0, skipped = 0, stale = 0;

  for (const f of files) {
    const slug = f.replace(/\.md$/, '');
    if (slugArg && slug !== slugArg) continue;
    if (checked >= max) break;
    checked++;
    const mdPath = join(SITE_DIR, f);
    let front;
    try { front = loadFrontmatter(mdPath).front; } catch { skipped++; continue; }
    if (front.draft) { skipped++; continue; } // not published

    // connect the story back to its cluster via its brief
    let brief = null;
    try {
      if (existsSync(join(import.meta.dirname, '../state/briefs', `${slug}.json`))) brief = loadBrief(slug);
    } catch { brief = null; }
    const clusterId = brief?.clusterId ?? front.clusterId ?? null;
    if (!clusterId) { skipped++; continue; } // historical/demo stories have no claims graph

    const verdict = db.prepare('SELECT tier, score, badge, status, evaluated_at FROM verdicts WHERE cluster_id=?').get(clusterId);
    const claims = db.prepare('SELECT id, claim_text, status, contradiction_count FROM claims WHERE cluster_id=?').all(clusterId);
    const timelines = {};
    for (const c of claims) timelines[c.id] = claimTransitions(db, c.id);
    const hdr = verifyHeadline(front.title ?? '', {
      leads: (brief?.members ?? []).map((m) => `${m.title ?? ''} ${m.lead ?? ''}`),
      claim: (claims ?? [])[0] ?? null,
    }).status;

    // freshness guard
    if (!isStale(verdict?.evaluated_at)) {
      const notes = detectCorrections({ front, verdict, claims, headlineStatus: hdr, timelines });
      if (!notes.length) { console.log(`~ ${slug}: ok (no reversal)`); continue; }
      if (DRY) { console.log(`! ${slug}: would correct -> ${notes.length}: ${notes[0]}`); corrected++; continue; }
      try {
        const res = applyCorrection({ mdPath, notes });
        if (res.changed) { corrected++; console.log(`+ ${slug}: corrected (${res.notes} note(s))`); }
        else console.log(`~ ${slug}: already corrected`);
      } catch (e) { console.error(`! ${slug}: ${e.message}`); }
      continue;
    }
    stale++;
    console.log(`? ${slug}: skipped (stale verdict ${verdict?.evaluated_at ?? 'none'})`);
  }

  db.close();
  console.log(`\nreverify done. checked=${checked} corrected=${corrected} skipped=${skipped} stale=${stale}${DRY ? ' (dry-run)' : ''}`);
}

run();