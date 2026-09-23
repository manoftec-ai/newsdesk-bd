# Session — name-only source links in article bodies (D50) (2026-09-23)

## What happened
User: "in a news page where we show the source of the news we sometimes showing
full link of the source. but i do not want that. only show the source name and
link can be hide on the name. no need full link to show up."

## Root cause
The auto-authored article BODY ends with a `সূত্র:` list written as
`- নাম — https://full-url` (plain text URL). Markdown auto-linked the URL and
rendered the full URL as the visible link text — on ≈420 published articles.
(The frontmatter "সূত্র" block at the bottom of the article page already showed
names only, using `source.name`.)

## Fix (commit f0aed31)
1. `site/src/lib/rehype-name-only-links.mjs` — a rehype plugin registered via
   `astro.config.mjs` `markdown.rehypePlugins`. For every `<li>` in the Markdown
   body: if an `<a>`'s visible text is a URL and it follows `নাম — `, it rewrites
   the entry to `<a name only>নাম</a>` (dotted underline). If no name precedes,
   falls back to the bare hostname (www stripped) as link text. Non-URL link
   text is left untouched. This backfills all existing articles at build time —
   no per-file content edits needed.
2. Author prompts updated so future bodies never leak raw URLs:
   - `.github/workflows/auto-author.yml` (opencode auto-author)
   - `pipeline/lib/synth.mjs` writingPrompt → write `[source name](url)`.

## Verification
- Plugin unit-tested with a simulated hast tree: `নাম — url` → `<a>নাম</a>`;
  bare-URL link in li → hostname; normal link text untouched.
- Pipeline `npm test` 26/26 pass.
- Local Astro build impossible on Termux (D28) → Vercel deploy via push.

## Memory updates
- newsdesk-bd memory: D50 decision row + header. Session log this file.