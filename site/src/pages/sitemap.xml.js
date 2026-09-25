import { getCollection } from "astro:content";
import { categories, tags } from "../config/theme.config.ts";
import { events } from "../lib/events.js";

export async function GET(context) {
  const published = (await getCollection("news", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  const url = (path) => new URL(path, context.site).toString();
  const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);

  const SITE_LAUNCH = "2026-09-19";
  const lastmodByCategory = new Map();
  const lastmodByTag = new Map();
  for (const entry of published) {
    const mod = iso(entry.data.updated ?? entry.data.date) ?? SITE_LAUNCH;
    if (entry.data.category) {
      const prev = lastmodByCategory.get(entry.data.category) ?? SITE_LAUNCH;
      if (mod > prev) lastmodByCategory.set(entry.data.category, mod);
    }
    for (const tag of entry.data.tags ?? []) {
      const prev = lastmodByTag.get(tag) ?? SITE_LAUNCH;
      if (mod > prev) lastmodByTag.set(tag, mod);
    }
  }

  const staticPages = ["", "/news", "/search", "/tracked", "/ghotona", "/districts", "/about", "/contact", "/corrections", "/factcheck", "/privacy", "/terms", "/editorial-policy", "/kivabe-jachai-kori", "/utso-niti", "/jachaier-poddhoti"];
  const items = [
    ...staticPages.map((path) => ({ path, lastmod: SITE_LAUNCH })),
    ...categories
      .filter((c) => c.slug !== "latest")
      .map((c) => ({
        path: `/category/${c.slug}`,
        lastmod: lastmodByCategory.get(c.slug) ?? SITE_LAUNCH,
      })),
    ...tags.map((t) => ({ path: `/tags/${t.slug}`, lastmod: lastmodByTag.get(t.slug) ?? SITE_LAUNCH })),
    ...events().map((event) => ({
      path: `/ghotona/${event.id}`,
      lastmod: SITE_LAUNCH,
    })),
    ...published.map((entry) => ({
      path: `/article/${entry.id}`,
      lastmod: iso(entry.data.updated ?? entry.data.date) ?? SITE_LAUNCH,
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items
  .map(
    (item) => `  <url>
    <loc>${url(item.path)}</loc>
    <lastmod>${item.lastmod}</lastmod>
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml" },
  });
}