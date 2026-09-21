// tools/finalize_stories.mjs — finalize all pending briefs whose body file exists
// usage: node tools/finalize_stories.mjs [--site=/path/to/site] [--max=N]
// bodyfiles: pipeline/tmp/stories/<slug>.b.md (body only, no front matter)
// --max=N caps how many stories are finalized per run (newest brief first) so a
// sudden supply spike can never make one run author/publish an unbounded batch.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { finalizeStory, storyExists } from '../lib/synth.mjs';
import { BRIEFS_DIR } from '../lib/extract.mjs';
import { loadPublishedTitles, isTitleDuplicate } from '../lib/published.mjs';

const siteArg = process.argv.find((a) => a.startsWith('--site='))?.split('=')[1];
const siteDir = siteArg
  ? resolve(siteArg)
  : resolve(import.meta.dirname, '../../site/src/content/news');

const maxArg = Number(process.argv.find((a) => a.startsWith('--max='))?.split('=')[1]);
const max = Number.isFinite(maxArg) && maxArg > 0 ? maxArg : Infinity;

const bodiesDir = join(import.meta.dirname, '../tmp/stories');
let bodies = existsSync(bodiesDir) ? readdirSync(bodiesDir).filter((f) => f.endsWith('.b.md')) : [];

// Newest brief first, so a capped run always advances the most recent news.
const briefDate = (f) => {
  const slug = f.replace(/\.b\.md$/, '');
  try {
    return JSON.parse(readFileSync(join(BRIEFS_DIR, `${slug}.json`), 'utf8')).date || '';
  } catch {
    return '';
  }
};
bodies.sort((a, b) => String(briefDate(b)).localeCompare(String(briefDate(a))));
if (bodies.length > max) {
  console.log(`cap: ${bodies.length} body files -> finalizing newest ${max} this run`);
  bodies = bodies.slice(0, max);
}

const publishedTitles = loadPublishedTitles(siteDir);

let finalized = 0, skipped = 0, failed = 0;
for (const f of bodies) {
  const slug = f.replace(/\.b\.md$/, '');
  try {
    if (storyExists(slug, { siteDir })) { skipped++; console.log(`- ${slug}: already exists, skip`); continue; }
    const briefFile = join(BRIEFS_DIR, `${slug}.json`);
    if (!existsSync(briefFile)) { console.log(`- ${slug}: NO BRIEF, skip`); skipped++; continue; }
    const brief = JSON.parse(readFileSync(briefFile, 'utf8'));
    if (isTitleDuplicate(brief.headline, brief.date, publishedTitles)) {
      console.log(`- ${slug}: title already published, skip`); skipped++; continue;
    }
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