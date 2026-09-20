// tools/tracked_watcher.mjs — Living Story Watcher (increment 4 of D36)
//
// Every day (GH Actions cron), for each story in site/src/data/tracked-stories.json with
// status "tracked":
//   1. Search Google News RSS (bn, BD) using the story's fingerprint keywords/entities.
//   2. Keep only items that are new (after lastItem/lastChecked) and relevant (term match).
//   3. For matches: append an honest, source-attributed update entry to the article's
//      frontmatter `updates[]` (rendered as "আপডেট ইতিহাস"), set `updated` + `lastChecked`.
//   4. Regardless of matches: bump the article's + registry's lastChecked/nextCheck
//      (honest bookkeeping, keeps the "শেষ চেক" stamp fresh).
//
// No LLM, no fabricated facts: each update is "«Headline» — Source" directly from the
// outlet's own Google News result (title/snippet), with a source link.
//
// usage: node tools/tracked_watcher.mjs [--dry-run] [--limit=2]
//   --dry-run   print what would change, write nothing
//   --limit=N   max updates appended per story per run (default 1)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Parser from 'rss-parser';
import { parse as parseYaml } from 'yaml';

const SITE_DIR = resolve(import.meta.dirname, '../../site');
const REGISTRY = join(SITE_DIR, 'src/data/tracked-stories.json');
const CONTENT_DIR = join(SITE_DIR, 'src/content/news');

// --- helpers (pure, tested) -------------------------------------------------

// Google News titles look like "<Headline> - <Outlet>". Strip the outlet suffix when known.
export function stripSourceFromTitle(title, sourceTitle) {
  let t = String(title ?? '').trim();
  const suffix = sourceTitle ? ` - ${sourceTitle.trim()}` : null;
  if (suffix && t.endsWith(suffix)) t = t.slice(0, -suffix.length).trim();
  else {
    const m = String(title ?? '').match(/^(.*?)\s*-\s*([^-]{2,})$/);
    if (m) t = m[1].trim();
  }
  return t;
}

// Recover the real article URL behind a news.google.com/rss/articles/ redirect token.
// The token is URL-safe base64 of a protobuf whose payload contains the origin URL.
export function decodeGoogleNewsUrl(link) {
  try {
    const m = String(link).match(/news\.google\.com\/rss\/articles\/([A-Za-z0-9_\-=]+)/);
    if (!m) return link;
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const raw = Buffer.from(b64 + pad, 'base64').toString('utf8');
    const http = raw.indexOf('http');
    if (http === -1) return link;
    return raw.slice(http).replace(/[^A-Za-z0-9:/?#[\]@!$&'()*+,;=._%~-]/g, '').split('&')[0];
  } catch {
    return link;
  }
}

// Relevance: how many of the fingerprint terms appear in the item text.
export function relevanceScore(itemText, { keywords = [], entities = [] }) {
  const text = itemText.toLowerCase();
  const terms = [...new Set([...keywords, ...entities].filter(Boolean))].map((t) =>
    String(t).toLowerCase(),
  );
  return terms.filter((t) => t && text.includes(t)).length;
}

const escRe = /[.*+?^${}()|[\]\\]/g;
const escYq = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// Minimal frontmatter surgery: set `key:` (replace existing or insert after `insertAfter`)
// without reformatting the rest of the file.
export function setKey(fmText, key, lineValue, insertAfter) {
  const line = `${key}: ${lineValue}`;
  const re = new RegExp(`^${key.replace(escRe, '\\$&')}:.*$`, 'm');
  if (re.test(fmText)) return fmText.replace(re, line);
  if (insertAfter) {
    const afterRe = new RegExp(`^(\\s*${insertAfter.replace(escRe, '\\$&')}:.*)$`, 'm');
    if (afterRe.test(fmText)) return fmText.replace(afterRe, `$1\n${line}`);
  }
  return `${fmText.replace(/\n*$/, '')}\n${line}`;
}

// Append `updates:` entries (block style) to a frontmatter block.
export function appendUpdates(fmText, entries) {
  const block = entries
    .map(
      (e) => `  - date: "${e.date}"
    note: "${escYq(e.note)}"
    label: "${e.label}"`,
    )
    .join('\n');
  const m = fmText.match(/^updates:.*$/m);
  if (!m) return `${fmText.replace(/\n*$/, '')}\nupdates:\n${block}`;
  const inlineVal = /\S/.test(m[0].replace(/^updates:\s*/, ''));
  if (inlineVal)
    return `${fmText.slice(0, m.index)}updates:\n${block}${fmText.slice(m.index + m[0].length)}`;
  return `${fmText.slice(0, m.index + m[0].length)}\n${block}${fmText.slice(m.index + m[0].length)}`;
}

function loadFrontmatter(mdPath) {
  const text = readFileSync(mdPath, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) throw new Error(`no frontmatter: ${mdPath}`);
  const body = text.slice(m[0].length).replace(/^\r?\n/, '');
  return { fm: m[1], body };
}

function alreadyCovered(front, title) {
  const hay = [front.title, ...(front.updates ?? []).map((u) => String(u.note ?? ''))].join('\n');
  return hay.toLowerCase().includes(title.toLowerCase());
}

export function writeStoryUpdate({ slug, entries, checkedIso, contentDir = CONTENT_DIR }) {
  const mdPath = join(contentDir, `${slug}.md`);
  if (!existsSync(mdPath)) throw new Error(`story file missing: ${slug}`);
  const { fm, body } = loadFrontmatter(mdPath);
  const front = parseYaml(fm);
  const existingNotes = new Set((front.updates ?? []).map((u) => String(u.note ?? '')));

  const fresh = entries.filter(
    (e) => !existingNotes.has(e.note) && !alreadyCovered(front, e.title),
  );

  let out = fm;
  if (!Object.prototype.hasOwnProperty.call(front, 'tracked')) out = setKey(out, 'tracked', 'true', 'date');
  out = setKey(out, 'lastChecked', checkedIso, 'tracked');
  if (fresh.length) {
    out = appendUpdates(
      out,
      fresh.map((e) => ({ date: e.date, note: e.note, label: 'ওয়াচার আপডেট' })),
    );
    out = setKey(out, 'updated', fresh.at(-1).date, 'date');
  }

  // Validate the edited frontmatter still parses & matches intent before writing.
  const check = parseYaml(out);
  if (String(check.lastChecked) !== checkedIso) throw new Error(`lastChecked write failed for ${slug}`);
  if (fresh.length && !(check.updates ?? []).some((u) => u.note === fresh[0].note))
    throw new Error(`updates write failed for ${slug}`);

  if (out === fm) return { appended: 0, changed: false };
  writeFileSync(mdPath, `---\n${out}\n---\n\n${body}`);
  return { appended: fresh.length, changed: true };
}

// --- google news fetch ------------------------------------------------------

function googleQuery(term) {
  const params = new URLSearchParams({ q: term, hl: 'bn', gl: 'BD', ceid: 'BD:bn' });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

async function fetchItems(query) {
  const parser = new Parser({
    headers: { 'User-Agent': 'newsdesk-bd-watcher/1.0 (+https://newsdesk-bd.vercel.app)' },
  });
  try {
    const feed = await parser.parseURL(query);
    return (feed?.items ?? []).map((item) => ({
      title: String(item.title ?? '').trim(),
      link: String(item.link ?? '').trim(),
      decoded: decodeGoogleNewsUrl(String(item.link ?? '')),
      isoDate: new Date(item.isoDate || item.pubDate || Date.now()),
      sourceTitle: item.source?.title?.trim() || '',
      snippet: String(item.contentSnippet ?? ''),
    }));
  } catch (error) {
    console.warn(`  ! fetch failed for ${query}\n    ${error.message}`);
    return [];
  }
}

function buildQueries(story) {
  const fp = story.fingerprint ?? {};
  const kw = [...(fp.keywords ?? []), ...(fp.entities ?? [])].filter(Boolean);
  const qs = [];
  if (kw.length) qs.push(kw.join(' '));
  for (const k of kw.slice(0, 3)) if (qs.length < 3) qs.push(k);
  return qs;
}

function noteFromItem(item, sourceTitle) {
  const title = stripSourceFromTitle(item.title, sourceTitle);
  const snippet = item.snippet ? String(item.snippet).replace(/\s+/g, ' ').trim().slice(0, 180) : '';
  const src = sourceTitle || 'সংবাদ মাধ্যম';
  return `${src} জানিয়েছে: «${title}»${snippet ? ` — ${snippet}` : ''}`;
}

// --- main -------------------------------------------------------------------

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run');
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 1);
  const nowIso = () => new Date().toISOString();
  const tomorrowIso = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const stories = (registry.stories ?? []).filter((s) => s.status === 'tracked');
  const changedFm = [];

  for (const story of stories) {
    const slug = story.slug;
    console.log(`\n▶ ${slug} — ${story.title}`);

    const baseline = story.lastItem ?? story.lastChecked ?? story.trackedAt;
    const last = baseline ? new Date(baseline).getTime() : 0;

    const seen = new Set();
    const matches = [];
    for (const query of buildQueries(story)) {
      for (const item of await fetchItems(googleQuery(query))) {
        if (!item.link || seen.has(item.link) || seen.has(item.decoded)) continue;
        seen.add(item.link);
        seen.add(item.decoded);
        if (item.isoDate.getTime() <= last) continue;
        const score = relevanceScore(`${item.title} ${item.snippet}`, story.fingerprint ?? {});
        if (score === 0) continue;
        matches.push({ score, item });
      }
      if (matches.length >= 10) break;
    }

    matches.sort((a, b) => b.score - a.score || b.item.isoDate - a.item.isoDate);
    const fresh = matches.slice(0, limit);
    const maxDate = Math.max(last, ...matches.map((m) => m.item.isoDate.getTime()));
    const newest = Math.max(...matches.map((m) => m.item.isoDate.getTime()).concat(-Infinity));

    console.log(
      fresh.length
        ? `  + ${fresh.length} new relevant item(s):\n    ` +
          fresh
            .map((m) => `«${stripSourceFromTitle(m.item.title, m.item.sourceTitle)}» [${m.item.sourceTitle || '?'}]`)
            .join('\n    ')
        : `  ~ no new items since ${new Date(last).toISOString()}`,
    );

    try {
      const res = writeStoryUpdate({
        slug,
        entries: fresh.map((m) => ({
          date: new Date(m.item.isoDate.getTime() + 1000).toISOString(),
          note: noteFromItem(m.item, m.item.sourceTitle),
          title: stripSourceFromTitle(m.item.title, m.item.sourceTitle),
        })),
        checkedIso: nowIso(),
      });
      if (res.changed)
        changedFm.push(`${slug}${res.appended ? ` (+${res.appended} update)` : ' (lastChecked)'}`);
    } catch (error) {
      console.error(`  ! ${error.message}`);
    }

    story.lastChecked = nowIso();
    story.nextCheck = tomorrowIso();
    story.lastItem = new Date(maxDate).toISOString();
    if (fresh.length && newest > -Infinity) story.lastUpdate = new Date(newest).toISOString();
  }

  const what = changedFm.length ? `articles updated: ${changedFm.join(', ')}` : 'no article changes';
  if (DRY_RUN) {
    console.log(`\n[dry-run] registry would be updated (${stories.length} watched). ${what}`);
    return;
  }
  writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + '\n');
  console.log(`\nregistry updated (${stories.length} watched). ${what}`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) main();