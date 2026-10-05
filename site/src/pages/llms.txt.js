import { SITE, NAVIGATION, MORE_NAVIGATION } from "../lib/news-data.js";

export async function GET(context) {
  const base = new URL("/", context.site).toString().replace(/\/$/, "");
  const lines = [];

  lines.push(`# ${SITE.name}`);
  lines.push("");
  lines.push(`> ${SITE.tagline}`);
  lines.push("");
  lines.push(SITE.description);
  lines.push("");
  lines.push("## Sections");
  lines.push("");
  for (const item of [...NAVIGATION, ...MORE_NAVIGATION]) {
    lines.push(`- [${item.label}](${base}${item.to})`);
  }
  lines.push("");
  lines.push("## Feeds & sitemaps");
  lines.push("");
  lines.push(`- [RSS feed](${base}/rss.xml)`);
  lines.push(`- [Sitemap](${base}/sitemap.xml)`);
  lines.push(`- [News sitemap](${base}/news-sitemap.xml)`);
  lines.push(`- [Images sitemap](${base}/sitemap-images.xml)`);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
