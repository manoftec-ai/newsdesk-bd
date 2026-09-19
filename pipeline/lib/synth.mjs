// lib/synth.mjs — SY/SNTH stage (Phase 5). Provider-swappable writer.
// provider: opencode (default) = generates a WRITING TASK prompt from the brief;
// the author (opencode agent or gemini provider) completes the body, then the
// story is finalized into a site draft .md at site/src/content/news/<slug>.md.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BRIEFS_DIR } from './extract.mjs';
import { loadConfig } from './config.mjs';

export function loadBrief(slug) {
  const f = join(BRIEFS_DIR, `${slug}.json`);
  return JSON.parse(readFileSync(f, 'utf8'));
}

export function listBriefs() {
  return readdirSync(BRIEFS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
}

// Deterministic tag inference from verified content (headline + member titles).
// Only tags defined in site/src/config/theme.config.ts are emitted; nothing is
// labeled from thin air — a tag is added only when its keyword actually appears.
export function inferTags(brief) {
  const pool = [
    brief.headline ?? '',
    ...(brief.members ?? []).map((m) => `${m.title ?? ''} ${m.lead ?? ''}`),
  ].join(' ');
  const map = {
    health: ['ডেঙ্গু', 'হাসপাতাল', 'স্বাস্থ্য', 'কিডনি', 'হাম', 'ভর্তি', 'রোগী', 'ঝুঁকি'],
    education: ['শিক্ষা', 'শিক্ষাব্যবস্থা', 'স্কুল', 'কলেজ', 'বিশ্ববিদ্যালয়', 'শিক্ষার্থী', 'সাক্ষরতা'],
    economy: ['গ্যাস', 'বেতন', 'ভাতা', 'ইটভাটা', 'অর্থনীতি', 'বাজেট', 'টাক', 'মুদ্রাস্ফীতি', 'বাণিজ্য'],
    transport: ['মহাসড়ক', 'বাস', 'হাইওয়ে', 'রেল', 'সড়ক', 'মেট্রোরেল', 'ট্রেন', 'গাড়ি'],
    weather: ['আবহাওয়া', 'বৃষ্টি', 'ঝড়', 'বন্যা', 'তাপমাত্রা'],
    cricket: ['ক্রিকেট', 'টেস্ট', 'সেঞ্চুরি', 'উইকেট', 'রান', 'বোলার', 'ব্যাটার', 'হৃদয়'],
    dhaka: ['ঢাকা', 'মিরপুর', 'কাশিমপুর', 'বুড়িগঙ্গা', 'রাজধানী'],
    metro: ['মেট্রো'],
  };
  const tags = [];
  for (const [slug, kws] of Object.entries(map)) {
    if (kws.some((kw) => pool.includes(kw))) tags.push(slug);
  }
  return tags;
}

// Front matter for a story. draft:false = auto-publish (user decision 2026-09-19;
// overrides original draft-first). Flip to true for manual-review mode later.
export function frontMatter(brief) {
  const badgeMap = { verified: 'verified', confirmed: 'confirmed', single: 'partial', skeptical: 'suspect' };
  const badge = badgeMap[brief.verdict?.badge] ?? 'partial';
  const tier = brief.verdict?.tier ?? brief.tier ?? 'B';
  const firstDate = brief.date ? new Date(brief.date).toISOString() : new Date().toISOString();
  const fm = {
    title: String(brief.headline ?? '').replace(/"/g, '\\"'),
    excerpt: '…',
    date: firstDate,
    category: brief.category ?? 'national',
    tags: inferTags(brief),
    author: 'desk',
    lang: 'bn',
    draft: false,
    sources: brief.sources ?? [],
    verification: {
      badge,
      tier,
      score: brief.verdict?.score ?? 0,
      evidence: brief.evidence ?? [],
    },
  };
  const tagList = fm.tags.length ? `[${fm.tags.map((t) => `"${t}"`).join(', ')}]` : '[]';
  return `title: "${fm.title}"
seoTitle: "…"
excerpt: "…"
seoDescription: "…"
date: ${fm.date}
category: "${fm.category}"
tags: ${tagList}
author: "desk"
lang: "bn"
draft: false
sources:
${fm.sources.map((s) => `  - name: "${String(s.name).replace(/"/g, '\\"')}"\n    url: "${s.url}"`).join('\n')}
verification:
  badge: "${badge}"
  tier: "${tier}"
  score: ${fm.verification.score}
  evidence:
${(fm.verification.evidence ?? []).map((e) => `    - type: "${String(e.type).replace(/"/g, '\\"')}"\n      label: "${String(e.label).replace(/"/g, '\\"')}"`).join('\n')}`;
}

// Writing prompt for the provider. Everything the writer needs in one place.
export function writingPrompt(brief) {
  const srcs = brief.sources.map((s) => `- ${s.name} — ${s.url}`).join('\n');
  const leads = brief.members.map((m) =>
    `## [${m.source_id}] ${m.title}\n${m.published_at ?? ''}\n${m.lead}`
  ).join('\n\n');
  return `# Story task — newsdesk-bd

Write ONE original Bengali news article (সংবাদ) about this verified story.

## Constraints (hard)
- ORIGINAL synthesis only. Never reprint any one outlet's article. Rewrite in your own words.
- Every factual claim must trace to the member leads below (facts first).
- Neutral, plain editorial Bengali. No hype, no speculation. If a fact is unknown, say so or omit it.
- Title: an accurate, concise Bengali headline (report headline-news style).
- Excerpt: 1–2 sentence lead summary for cards.
- Aim ~250–350 words body. Include a short context paragraph ("এই খবরটি একাধিক সূত্রে যাচাই করা হয়েছে") when multi-source.
- End with the sources list (সূত্র:) linking every source URL. That list is the last thing: nothing after it.
- FORBIDDEN — no editorial/disclaimer footnotes anywhere. Never append lines like
  "এই সংবাদটি একাধিক যাচাইকৃত সূত্র থেকে সংশ্লেষিত" or "...এটি সম্পাদকীয় পর্যালোচনার অপেক্ষায় থাকা একটি খসড়া।"
  or any variant announcing the article is a draft/awaiting review. Write it as a finished, published news story.
- Badge/verification comes from the front matter — do not undermine it.

## Facts/sources verified
${brief.headline}

### Member leads (facts pool)
${leads}

### Sources to cite
${srcs}

Return ONLY the final markdown (front matter included).`;
}

// Finalize: write the draft .md into the site content dir.
export function finalizeStory(slug, bodyMd, { siteDir } = {}) {
  const brief = loadBrief(slug);
  let content = `---\n${frontMatter(brief)}\n---\n\n`;
  const body = stripEditorialFooters(bodyMd);
  const excerpt = extractExcerpt(body);
  if (excerpt) {
    content = content.replace('excerpt: "…"', `excerpt: "${excerpt}"`);
    content = content.replace(
      'seoDescription: "…"',
      `seoDescription: "${excerpt.length > 155 ? `${excerpt.slice(0, 154)}…` : excerpt}"`,
    );
  }
  const title = String(brief.headline ?? '').trim();
  const capTitle = (t) => {
    if (t.length <= 72) return t;
    const cut = t.slice(0, 71);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > 10 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  };
  content = content.replace(
    'seoTitle: "…"',
    `seoTitle: "${capTitle(title).replace(/"/g, '\\"')}"`,
  );
  const dir = siteDir ?? resolve(import.meta.dirname, '../../../site/src/content/news');
  mkdirSync(dir, { recursive: true });
  const f = join(dir, `${slug}.md`);
  writeFileSync(f, content + body.trim() + '\n');
  return f;
}

// Remove trailing editorial disclaimers ("synthesized from sources, draft awaiting
// review") that a writer might append. Guarantee: published stories never carry a
// draft/editorial-review footnote. Only trailing paragraph blocks are inspected,
// and only when their text clearly matches a disclaimer signature.
function isEditorialFooter(blockText) {
  const text = blockText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return (
    /পর্যালোচনার অপেক্ষায়/u.test(text) ||
    /সম্পাদকীয় পর্যালোচন/u.test(text) ||
    /সংশ্লেষ/u.test(text) ||
    (/খসড়া/u.test(text) && /সূত্র/u.test(text))
  );
}
function stripEditorialFooters(md) {
  const blocks = String(md).trim().split(/\n\s*\n/);
  for (let guard = 0; guard < 5 && blocks.length > 1; guard++) {
    if (!isEditorialFooter(blocks[blocks.length - 1])) break;
    blocks.pop();
  }
  return blocks.join('\n\n');
}

function extractExcerpt(md) {
  const lines = md.split('\n').map((l) => l.trim()).filter(Boolean);
  return (lines.slice(0, 3).join(' ').replace(/"/g, '\\"')).slice(0, 180);
}

// Whether a brief already has a finalized story in the content dir.
export function storyExists(slug, { siteDir } = {}) {
  const dir = siteDir ?? resolve(import.meta.dirname, '../../../site/src/content/news');
  try { return !!readFileSync(join(dir, `${slug}.md`), 'utf8'); } catch { return false; }
}