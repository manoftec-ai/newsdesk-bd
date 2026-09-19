import { getCollection } from "astro:content";

export async function GET(context) {
  const published = (await getCollection("news", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  const url = (path) => new URL(path, context.site).toString();

  const staticPages = [
    "",
    "/news",
    "/search",
    "/about",
    "/contact",
    "/tags/dhaka",
    "/tags/cricket",
  ];

  const items = [
    ...staticPages.map((path) => ({ path, lastmod: "2026-09-19" })),
    ...published.map((entry) => ({
      path: `/article/${entry.id}`,
      lastmod: (entry.data.updated ?? entry.data.date).toISOString().slice(0, 10),
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