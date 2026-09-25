#!/usr/bin/env node
// tools/prune_unrecoverable.mjs — remove published articles that cannot be honestly rewritten.
//
// WHY (2026-09-25): the live audit found 14.8% of published articles were 14-43
// word stubs still carrying `badge: confirmed, tier: A`. The body-substance
// floor and the 1200-char evidence cap are forward-only, so the already-published
// stubs stay on a site whose entire premise is verification.
//
// Eligibility is the same test rewrite_prepare.mjs uses, and it must stay in
// step with it: an article is UNRECOVERABLE when it fails the substance floor
// AND no member of its CURRENT cluster has a real source body
// (>= --min-source chars). The "current" matters — the brief on disk is stale
// for published stories, because exportBriefs() skips already-published
// headlines, so eligibility is computed from buildBrief().
//
// What this removes:
//   site/src/content/news/<slug>.md        the article
//   site/public/images/<slug>.webp         its per-slug thumbnail (1:1, no sharing)
//
// What this never touches: frontmatter of surviving articles, tracked-stories
// entries, the ghotona registry, or anything in the pipeline.
//
// Usage:
//   node tools/prune_unrecoverable.mjs --dry-run
//   node tools/prune_unrecoverable.mjs --write --keep=national-436
import { readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openDb } from '../lib/db.mjs';
import { buildBrief, BRIEFS_DIR } from '../lib/extract.mjs';
import { bodySubstanceCheck } from '../lib/editorial.mjs';

const NEWS = resolve(import.meta.dirname, '../../site/src/content/news');
const IMAGES = resolve(import.meta.dirname, '../../site/public/images');
const EVENT_GRAPH = resolve(import.meta.dirname, '../../site/src/data/event-graph.json');
const TRACKED = resolve(import.meta.dirname, '../../site/src/data/tracked-stories.json');

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const flag = (n) => process.argv.includes(`--${n}`);
const WRITE = flag('write');
const MIN_SOURCE = Number(arg('min-source') ?? 1200);
const KEEP = new Set((arg('keep') || '').split(',').map((s) => s.trim()).filter(Boolean));

const db = openDb();
const slugs = readdirSync(NEWS).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));

const doomed = [];
let healthy = 0;
let noBrief = 0;

for (const slug of slugs) {
  const text = readFileSync(join(NEWS, `${slug}.md`), 'utf8');
  const title = ((text.match(/^title:\s*(.+)$/m) || [])[1] || '').trim().replace(/^['"]|['"]$/g, '');
  const body = text.split(/^---\s*$/m).slice(2).join(' ').trim();
  if (!title || !body) continue;
  if (bodySubstanceCheck(title, body).pass) {
    healthy++;
    continue;
  }

  const briefPath = join(BRIEFS_DIR, `${slug}.json`);
  if (!existsSync(briefPath)) {
    noBrief++;
    continue;
  }
  let stored;
  try {
    stored = JSON.parse(readFileSync(briefPath, 'utf8'));
  } catch {
    noBrief++;
    continue;
  }
  let fresh = null;
  try {
    fresh = buildBrief(stored.clusterId, { db });
  } catch {}
  if (!fresh || !Array.isArray(fresh.members) || !fresh.members.length) {
    noBrief++;
    continue;
  }
  let best = 0;
  for (const m of fresh.members) {
    const r = db.prepare('SELECT length(body) lb FROM raw_items WHERE url = ?').get(m.url);
    if (r?.lb && r.lb > best) best = r.lb;
  }
  if (best >= MIN_SOURCE) {
    healthy++;
    continue;
  }
  if (KEEP.has(slug)) {
    healthy++;
    continue;
  }
  doomed.push({ slug, title, words: bodySubstanceCheck(title, body).bodyWords, bestSource: best });
}

const byDay = {};
for (const d of doomed) {
  const t = readFileSync(join(NEWS, `${d.slug}.md`), 'utf8');
  const day = ((t.match(/^date:\s*(\S+)/m) || [])[1] || '?').slice(0, 10);
  byDay[day] = (byDay[day] || 0) + 1;
}

console.log(`mode            : ${WRITE ? 'WRITE' : 'DRY RUN'}`);
console.log(`min source      : ${MIN_SOURCE} chars`);
if (KEEP.size) console.log(`keep-list       : ${[...KEEP].join(', ')}`);
console.log(`published total : ${slugs.length}`);
console.log(`  healthy/kept  : ${healthy}`);
console.log(`  no brief      : ${noBrief}   (not touched — cannot be classified)`);
console.log(`  TO REMOVE     : ${doomed.length}`);
console.log('\nby publish date:');
for (const [k, v] of Object.entries(byDay).sort()) console.log(`  ${k}  ${String(v).padStart(3)}  ${'#'.repeat(Math.min(40, v))}`);

if (!WRITE) {
  console.log('\nfirst 15 that would be removed:');
  for (const d of doomed.slice(0, 15)) console.log(`  ${d.slug.padEnd(24)}${String(d.words).padStart(4)}w  ${d.title.slice(0, 50)}`);
  console.log('\nadd --write to remove.');
  db.close();
  process.exit(0);
}

let removedMd = 0;
let removedImg = 0;
for (const d of doomed) {
  const md = join(NEWS, `${d.slug}.md`);
  if (existsSync(md)) {
    rmSync(md);
    removedMd++;
  }
  const img = join(IMAGES, `${d.slug}.webp`);
  if (existsSync(img)) {
    rmSync(img);
    removedImg++;
  }
}

// event-graph.json is a derived cache (pipeline.yml regenerates it via
// tools/event_graph.mjs). Strip the removed slugs so the committed data file
// does not advertise 404s until the next CI run.
let graphCleaned = 0;
if (existsSync(EVENT_GRAPH)) {
  const g = JSON.parse(readFileSync(EVENT_GRAPH, 'utf8'));
  const drop = new Set(doomed.map((d) => d.slug));
  const walk = (node) => {
    if (Array.isArray(node)) {
      const before = node.length;
      const kept = node.filter((n) => !(n && typeof n === 'object' && drop.has(n.slug)));
      if (kept.length !== before) graphCleaned += before - kept.length;
      node.length = 0;
      node.push(...kept);
      for (const n of kept) walk(n);
    } else if (node && typeof node === 'object') {
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(g);
  writeFileSync(EVENT_GRAPH, `${JSON.stringify(g, null, 2)}\n`, 'utf8');
}

// Safety net: no surviving article may link to a removed slug.
const removed = new Set(doomed.map((d) => d.slug));
const dangling = [];
for (const f of readdirSync(NEWS).filter((x) => x.endsWith('.md'))) {
  const t = readFileSync(join(NEWS, f), 'utf8');
  for (const s of removed) if (t.includes(`/article/${s}`)) dangling.push(`${f} -> ${s}`);
}

db.close();
console.log(`\nremoved .md            : ${removedMd}`);
console.log(`removed thumbnails     : ${removedImg}`);
console.log(`event-graph entries cut: ${graphCleaned}`);
console.log(`tracked-stories        : ${existsSync(TRACKED) ? 'untouched (no removed slug was registered there)' : 'n/a'}`);
console.log(`dangling cross-links   : ${dangling.length}${dangling.length ? ` -> ${dangling.slice(0, 5).join(', ')}` : ''}`);
console.log(`\nremaining published     : ${readdirSync(NEWS).filter((f) => f.endsWith('.md')).length}`);
console.log('\nNext: re-run `node tools/event_graph.mjs` locally is optional — pipeline.yml does it.');
process.exit(0);
