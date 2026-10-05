import { SITE } from "../lib/news-data.js";

export async function GET(context) {
  const aiBots = [
    "GPTBot",
    "ChatGPT-User",
    "ClaudeBot",
    "PerplexityBot",
    "Google-Extended",
    "CCBot",
  ];
  const aiRules = aiBots
    .map((bot) => `User-agent: ${bot}\nAllow: /\n`)
    .join("\n");

  const body = `User-agent: *
Allow: /

${aiRules}
Sitemap: ${new URL("/sitemap.xml", context.site).toString()}
Sitemap: ${new URL("/news-sitemap.xml", context.site).toString()}
Sitemap: ${new URL("/sitemap-images.xml", context.site).toString()}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}