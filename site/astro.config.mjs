import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";
import { satteri } from "@astrojs/markdown-satteri";
import nameOnlyLinks from "./src/lib/rehype-name-only-links.mjs";

const site = process.env.SITE_URL || process.env.PUBLIC_SITE_URL || "https://jachaidesk.com";

export default defineConfig({
  site,
  markdown: {
    processor: satteri({ hastPlugins: [nameOnlyLinks] }),
  },
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});