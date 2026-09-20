import { getCollection } from "astro:content";
import { SITE } from "../lib/news-data.js";

const escapeXml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function GET(context) {
  const published = (await getCollection("news", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  const url = (path) => new URL(path, context.site).toString();
  const iso = (date) => new Date(date).toISOString();

  const items = published
    .map(
      (entry) => `  <url>
    <loc>${url(`/article/${entry.id}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(SITE.name)}</news:name>
        <news:language>bn</news:language>
      </news:publication>
      <news:publication_date>${iso(entry.data.date)}</news:publication_date>
      <news:title>${escapeXml(entry.data.title)}</news:title>
      ${(entry.data.tags ?? []).length ? `      <news:keywords>${escapeXml(entry.data.tags.join(", "))}</news:keywords>` : ""}
    </news:news>
  </url>`,
    )
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items}
</urlset>`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml" },
  });
}