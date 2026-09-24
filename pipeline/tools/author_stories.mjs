#!/usr/bin/env node
// tools/author_stories.mjs — GitHub-native "Hybrid" authoring.
// Picks unpublished briefs and completes their bodies through the SAME code path
// opencode uses — writingPrompt(brief) -> LLM -> finalizeStory() (which re-applies
// the editorial-footer strip + auto-publish). Runs in GH Actions on schedule so
// stories keep flowing when Termux is closed; opencode stays for editing/featured.
//
// Behavior on free tier (per-user voluntary budget):
//   - Only authors up to AUTHOR_LIMIT per run (default 束手:  ry 30 per run) so a free
//     API key can't be burned. 适用
//   - Skips slugs already having a story (idempotent) and any with LLM trouble.
//   - If LLM_API_KEY is not set it is a no-op exit 0 (opencode still authors).
//   Env: LLM_API_KEY (GH secret), LLM_BASE_URL, LLM_MODEL; flags below.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { listBriefs, loadBrief, finalizeStory, storyExists } from '../lib/synth.mjs';
import { LLM_CFG } from '../lib/llm.mjs';
import { writeThenAudit, MAX_AUDIT_RETRIES } from '../lib/audit.mjs';

const SITE_DIR = resolve(import.meta.dirname, '../../../site/src/content');
const AVAIL_MAX = 24; // hard cap per run regardless of strategy — free-tier friendly
const DRY = process.argv.includes('--dry-run');

const out = (m) => console.log(`author: ${m}`);

function order(briefs) {
  // newest brief first (fresh news), oldest handled in later runs
  return [...briefs].sort((a, b) => {
    const da = new Date(loadBrief(a).date ?? 0);
    const db = new Date(loadBrief(b).date ?? 0);
    return db - da;
  });
}

async function main() {
  const all = order(listBriefs());
  const pending = all.filter((slug) => !storyExists(slug, { siteDir: SITE_DIR }));
  if (!pending.length) return out('nothing to author');
  if (DRY) {
    out(`[dry-run] would author ${Math.min(AVAIL_MAX, pending.length)}: ${pending.slice(0, AVAIL_MAX).join(', ')}`);
    return;
  }
  if (!process.env.LLM_API_KEY) {
    out('LLM_API_KEY unset -> skipping (opencode authors stories as before)');
    return;
  }
  const targets = pending.slice(0, AVAIL_MAX);
  out(`provider=${LLM_CFG.baseUrl} model=${LLM_CFG.model} targets=${targets.length} (two-stage writer+auditor, max retries=${MAX_AUDIT_RETRIES})`);
  let ok = 0, fail = 0, blocked = 0;
  for (const slug of targets) {
    try {
      const brief = loadBrief(slug);
      // TWO-STAGE AUDIT: writer -> mechanical gate -> LLM 10-point audit, with
      // bounded retries (writer re-runs on auditor feedback). Finalize only on PASS.
      const { pass, body: finalBody } = await writeThenAudit(brief);
      if (!pass || !finalBody) { blocked++; out(`- ${slug}: AUDIT FAILED, skip (blocked)`); continue; }
      const f = finalizeStory(slug, finalBody, { siteDir: SITE_DIR });
      ok++;
      out(`+ authored ${slug} -> ${f.split('/site/src/content/')[1]} (${finalBody.length} chars, PASS)`);
    } catch (e) {
      fail++;
      out(`- failed ${slug}: ${e?.message ?? e}`);
    }
  }
  out(`done ok=${ok} fail=${fail} blocked=${blocked}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
