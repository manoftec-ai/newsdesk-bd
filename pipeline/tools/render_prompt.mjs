#!/usr/bin/env node
// tools/render_prompt.mjs — single-source writer prompt renderer.
// Mirrors pipeline/lib/synth.mjs writingPrompt(brief) for GitHub auto-author.
// Usage: node pipeline/tools/render_prompt.mjs <slug> [--out=/tmp/prompt.txt]
//   slug = brief slug (e.g. national-495) — reads pipeline/state/briefs/<slug>.json
//   --out  optional file to write; otherwise prints to stdout.
// This is the ONLY place the writer prompt is rendered — auto-author.yml now calls
// this script per slug so GitHub and local always use the same template (DRY).

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBrief } from '../lib/synth.mjs';
import { writingPrompt, authoringPrompt } from '../lib/synth.mjs';

const slug = process.argv[2]?.startsWith('--') ? null : process.argv[2];
const outArg = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];

if (!slug || slug.startsWith('-')) {
  console.error('usage: node pipeline/tools/render_prompt.mjs <slug> [--out=/path/to/prompt.txt]');
  console.error('  slug = brief slug under pipeline/state/briefs/<slug>.json');
  process.exit(1);
}

let brief;
try {
  brief = loadBrief(slug);
} catch (e) {
  console.error(`render_prompt: no brief for slug "${slug}": ${e.message}`);
  process.exit(2);
}

// --authoring emits the minimal facts-only prompt. See authoringPrompt() in
// lib/synth.mjs for why the full prompt made the model echo it instead of
// writing an article.
const prompt = process.argv.includes('--authoring') ? authoringPrompt(brief) : writingPrompt(brief);

if (outArg) {
  const outPath = resolve(outArg);
  const { mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, prompt + '\n');
  console.log(`render_prompt: ${slug} -> ${outPath} (${prompt.length} chars, mode=${brief.category})`);
} else {
  process.stdout.write(prompt);
}
