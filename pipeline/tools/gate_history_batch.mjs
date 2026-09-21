// tools/gate_history_batch.mjs — deterministic validation gate for background history batches.
// Reads authored single-article packs from pipeline/tmp/history-staging/topics-<slug>.json,
// validates each (schema, no-Latin, word count, sources, URL 200s, slug collision),
// then renders + commits-ready output:
//   - fact-pack record        -> pipeline/state/history/published/<slug>.json
//   - article markdown        -> site/src/content/news/history-<slug>.md (via renderArticle)
//   - topics.json status      -> "published" (ok) or "failed" (+reason)
// Invalid packs are left in staging (gitignored) and never published.
// Exit code: 0 if >=1 topic published, 1 if failures produced unmet expectations, 2 on usage error.
// Usage: node tools/gate_history_batch.mjs [--skip-urls] [--max-topics N] [--dry-run]
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderArticle } from './publish_history.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const TOPICS_FILE = join(ROOT, 'pipeline/state/history/topics.json');
const STAGING = join(ROOT, 'pipeline/tmp/history-staging');
const PUBLISHED = join(ROOT, 'pipeline/state/history/published');
const CONTENT_DIR = join(ROOT, 'site/src/content/news');

const USAGE = 'usage: node tools/gate_history_batch.mjs [--skip-urls] [--max-topics N] [--dry-run]';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const skipUrls = process.argv.includes('--skip-urls');
const dryRun = process.argv.includes('--dry-run');
const maxTopics = (() => {
  const i = process.argv.indexOf('--max-topics');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : Infinity;
})();

function latin(s) {
  return /[A-Za-z]/.test(s);
}

async function http200(url, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(25000),
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      });
      if (res.status === 200) return true;
    } catch {
      /* retry below */
    }
  }
  return false;
}

function validateArticle(a) {
  const issues = [];
  if (!a || typeof a !== 'object') return ['not an article object'];
  for (const f of ['slug', 'title', 'seoTitle', 'seoDescription', 'excerpt', 'date', 'body']) {
    if (a[f] === undefined || a[f] === '' || typeof a[f] !== 'string') issues.push(`missing/empty: ${f}`);
  }
  if (issues.length) return issues;
  if (!/^[a-z0-9-]+$/.test(a.slug)) issues.push('slug not lowercase-hyphenated');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) issues.push(`bad date: ${a.date}`);
  const words = a.body.split(/\s+/).filter(Boolean).length;
  if (words < 150) issues.push(`body too short (${words} words)`);
  if (latin(a.body)) issues.push('Latin letters in body');
  for (const f of ['seoTitle', 'seoDescription', 'excerpt', 'title']) if (latin(a[f])) issues.push(`Latin letters in ${f}`);
  if (Array.isArray(a.keyPoints)) {
    for (const kp of a.keyPoints) if (latin(kp)) issues.push('Latin letters in keyPoints');
  }
  // faq must match the SITE'S news schema ({q,a}), not our own invented shape — a
  // schema drift here (e.g. {question,answer}) silently breaks the Astro build + deploy.
  if (!Array.isArray(a.faq) || a.faq.length === 0) {
    issues.push('need >=1 faq item');
  } else {
    for (const [i, f] of a.faq.entries()) {
      if (!f || typeof f.q !== 'string' || typeof f.a !== 'string' || f.q.trim() === '' || f.a.trim() === '') {
        issues.push(`faq[${i}] must be {q, a} strings (site schema) — got ${JSON.stringify(f)}`);
      }
      if (f.question !== undefined || f.answer !== undefined) issues.push(`faq[${i}] uses {question,answer}, site needs {q,a}`);
    }
  }
  if (!Array.isArray(a.sources) || a.sources.length < 3) {
    issues.push('need >=3 sources');
  } else {
    for (const [i, s] of a.sources.entries()) {
      if (!s || typeof s.name !== 'string' || typeof s.url !== 'string' || !/^https?:\/\//.test(s.url)) {
        issues.push(`source[${i}] malformed`);
      }
    }
  }
  // slug collision with anything already on the site
  if (existsSync(join(CONTENT_DIR, `history-${a.slug}.md`))) issues.push(`slug already published: ${a.slug}`);
  return issues;
}

async function checkUrls(a) {
  const bad = [];
  for (const s of a.sources) {
    if (!/^https?:\/\//.test(s.url)) {
      bad.push(`${s.url || '(no url)'} (malformed)`);
      continue;
    }
    if (!(await http200(s.url))) bad.push(`${s.url} (not HTTP 200)`);
  }
  return bad;
}

function fail(topic, reason, topics) {
  topic.status = 'failed';
  topic.reason = reason.slice(0, 400);
  return `✗ ${topic.slug}: ${reason}`;
}

async function main() {
  if (!existsSync(STAGING)) {
    console.log('gate: no staging dir — nothing to validate');
    process.exit(0);
  }
  mkdirSync(PUBLISHED, { recursive: true });
  const topicsDoc = JSON.parse(readFileSync(TOPICS_FILE, 'utf8'));
  const files = readdirSync(STAGING).filter((f) => /^topics-[a-z0-9-]+\.json$/.test(f)).sort();
  if (!files.length) {
    console.log('gate: no staged packs — nothing to do');
    process.exit(0);
  }
  const results = [];
  let authored = 0;
  for (const f of files) {
    if (authored >= maxTopics) break;
    const slug = f.replace(/^topics-|\.json$/g, '');
    const topic = topicsDoc.topics.find((t) => t.slug === slug);
    if (!topic) {
      results.push(`✗ ${slug}: no matching topic in topics.json`);
      continue;
    }
    if (topic.status === 'published' || topic.status === 'failed') {
      results.push(`- ${slug}: topic already ${topic.status} — skipped`);
      continue;
    }
    let pack;
    try {
      pack = JSON.parse(readFileSync(join(STAGING, f), 'utf8'));
    } catch {
      results.push(fail(topic, 'staged pack unparseable JSON', topicsDoc));
      continue;
    }
    if (!Array.isArray(pack) || pack.length !== 1) {
      results.push(fail(topic, 'pack must be a single-article array', topicsDoc));
      continue;
    }
    const a = pack[0];
    let issues = validateArticle(a);
    if (!issues.length && a.slug !== topic.slug) {
      results.push(fail(topic, 'staged slug mismatch', topicsDoc));
      continue;
    }
    if (!issues.length && !skipUrls) {
      const bad = await checkUrls(a);
      if (bad.length) issues = [`[URL] ${bad.join('; ')}`];
    }
    if (issues.length) {
      results.push(fail(topic, issues.join(' | '), topicsDoc));
      continue;
    }
    authored++;
    try {
      const md = renderArticle(a);
      const mdPath = join(CONTENT_DIR, `history-${a.slug}.md`);
      if (!dryRun) {
        writeFileSync(mdPath, md);
        writeFileSync(join(PUBLISHED, `${a.slug}.json`), JSON.stringify(pack, null, 2));
      }
      topic.status = 'published';
      results.push(`✓ ${a.slug} published${dryRun ? ' (dry-run)' : ''}`);
    } catch (e) {
      results.push(fail(topic, `render/publish error: ${e.message}`, topicsDoc));
    }
  }
  if (!dryRun) writeFileSync(TOPICS_FILE, JSON.stringify(topicsDoc, null, 2));
  console.log(results.join('\n'));
  const ok = results.filter((r) => r.startsWith('✓')).length;
  const bad = results.filter((r) => r.startsWith('✗')).length;
  console.log(`gate summary: ${ok} published, ${bad} failed, ${files.length - ok - bad} skipped (max-topics)`);
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exit(2);
}