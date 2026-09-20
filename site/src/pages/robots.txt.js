import { SITE } from "../lib/news-data.js";

export async function GET(context) {
  const body = `User-agent: *
Allow: /

Sitemap: ${new URL("/sitemap.xml", context.site).toString()}
Sitemap: ${new URL("/news-sitemap.xml", context.site).toString()}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}