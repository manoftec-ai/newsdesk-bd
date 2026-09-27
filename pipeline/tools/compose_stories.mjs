#!/usr/bin/env node
// Deterministic authoring step.
//
// 2026-09-27. Replaces the `opencode run` step in auto-author.yml. Measured
// reason: three model configurations in a row all failed the same way - 6/6
// stories rejected with MECHANICAL_AUDIT_FAILED + PROMPT_LEAKED, bodies ~150
// words against a 180 floor, and the "quote not found" rejections turned out to
// be fragments of lib/synth.mjs, i.e. the model was echoing its own prompt.
//
// The body is now composed by lib/compose.mjs from the brief's own member
// leads: every sentence is real source text, mechanically cleaned, and nothing
// is invented to reach a word count. The finalizer still adjudicates every
// article through the full publication gate, so this step cannot bypass any
// editorial check - it only stops asking a model to do a mechanical job.
//
// Writes pipeline/tmp/stories/<slug>.b.md, which is exactly what
// tools/finalize_stories.mjs already consumes.
//
//   node tools/compose_stories.mjs [--pick=state/pick.json] [--max=6]

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { composeBody } from '../lib/compose.mjs';
import { clusterCoherence } from '../lib/cluster-coherence.mjs';
import { evidenceSufficiency, DEFAULT_MIN_EVIDENCE_WORDS } from '../lib/editorial.mjs';

const HERE = import.meta.dirname;
const BRIEFS_DIR = resolve(HERE, '../state/briefs');
const BODIES_DIR = resolve(HERE, '../tmp/stories');

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const pickFile = resolve(HERE, '..', arg('pick', 'state/pick.json'));
const max = Number(arg('max', '6'));
const minEvidence = Number(arg('min-evidence', String(DEFAULT_MIN_EVIDENCE_WORDS)));

if (!existsSync(pickFile)) {
  console.error(`compose: no pick file at ${pickFile}`);
  process.exit(1);
}
mkdirSync(BODIES_DIR, { recursive: true });

const pick = JSON.parse(readFileSync(pickFile, 'utf8'));
const picked = (pick.picked ?? []).slice(0, max);

let written = 0;
let skippedThin = 0;
let skippedIncoherent = 0;
let skippedMissing = 0;

for (const item of picked) {
  const slug = item.slug;
  const briefPath = join(BRIEFS_DIR, `${slug}.json`);
  if (!existsSync(briefPath)) { skippedMissing++; continue; }
  const brief = JSON.parse(readFileSync(briefPath, 'utf8'));

  // same gates the picker applies, re-checked here because a brief can sit in
  // pick.json for hours while the corpus underneath it changes
  if (!clusterCoherence(brief).pass) { skippedIncoherent++; continue; }
  if (evidenceSufficiency(brief).evidenceWords < minEvidence) { skippedThin++; continue; }

  const out = composeBody(brief);
  if (!out.body || out.body.length < 80 || out.short) {
    // honest refusal: the sources do not carry enough text for a real article
    skippedThin++;
    continue;
  }

  writeFileSync(join(BODIES_DIR, `${slug}.b.md`), out.body.trim() + '\n', 'utf8');
  written++;
  console.log(
    `  ${slug.padEnd(34)} ${String(out.words).padStart(4)} words  band ${out.min}-${out.max}  ` +
      `pool ${out.poolSize} sentences  ${(brief.sources ?? []).length} sources`,
  );
}

console.log(
  `compose done. wrote=${written} skipped(thin=${skippedThin} incoherent=${skippedIncoherent} missing=${skippedMissing}) ` +
    `of ${picked.length} picked`,
);

// a run that composed nothing must not look like a successful publish
process.exitCode = written > 0 ? 0 : 3;
