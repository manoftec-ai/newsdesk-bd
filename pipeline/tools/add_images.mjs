// tools/add_images.mjs — ensure every published article has a WebP thumbnail.
//
// usage:
//   node tools/add_images.mjs [--site=/path/to/site] [--limit=N] [--slug=<slug>]
//                             [--force] [--dry-run] [--strategy=mix|photo|card]
//
// Scans site/src/content/news/*.md for stories without a `thumbnail`, generates a
// WebP (free-license photo where suitable, else a branded card — see lib/images.mjs),
// writes it to site/public/images/<slug>.webp and inserts `thumbnail` +
// `thumbnailAlt` into the front matter. Idempotent: already-thumbnailed files are
// skipped unless --force.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chooseThumbnail } from '../lib/images.mjs';

const args = process.argv.slice(2);
const getArg = (name, def = null) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : def;
};
const has = (name) => args.includes(`--${name}`);

const siteDir = getArg('site') ? resolve(getArg('site')) : resolve(import.meta.dirname, '../../site');
const contentDir = join(siteDir, 'src/content/news');
const imagesDir = join(siteDir, 'public/images');
const limit = Number(getArg('limit', '0')) || 0;
const onlySlug = getArg('slug');
const force = has('force');
const dryRun = has('dry-run');
const strategy = getArg('strategy', 'mix');
if (!['mix', 'photo', 'card'].includes(strategy)) {
  console.error(`invalid --strategy "${strategy}" (mix|photo|card)`);
  process.exit(2);
}

if (!existsSync(contentDir)) {
  console.error(`content dir not found: ${contentDir}`);
  process.exit(1);
}
if (!dryRun) mkdirSync(imagesDir, { recursive: true });

function escYaml(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s+/g, ' ').trim();
}

function parseFrontMatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = m[1];
  const titleM = fm.match(/^title:\s*(?:"((?:[^"\\]|\\.)*)"|(.*?))\s*$/m);
  const title = titleM ? (titleM[1] ?? titleM[2] ?? '').replace(/\\"/g, '"').trim() : '';
  const category = (fm.match(/^category:\s*"?([\w-]+)"?/m) ?? [])[1] ?? 'national';
  const tagsInline = fm.match(/^tags:\s*\[(.*?)\]/m);
  let tags = [];
  if (tagsInline) {
    tags = tagsInline[1]
      .split(',')
      .map((t) => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  } else {
    const block = fm.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m);
    if (block) {
      tags = block[1]
        .split('\n')
        .map((l) => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }
  }
  const hasThumb = /^thumbnail:/m.test(fm);
  // parse `sources:` list entries (name/url pairs) from the front matter block
  // (line-based: block ends at the next top-level key or an inline `sources: [...]`)
  let sources = [];
  {
    const lines = fm.split("\n");
    const srcIdx = lines.findIndex((l) => /^sources:\s*$/i.test(l.trim()) && !/\[/.test(l));
    let cur = {};
    for (let i = srcIdx + 1; srcIdx >= 0 && i < lines.length; i++) {
      const line = lines[i];
      if (/^\S/.test(line) || (!line.trim() && !cur.url)) break;
      const n = line.match(/^\s*(?:-\s*)?name:\s*(?:"([^"]*)"|'([^']*)'|(.*?))\s*$/);
      const u = line.match(/^\s*(?:-\s*)?url:\s*(?:"([^"]*)"|'([^']*)'|(.*?))\s*$/);
      if (n) cur.name = (n[1] ?? n[2] ?? n[3] ?? "").trim();
      else if (u) {
        cur.url = (u[1] ?? u[2] ?? u[3] ?? "").trim();
        if (cur.url) sources.push({ name: cur.name ?? "", url: cur.url });
        cur = {};
      }
    }
  }
  return { title, category, tags, sources, hasThumb, fmEnd: m[0].length };
}

function insertThumbnail(content, thumbPath, alt) {
  const lines = `thumbnail: "${thumbPath}"\nthumbnailAlt: "${escYaml(alt)}"`;
  if (/^title:.*$/m.test(content)) {
    return content.replace(/^(title:.*)$/m, `$1\n${lines}`);
  }
  // fallback: append inside the front matter block
  return content.replace(/^---\n/, `---\n${lines}\n`);
}

const files = readdirSync(contentDir)
  .filter((f) => f.endsWith('.md'))
  .filter((f) => (onlySlug ? f === `${onlySlug}.md` : true))
  .sort();

let made = 0, skipped = 0, failed = 0, photo = 0, card = 0;
for (const f of files) {
  if (limit && made >= limit) break;
  const slug = f.replace(/\.md$/, '');
  const full = join(contentDir, f);
  const content = readFileSync(full, 'utf8');
  const meta = parseFrontMatter(content);
  if (!meta) {
    console.log(`- ${slug}: no front matter, skip`);
    skipped++;
    continue;
  }
  if (meta.hasThumb && !force) {
    skipped++;
    continue;
  }
  try {
    const result = await chooseThumbnail({
      slug,
      title: meta.title,
      category: meta.category,
      tags: meta.tags,
      sources: meta.sources,
      dryRun,
      mode: strategy,
    });
    const thumbPath = `/images/${slug}.webp`;
    if (dryRun) {
      const detail = result.pick ? `photo "${result.pick.title}" by ${result.pick.creator} [${result.pick.license}]` : result.mode;
      console.log(`~ ${slug}: [${meta.category}] q="${result.query}" -> ${result.mode} (${detail})`);
      made++;
    } else if (result.webp) {
      writeFileSync(join(imagesDir, `${slug}.webp`), result.webp);
      writeFileSync(full, insertThumbnail(content, thumbPath, result.alt));
      console.log(`+ ${slug}.webp (${result.mode})`);
      made++;
      if (result.mode === 'photo') photo++; else card++;
    } else {
      console.log(`- ${slug}: no ${strategy} image available, skip`);
      skipped++;
    }
  } catch (e) {
    failed++;
    console.error(`! ${slug}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 350)); // be polite to Openverse
}

console.log(
  `\nadd_images done. made=${made} (photo=${photo} card=${card}) skipped=${skipped} failed=${failed}` +
    (dryRun ? ' [dry-run]' : ''),
);
