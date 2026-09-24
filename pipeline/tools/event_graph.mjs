// tools/event_graph.mjs — STORY EVENT GRAPH builder (read-only store; diff-writes site data).
//
// Derives, for every published story that has a claims graph, a chronological
// "কীভাবে উন্মোচিত হলো" timeline + related stories (shared actors), then writes
//     site/src/data/event-graph.json        ← { meta, stories: { slug: {...} } }
// Diff-write only: if the generated JSON equals the current file byte-for-byte,
// the file is NOT rewritten (keeps pipeline commit noise at zero when nothing
// about the graph changed).
//
// usage: node tools/event_graph.mjs [--json] [--slug=SLUG] [--min-events=0]
//   --json        print the generated data object to stdout
//   --slug=SLUG   restrict to one story (still writes the full file)
//   --min-events  only include stories with >= N timeline events
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { storyTimeline, storyMeta, relatedStories } from '../lib/event-graph.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE_DATA = join(HERE, '../../site/src/data');
const OUT_PATH = join(SITE_DATA, 'event-graph.json');

const slugArg = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1];
const minEvents = Number(process.argv.find((a) => a.startsWith('--min-events='))?.split('=')[1]) || 0;
const JSON_OUT = process.argv.includes('--json');

function briefFor(slug) {
  const p = join(HERE, '../state/briefs', `${slug}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

export function buildEventGraph(db, { minEvents: minEv = minEvents, slugFilter = slugArg } = {}) {
  const stories = {};
  const files = readdirSync(join(HERE, '../state/briefs')).filter((f) => f.endsWith('.json')).sort();
  // cluster_id -> slug (inverts the brief index so related stories resolve to site slugs)
  const slugByCluster = new Map();
  for (const f of files) {
    const brief = briefFor(f.replace(/\.json$/, ''));
    if (brief?.clusterId) slugByCluster.set(Number(brief.clusterId), f.replace(/\.json$/, ''));
  }
  for (const f of files) {
    const slug = f.replace(/\.json$/, '');
    if (slugFilter && slug !== slugFilter) continue;
    const brief = briefFor(slug);
    const clusterId = brief?.clusterId ?? null;
    if (!clusterId) continue;
    const meta = storyMeta(db, clusterId);
    const tl = storyTimeline(db, clusterId);
    if (tl.events.length < minEv) continue;
    stories[slug] = {
      cluster_id: clusterId,
      headline: meta?.headline ?? brief?.headline ?? null,
      first_seen: meta?.first_seen ?? null,
      last_update: meta?.last_update ?? null,
      claim_count: tl.claims.length,
      events: tl.events,
      related: relatedStories(db, clusterId).map((r) => {
        const m = storyMeta(db, r.cluster_id);
        const rSlug = slugByCluster.get(Number(r.cluster_id));
        return {
          cluster_id: r.cluster_id,
          slug: rSlug,
          actor_links: r.actor_links,
          source_links: r.source_links,
          claim_count: r.claim_count,
          headline: m?.headline ?? null,
        };
      }),
    };
  }
  return {
    meta: {
      schemaVersion: 1,
      generatedBy: 'tools/event_graph.mjs',
      storyCount: Object.keys(stories).length,
      kinds: ['claim', 'evidence', 'verify', 'conflict'],
    },
    stories,
  };
}

function run() {
  const db = openDb();
  const graph = buildEventGraph(db);
  db.close();
  if (JSON_OUT) {
    console.log(JSON.stringify(graph, null, 2));
    return;
  }

  const prev = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : null;
  const next = `${JSON.stringify(graph, null, 2)}\n`;
  let wrote = false;
  if (prev === next) {
    console.log(`event-graph.json: unchanged (${graph.meta.storyCount} stories)`);
  } else {
    writeFileSync(OUT_PATH, next);
    wrote = true;
    console.log(`event-graph.json: wrote ${graph.meta.storyCount} stories (changes since last run)`);
  }

  // Report the biggest timelines + any stories whose events reference missing data.
  const withEvents = Object.entries(graph.stories).filter(([, s]) => s.events.length > 0)
    .sort((a, b) => b[1].events.length - a[1].events.length);
  console.log(`graph: ${graph.meta.storyCount} stories, ${withEvents.length} with events`);
  for (const [slug, s] of withEvents.slice(0, 8)) {
    console.log(`  ${slug.padEnd(16)} ${String(s.events.length).padStart(3)} events, ${s.claim_count} claims, ${s.related.length} related`);
  }
  console.log(wrote ? '→ event-graph.json written to site data' : '→ event-graph.json up to date');
}

if (import.meta.url === `file://${process.argv[1]}`) run();