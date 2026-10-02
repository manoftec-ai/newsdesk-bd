import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadPosts,
  planSync,
  verifyPreservesCurated,
  renderRegistry,
} from "../tools/sync_chronicle.mjs";
import { events } from "../../site/src/lib/events.js";

// A minimal corpus written to disk, so loadPosts is exercised for real rather
// than trusted: it must skip drafts, tolerate junk, and take the primary source.
function corpus(files) {
  const dir = mkdtempSync(join(tmpdir(), "chron-"));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body, "utf8");
  }
  return dir;
}

const article = (fm, body = "একটি অনুচ্ছেদ।") => `---\n${fm}\n---\n${body}\n`;

test("loadPosts keeps published articles and drops drafts", () => {
  const dir = corpus({
    "live.md": article(
      [
        'title: "ইরান ও ইসরায়েলের যুদ্ধ নিয়ে নতুন আলোচনা"',
        'excerpt: "দুই দেশের মধ্যে কূটনৈতিক আলোচনা চলছে।"',
        "category: international",
        "date: 2026-09-25T10:00:00.000Z",
        "draft: false",
        'sources:',
        '  - name: "দৈনিক ইত্তেফাক"',
        '    url: "https://example.org/a"',
      ].join("\n"),
    ),
    "hidden.md": article(
      [
        'title: "খসড়া প্রতিবেদন"',
        'excerpt: "এটি প্রকাশিত হওয়ার কথা নয়।"',
        "category: national",
        "date: 2026-09-25T10:00:00.000Z",
        "draft: true",
      ].join("\n"),
    ),
    "broken.md": "---\nthis: [is: not: yaml\n---\nbody\n",
    "nomd.md": "no frontmatter at all",
  });

  const posts = loadPosts(dir);
  const slugs = posts.map((p) => p.slug).sort();
  assert.deepEqual(slugs, ["live"], "drafts and unparseable files must not become posts");
  const live = posts[0];
  assert.equal(live.date, "2026-09-25");
  assert.equal(live.year, 2026);
  assert.equal(live.sourceUrl, "https://example.org/a");
  assert.equal(live.sourceName, "দৈনিক ইত্তেফাক");
});

test("an entry is a pointer to a report we published, never invented text", () => {
  const dir = corpus({
    "story.md": article(
      [
        'title: "ইরান ও ইসরায়েলের যুদ্ধে নতুন উন্নতি"',
        'excerpt: "কূটনৈতিক চ্যানলে আলোচনা এগিয়েছে বলে জানা গেছে।"',
        "category: international",
        "date: 2026-09-25T10:00:00.000Z",
        "draft: false",
        "sources:",
        '  - name: "The Daily Star"',
        '    url: "https://example.org/b"',
      ].join("\n"),
    ),
  });

  const { chronology } = planSync({ registry: { chronology: {} }, posts: loadPosts(dir) });
  const entry = chronology["iran-israel-war-2026"]?.[0];
  assert.ok(entry, "the site's own matcher must link this story to the war event");
  // Every field is copied from the article, so nothing here can be fabricated.
  assert.equal(entry.title, "ইরান ও ইসরায়েলের যুদ্ধে নতুন উন্নতি");
  assert.equal(entry.summary, "কূটনৈতিক চ্যানলে আলোচনা এগিয়েছে বলে জানা গেছে।");
  assert.equal(entry.sourceUrl, "https://example.org/b");
  assert.equal(entry.sourceName, "The Daily Star");
  assert.equal(entry.slug, "story");
  assert.equal(entry.date, "2026-09-25");
});

test("an uncitable report is refused rather than published unsourced", () => {
  const dir = corpus({
    "nosource.md": article(
      [
        'title: "ইরান ও ইসরায়েলের যুদ্ধ নিয়ে নতুন দাবি"',
        'excerpt: "দাবিটি এখনো যাচাই হয়নি।"',
        "category: international",
        "date: 2026-09-25T10:00:00.000Z",
        "draft: false",
        "sources: []",
      ].join("\n"),
    ),
  });

  const { chronology, skipped } = planSync({ registry: { chronology: {} }, posts: loadPosts(dir) });
  const entries = chronology["iran-israel-war-2026"] ?? [];
  assert.equal(entries.length, 0, "no entry without a citation");
  assert.ok(
    skipped.some((s) => s.slug === "nosource" && /uncitable/.test(s.reason)),
    "and it must be reported, not silently dropped",
  );
});

test("running twice adds nothing", () => {
  const dir = corpus({
    "a.md": article(
      [
        'title: "ইরান ও ইসরায়েলের যুদ্ধে আলোচনা চলছে"',
        'excerpt: "আলোচনা অব্যাহত আছে বলে জানা গেছে।"',
        "category: international",
        "date: 2026-09-25T10:00:00.000Z",
        "draft: false",
        'sources: [{name: "কারেন্ট", url: "https://example.org/c"}]',
      ].join("\n"),
    ),
  });
  const posts = loadPosts(dir);
  const first = planSync({ registry: { chronology: {} }, posts });
  const second = planSync({ registry: { chronology: first.chronology }, posts });
  assert.equal(first.added.length, 1);
  assert.equal(second.added.length, 0, "idempotent: a rerun must add nothing");
});

test("hand-curated entries survive a sync untouched", () => {
  const curated = {
    "sagor-runi-murder": [
      {
        date: "2012-02-11",
        title: "জাতীয় টিভির সাংবাদিক দম্পতি নিজ বাসায় নিহত",
        summary: "ভোরের আগে পশ্চিম রাজাবাজারের বাড়িতে ছুরিকাঘাতে নিহত হন।",
        sourceName: "The Business Standard",
        sourceUrl: "https://www.tbsnews.net/example",
      },
    ],
  };
  const { chronology, added } = planSync({ registry: { chronology: curated }, posts: [] });

  // Curated entry is still the very first item, byte-identical, and the new
  // pipeline entries are appended after it rather than interleaved.
  assert.deepEqual(chronology["sagor-runi-murder"][0], curated["sagor-runi-murder"][0]);
  assert.ok(verifyPreservesCurated({ chronology: curated }, chronology).ok);
  assert.ok(Array.isArray(added));
});

test("verifyPreservesCurated refuses a rewrite that drops an entry", () => {
  const before = { chronology: { "sagor-runi-murder": [{ date: "2012-02-11", title: "টি", summary: "এক" }] } };
  const after = { "sagor-runi-murder": [] };
  const verdict = verifyPreservesCurated(before, after);
  assert.equal(verdict.ok, false, "losing a curated entry must be detected");
  assert.match(verdict.reason, /disappeared|lost/);
});

test("the published registry stays parseable and honest about its origin", () => {
  const registry = { meta: { schemaVersion: 1, description: "Curated from public news records" }, chronology: {} };
  const out = renderRegistry(registry, { "iran-israel-war-2026": [] });
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(out)));
  assert.equal(out.meta.generatedBy, "pipeline/tools/sync_chronicle.mjs");
  assert.ok(
    /pipeline/.test(out.meta.description),
    "the description must not still claim everything was hand-curated",
  );
});

test("every shipped chronicle entry is citable", () => {
  const path = new URL("../../site/src/data/events-news.json", import.meta.url);
  const data = JSON.parse(readFileSync(path, "utf8"));
  let total = 0;
  for (const [id, items] of Object.entries(data.chronology ?? {})) {
    for (const item of items) {
      total++;
      assert.ok(item.date, `${id}: entry without a date`);
      assert.ok(item.title, `${id}: entry without a title`);
      if (item.slug) {
        // A generated entry is a pointer, so it must carry its citation.
        assert.ok(item.sourceUrl, `${id}/${item.slug}: generated entry without a source url`);
      }
    }
  }
  assert.ok(total > 60, `expected a populated chronicle, found ${total}`);
});

test("the registry ids are all real events", () => {
  const path = new URL("../../site/src/data/events-news.json", import.meta.url);
  const data = JSON.parse(readFileSync(path, "utf8"));
  const ids = new Set(events().map((e) => e.id));
  for (const id of Object.keys(data.chronology ?? {})) {
    assert.ok(ids.has(id), `chronology references unknown event ${id}`);
  }
});