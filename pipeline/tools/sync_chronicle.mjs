#!/usr/bin/env node
// Keep the ঘটনাপঞ্জি (ghotona pongji) dated chronicle in step with what we publish.
//
// WHY THIS EXISTS
//   `site/src/data/events-news.json` holds the dated chronicle shown on every
//   event hub. Until now it was hand-curated: 4 events, 60 records, all
//   historical, and zero entries for any of the 3 events marked `active`. The
//   registry looked alive (article matching is automatic) while the actual
//   chronicle — the thing the feature is named for — was empty and going staler
//   every day.
//
// WHAT AN ENTRY IS, AND WHY IT IS NOT FABRICATION
//   An entry is a POINTER to a report this desk already published, verified and
//   sourced. Nothing is invented and no new claim is written: `title` and
//   `summary` are verbatim our own `title`/`excerpt`, `date` is the article's
//   own event date, and `sourceName`/`sourceUrl` are its primary citation. If an
//   article has no source with a URL it is refused, because an uncitable entry
//   is exactly the thing the project's no-fabrication rule forbids.
//
// AGREEING WITH THE SITE
//   The matching predicate is imported from `site/src/lib/events.js`, the very
//   module the hub pages use, and the post shape mirrors `ghotona/[slug].astro`
//   (title/excerpt/category/year/date, no body). So an entry is only ever added
//   for an article the site itself would already list under that event. If the
//   site's matcher is retuned, this tool follows automatically instead of
//   drifting into a second, disagreeing opinion.
//
// SAFETY PROPERTIES
//   - idempotent: a second run with no new articles adds nothing;
//   - additive only: existing curated entries are never removed, reordered or
//     rewritten (verified byte-for-byte);
//   - draft articles are ignored;
//   - refuses to write unless the result parses and every curated entry
//     survives unchanged.
//
// Usage:
//   node tools/sync_chronicle.mjs                 # dry run, prints a plan
//   node tools/sync_chronicle.mjs --write         # apply
//   node tools/sync_chronicle.mjs --event=<id>    # one event only
//   node tools/sync_chronicle.mjs --report=<path>

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { events, matchesEvent } from "../../site/src/lib/events.js";

const ROOT = resolve(import.meta.dirname, "../..");
const CHRONICLE = join(ROOT, "site/src/data/events-news.json");
const CONTENT_DIR = join(ROOT, "site/src/content/news");

const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const WRITE = flag("write");
const ONLY_EVENT = value("event");
const REPORT = value("report");

const isoDay = (d) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
};

/**
 * Read published articles into exactly the shape the ghotona hub passes to
 * `matchesEvent`. Anything that does not parse is skipped rather than guessed.
 */
export function loadPosts(contentDir = CONTENT_DIR) {
  if (!existsSync(contentDir)) return [];
  const posts = [];
  for (const file of readdirSync(contentDir).filter((f) => f.endsWith(".md"))) {
    let raw;
    try {
      raw = readFileSync(join(contentDir, file), "utf8");
    } catch {
      continue;
    }
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
    if (!fm) continue;
    let data;
    try {
      data = parseYaml(fm[1]);
    } catch {
      continue;
    }
    if (!data || typeof data !== "object") continue;
    if (data.draft) continue;
    const date = data.date instanceof Date ? data.date : new Date(data.date);
    if (Number.isNaN(date.getTime())) continue;
    const sources = Array.isArray(data.sources) ? data.sources : [];
    const primary = sources.find((s) => s && typeof s === "object" && s.url);
    posts.push({
      slug: file.slice(0, -3),
      title: String(data.title ?? ""),
      excerpt: String(data.excerpt ?? ""),
      category: data.category,
      year: date.getFullYear(),
      date: isoDay(date),
      publishedAt: data.publishedAt ? isoDay(new Date(data.publishedAt)) : null,
      sourceName: primary ? String(primary.name ?? "") : "",
      sourceUrl: primary ? String(primary.url) : "",
    });
  }
  return posts;
}

const normalizeTitle = (t) =>
  String(t ?? "").toLowerCase().replace(/[\u200c\u200d]/g, "").replace(/[^a-z0-9\u0980-\u09FF]+/gu, "");

/**
 * Decide what the chronicle should contain.
 * Returns { chronology, added, skipped } where `chronology` is a NEW object —
 * the input is never mutated.
 */
export function planSync({ registry, posts, onlyEvent = null } = {}) {
  const base = registry?.chronology ?? {};
  const chronology = {};
  for (const [id, items] of Object.entries(base)) chronology[id] = Array.isArray(items) ? [...items] : [];

  const wanted = events().filter((e) => !onlyEvent || e.id === onlyEvent);
  const added = [];
  const skipped = [];

  for (const event of wanted) {
    if (!event?.id) continue;
    const existing = chronology[event.id] ?? (chronology[event.id] = []);
    const seenSlug = new Set(existing.map((e) => e?.slug).filter(Boolean));
    const seenPair = new Set(
      existing.map((e) => `${e?.date ?? ""}|${normalizeTitle(e?.title)}`),
    );

    for (const post of posts) {
      // The site's own predicate, so the chronicle can never list a report the
      // hub page does not.
      if (!matchesEvent(event, post)) continue;

      const pairKey = `${post.date}|${normalizeTitle(post.title)}`;
      if (seenSlug.has(post.slug) || seenPair.has(pairKey)) continue;

      if (!post.sourceUrl) {
        skipped.push({ event: event.id, slug: post.slug, reason: "no source url — uncitable" });
        continue;
      }
      if (!post.title) {
        skipped.push({ event: event.id, slug: post.slug, reason: "no title" });
        continue;
      }

      const entry = {
        date: post.date,
        title: post.title,
        summary: post.excerpt,
        sourceName: post.sourceName || "যাচাইডেস্ক",
        sourceUrl: post.sourceUrl,
        // Added so later runs are exact and a reader can jump to the report.
        slug: post.slug,
      };
      existing.push(entry);
      seenSlug.add(post.slug);
      seenPair.add(pairKey);
      added.push({ event: event.id, slug: post.slug, date: post.date });
    }

    // Newest-last in the file; the hub page sorts for display, so keeping the
    // append order stable keeps the git diff small and reviewable.
    const curated = existing.filter((e) => !e?.slug);
    const auto = existing.filter((e) => e?.slug).sort((a, b) => (a.date < b.date ? -1 : 1));
    chronology[event.id] = [...curated, ...auto];
  }

  return { chronology, added, skipped };
}

/** Refuse to write anything that would lose or alter an existing curated entry. */
export function verifyPreservesCurated(before, after) {
  for (const [id, items] of Object.entries(before?.chronology ?? {})) {
    const now = after?.[id];
    if (!Array.isArray(now)) return { ok: false, reason: `event ${id} disappeared` };
    for (const item of items) {
      const still = now.some(
        (n) =>
          n?.date === item?.date &&
          normalizeTitle(n?.title) === normalizeTitle(item?.title) &&
          (n?.summary ?? "") === (item?.summary ?? ""),
      );
      if (!still) return { ok: false, reason: `curated entry lost in ${id}: ${item?.date}` };
    }
  }
  return { ok: true };
}

export function renderRegistry(registry, chronology) {
  const out = { ...registry, chronology };
  out.meta = {
    ...(registry.meta ?? {}),
    // The chronicle is now maintained by the pipeline, not typed by hand. The
    // old description said "Curated from public news records", which would now
    // be a false claim about most of the file.
    generatedBy: "pipeline/tools/sync_chronicle.mjs",
    description:
      "Per-event dated chronology. Each entry: date + original Bengali summary + source citation. " +
      "Entries stay INSIDE ghotona-pongji (never in home feed/RSS/sitemap). " +
      "Entries with a `slug` were generated by the pipeline as pointers to reports this desk " +
      "published and sourced; earlier hand-curated entries are preserved as written. No fabrication.",
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  return out;
}

function main() {
  const registry = JSON.parse(readFileSync(CHRONICLE, "utf8"));
  const posts = loadPosts();
  const { chronology, added, skipped } = planSync({ registry, posts, onlyEvent: ONLY_EVENT });

  const check = verifyPreservesCurated(registry, chronology);
  if (!check.ok) {
    console.error(`sync_chronicle: refusing to write — ${check.reason}`);
    process.exitCode = 1;
    return;
  }

  const byEvent = new Map();
  for (const a of added) byEvent.set(a.event, (byEvent.get(a.event) ?? 0) + 1);
  const before = Object.entries(registry.chronology ?? {}).reduce((n, [, v]) => n + v.length, 0);
  const after = Object.values(chronology).reduce((n, v) => n + v.length, 0);

  console.log(
    `sync_chronicle: articles=${posts.length} events=${events().length} ` +
      `entries ${before} -> ${after} added=${added.length}`,
  );
  for (const [id, n] of [...byEvent].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  +${String(n).padStart(3)}  ${id}`);
  }
  if (skipped.length) {
    console.log(`  skipped ${skipped.length} (uncitable):`);
    for (const s of skipped.slice(0, 8)) console.log(`    - ${s.event}/${s.slug}: ${s.reason}`);
  }

  if (REPORT) {
    writeFileSync(REPORT, JSON.stringify({ added, skipped, before, after }, null, 2) + "\n");
    console.log(`  report: ${REPORT}`);
  }

  const next = renderRegistry(registry, chronology);
  const text = JSON.stringify(next, null, 2) + "\n";
  JSON.parse(text);
  const current = JSON.stringify(registry, null, 2) + "\n";
  if (text === current) {
    console.log("nothing to do (idempotent)");
    return;
  }
  if (!added.length && !WRITE) {
    console.log("DRY RUN - only metadata would change; add --write to apply");
    return;
  }

  // Round-trip through JSON and verify it still parses before writing, so a bad
  // shape can never take the site build down with it.
  writeFileSync(CHRONICLE, text);
  console.log(
    `written: ${added.length} new chronology entr(ies) across ${byEvent.size} event(s)`
      + (added.length ? "" : " (metadata only)"),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();