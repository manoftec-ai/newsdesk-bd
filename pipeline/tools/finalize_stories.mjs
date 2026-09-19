// tools/finalize_stories.mjs — finalize all pending briefs whose body file exists
// usage: node tools/finalize_stories.mjs [--site=/path/to/site]
// bodyfiles: pipeline/tmp/stories/<slug>.b.md (body only, no front matter)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { finalizeStory, storyExists } from '../lib/synth.mjs';
import { BRIEFS_DIR } from '../lib/extract.mjs';

const siteArg = process.argv.find((a) => a.startsWith('--site='))?.split('=')[1];
const siteDir = siteArg
  ? resolve(siteArg)
  : resolve(import.meta.dirname, '../../site/src/content/news');

const bodiesDir = join(import.meta.dirname, '../tmp/stories');
const bodies = existsSync(bodiesDir) ? readdirSync(bodiesDir).filter((f) => f.endsWith('.b.md')) : [];

let finalized = 0, skipped = 0, failed = 0;
for (const f of bodies) {
  const slug = f.replace(/\.b\.md$/, '');
  try {
    if (storyExists(slug, { siteDir })) { skipped++; console.log(`- ${slug}: already exists, skip`); continue; }
    const briefFile = join(BRIEFS_DIR, `${slug}.json`);
    if (!existsSync(briefFile)) { console.log(`- ${slug}: NO BRIEF, skip`); skipped++; continue; }
    const body = readFileSync(join(bodiesDir, f), 'utf8').trim();
    const out = finalizeStory(slug, body, { siteDir });
    finalized++;
    console.log(`+ ${slug}: wrote ${out}`);
  } catch (e) {
    failed++;
    console.error(`! ${slug}: ${e.message}`);
  }
}
console.log(`\nfinalize done. wrote=${finalized} skipped=${skipped} failed=${failed}`);