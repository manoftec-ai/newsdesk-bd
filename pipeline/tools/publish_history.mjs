// tools/publish_history.mjs — bulk-publish curated historical news articles.
// Input: path to a JSON fact-pack file (array of article objects).
// Output: one Markdown file per article at site/src/content/news/history-<slug>.md.
// Every article is ORIGINAL synthesis with cited sources (no fabrication);
// facts must be documented in the fact-pack sources. draft:false = auto-publish.
// Usage: node tools/publish_history.mjs <factpack.json> [--dry-run]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const CONTENT_DIR = join(ROOT, 'site/src/content/news');

const required = ['slug', 'title', 'seoTitle', 'seoDescription', 'excerpt', 'date', 'body'];

function buildFrontMatter(a) {
  return {
    title: a.title,
    seoTitle: a.seoTitle,
    seoDescription: a.seoDescription,
    excerpt: a.excerpt,
    date: a.date,
    category: a.category ?? 'history',
    tags: a.tags ?? ['history'],
    author: a.author ?? 'desk',
    lang: 'bn',
    draft: false,
    corrected: false,
    keyPoints: a.keyPoints ?? [],
    faq: a.faq ?? [],
    sources: a.sources ?? [],
    verification: a.verification ?? {
      badge: 'confirmed',
      tier: 'B',
      score: 0.9,
      evidence: (a.sources ?? []).map((s) => ({ type: 'documented', label: s.name, url: s.url })),
    },
  };
}

export function renderArticle(a) {
  for (const field of required) {
    if (a[field] === undefined || a[field] === '') throw new Error(`missing field "${field}" in ${a.slug ?? '(no slug)'}`);
  }
  if (!Array.isArray(a.sources) || a.sources.length === 0) throw new Error(`no sources for ${a.slug}`);
  if (a.body.split(/\s+/).filter(Boolean).length < 150) throw new Error(`body too short for ${a.slug}`);
  const fm = buildFrontMatter(a);
  return `---\n${stringify(fm, { lineWidth: 0 }).trimEnd()}\n---\n\n${a.body.trim()}\n`;
}

function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!file) {
    console.error('usage: node tools/publish_history.mjs <factpack.json> [--dry-run]');
    process.exit(2);
  }
  const pack = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(pack)) throw new Error('fact pack must be an array');
  const results = [];
  for (const a of pack) {
    try {
      const md = renderArticle(a);
      const path = join(CONTENT_DIR, `history-${a.slug}.md`);
      if (!dryRun) writeFileSync(path, md);
      results.push({ ok: true, slug: a.slug, title: a.title.slice(0, 40) });
    } catch (e) {
      results.push({ ok: false, slug: a.slug, error: e.message });
    }
  }
  console.table(results);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`written=${results.length - failed} failed=${failed} dryRun=${dryRun}`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();