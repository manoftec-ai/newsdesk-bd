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
  const formatRfc = (date) => new Date(date).toUTCString();

  const items = published
    .map(
      (entry) => `  <item>
    <title>${escapeXml(entry.data.title)}</title>
    <link>${escapeXml(url(`/article/${entry.id}`))}</link>
    <guid isPermaLink="true">${escapeXml(url(`/article/${entry.id}`))}</guid>
    <pubDate>${formatRfc(entry.data.date)}</pubDate>
    <description>${escapeXml(entry.data.excerpt)}</description>
    <category>${escapeXml(entry.data.category)}</category>
  </item>`,
    )
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(`${SITE.name} — ${SITE.tagline}`)}</title>
    <link>${escapeXml(url("/"))}</link>
    <description>${escapeXml(SITE.description)}</description>
    <language>bn-BD</language>
    <lastBuildDate>${formatRfc(new Date())}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(body, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}