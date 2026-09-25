import { getCollection } from "astro:content";

export async function GET(context) {
  const published = (await getCollection("news", ({ data }) => !data.draft))
    .filter((e) => e.data.thumbnail)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  const url = (path) => new URL(path, context.site).toString();
  const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const items = published.map((entry) => ({
    loc: url(`/article/${entry.id}`),
    imageLoc: url(entry.data.thumbnail),
    title: entry.data.title,
    caption: entry.data.thumbnailAlt || entry.data.excerpt || entry.data.title,
    lastmod: iso(entry.data.updated ?? entry.data.date),
  }));

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${items
  .map(
    (it) => `  <url>
    <loc>${it.loc}</loc>
    <image:image>
      <image:loc>${it.imageLoc}</image:loc>
      <image:title>${esc(it.title)}</image:title>
      <image:caption>${esc(it.caption)}</image:caption>
    </image:image>
    <lastmod>${it.lastmod}</lastmod>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}
