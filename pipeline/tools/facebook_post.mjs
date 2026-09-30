// tools/facebook_post.mjs — post the latest published story to a Facebook Page.
// Secret-gated: if FACEBOOK_PAGE_ID or FACEBOOK_PAGE_TOKEN is missing this exits 0
// (skips) so the workflow stays green until credentials are added.
// Sends at most ONE story per run (the newest not yet sent), so a backlog drains
// one post per scheduled run and the page never gets spammed.
// Uses the Page Graph API (POST /{page-id}/feed). The FB link scraper pulls the
// og:title / og:description / og:image from the article page automatically.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatPostText,
  collectPostCandidates,
  sortNewestFirst,
} from '../lib/social-post-text.mjs';

const CONTENT_DIR = resolve(import.meta.dirname, '../../site/src/content/news');
const STATE_FILE = resolve(import.meta.dirname, '../state/facebook-sent.json');
const GRAPH_VERSION = 'v21.0';

const pageId = process.env.FACEBOOK_PAGE_ID;
const pageToken = process.env.FACEBOOK_PAGE_TOKEN;

export { readFrontmatter } from '../lib/social-post-text.mjs';

export function latestUnsent(unsent) {
  return sortNewestFirst(unsent)[0] ?? null;
}

export async function main() {
  if (!pageId || !pageToken) {
    console.log('facebook_post: no FACEBOOK_PAGE_ID/FACEBOOK_PAGE_TOKEN — skipping');
    return { sent: false, reason: 'no-secrets' };
  }

  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  const posts = collectPostCandidates(files, CONTENT_DIR);

  const sentState = existsSync(STATE_FILE)
    ? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    : { sent: [] };
  const sent = new Set(sentState.sent ?? []);

  const target = latestUnsent(posts.filter((p) => p.date && !sent.has(p.slug)));
  if (!target) {
    console.log('facebook_post: nothing new to post');
    return { sent: false, reason: 'nothing-new' };
  }

  const url = `https://jachaidesk.com/article/${encodeURIComponent(target.slug)}`;
  const message = formatPostText(target);

  const body = new URLSearchParams({
    message,
    link: url,
    access_token: pageToken,
  });

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${String(pageId).trim()}/feed`,
    { method: 'POST', body },
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) {
    console.error('facebook_post: send failed', json.error ?? json);
    return { sent: false, reason: 'send-failed' };
  }

  sent.add(target.slug);
  writeFileSync(STATE_FILE, JSON.stringify({ sent: [...sent].sort() }, null, 2) + '\n');
  console.log(`facebook_post: posted ${target.slug}`);
  return { sent: true, slug: target.slug };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then((r) => {
      if (!r.sent) process.exit(0);
    })
    .catch((error) => {
      console.error('facebook_post: unexpected error', error);
      process.exit(1);
    });
}