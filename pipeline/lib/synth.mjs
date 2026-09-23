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
    gujob: ['গুজব', 'ভুয়া', 'মিথ্যা দাবি', 'রিউমার'],
    factcheck: ['ফ্যাক্ট চেক', 'সত্যতা যাচাই', 'ফ্যাক্টচেক'],
    chattogram: ['চট্টগ্রাম', 'কর্ণফুলী', 'কাপ্তাই'],
    sylhet: ['সিলেট'],
    rajshahi: ['রাজশাহী'],
    khulna: ['খুলনা'],
    rangpur: ['রংপুর'],
    barishal: ['বরিশাল'],
    mymensingh: ['ময়মনসিংহ'],
    cumilla: ['কুমিল্লা'],
    narayanganj: ['নারায়ণগঞ্জ'],
    gaibandha: ['গাইবান্ধা', 'সুন্দরগঞ্জ'],
    dinajpur: ['দিনাজপুর'],
    bogura: ['বগুড়া'],
    jashore: ['যশোর'],
    tangail: ['টাঙ্গাইল'],
    coxsbazar: ['কক্সবাজার', 'টেকনাফ'],
    rangamati: ['রাঙ্গামাটি'],
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
keyPoints: []
faq: []
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

## How to write it (synthesize-first)
- Treat ALL member leads below as ONE fact pool. Merge them into a single coherent
  narrative. NEVER walk through the outlets one by one.
- Body structure (in this order):
  1. Lead paragraph — most important fact up front (who/what/when/where), plain and short.
  2. "এক নজরে" bullet list of 3–4 key points. Format EXACTLY like this (bold label, then bullets, then a blank paragraph before the next block):
     **এক নজরে**
     - point one
     - point two
     - point three
  3. "## কী ঘটেছে" — 2–4 short paragraphs telling the story in plain chronology or logic.
  4. "## যা এখনো জানা যায়নি" — ONLY if the leads truly leave unknowns (agenda, details,
     identities, decisions). Keep it to what is genuinely NOT reported. Omit the whole
     section if nothing is unknown.
  5. A short closing verification line IN PROSE (no list): name the outlets AT MOST ONCE,
     e.g. "বাংলা ট্রিবিউন ও যুগান্তরের প্রতিবেদনে বিষয়টি নিশ্চিত করা হয়েছে।"
- Source attribution rules (hard):
  - Name a source (as a link) AT MOST ONCE, for the key fact — combine the outlets:
    "বাংলা ট্রিবিউন ও যুগান্তর জানিয়েছে, …"
  - Name sources separately ONLY when they disagree or one carries details the other lacks,
    and say WHAT the difference is: "বাংলা ট্রিবিউন বৈঠকের স্থান হিসেবে একটি হোটেলের কথা বলেছে; যুগান্তরের প্রতিবেদনে স্থান নিয়ে বিস্তারিত নেই।"
  - FORBIDDEN sequential chains: "…প্রতিবেদনে বলা হয়েছে…", "একই খবর প্রকাশ করেছে…",
    "দুই প্রতিবেদনেই…". State each fact once; attribute once.
  - Link the outlet names to their URLs where a fact comes from them.

## Constraints (hard)
- ORIGINAL synthesis only. Never reprint any one outlet's article. Rewrite in your own words.
- Every factual claim must trace to the member leads below.
- Neutral, plain editorial Bengali. No hype, NO speculation. Never invent reactions — no
  "পর্যবক্ষকরা মনে করছেন…", "আলোচনার জন্ম দেবে বলে মনে করা হচ্ছে…", "বলে মনে করছেন…" —
  unless an outlet explicitly quotes someone saying it.
- No generic background padding. Add context ONLY if it directly explains why the news
  matters AND is present in the leads. Never add background just to lengthen the article.
- If a fact is unknown, say so briefly or omit it.
- Title: an accurate, concise Bengali headline (report headline-news style).
- Excerpt: 1–2 sentence lead summary for cards.
- Aim ~250–350 words body. Stop when the information stops — never pad to reach a word count.
- Do NOT end with a 'সূত্র:' source list — source links are rendered automatically from front matter; never put source URLs in the body, and never write a raw/visible full URL.
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
  const { keyPoints, remaining } = extractKeyPoints(body);
  if (keyPoints.length) {
    content = content.replace(
      'keyPoints: []',
      `keyPoints:\n${keyPoints.map((p) => `  - "${String(p).replace(/"/g, '\\"')}"`).join('\n')}`,
    );
  }
  const dir = siteDir ?? resolve(import.meta.dirname, '../../../site/src/content/news');
  mkdirSync(dir, { recursive: true });
  const f = join(dir, `${slug}.md`);
  writeFileSync(f, content + remaining.trim() + '\n');
  return f;
}

// Pull a writer's "এক নজরে" bullet block out of the body into keyPoints front
// matter, and remove that block from the article body (the UI renders it as a
// styled box instead). Returns { keyPoints, remaining }.
function extractKeyPoints(md) {
  const m = String(md).match(/(?:\*\*)?এক\s*নজরে(?:\*\*)?(?::)?\s*\n((?:\s*(?:[-•*])\s*.+\n?)+)/u);
  if (!m) return { keyPoints: [], remaining: md };
  const keyPoints = m[1]
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-•*])\s*/, '').replace(/\*+$/g, '').trim())
    .filter((p) => p.length > 1);
  const remaining = String(md)
    .replace(m[0], '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { keyPoints, remaining };
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

// 1.2 — Editorial gate: speculation & empty-predictive filler that must NEVER
// appear in a published body unless the brief explicitly quotes someone saying
// it. finalize_stories.mjs BLOCKS (never publishes) any body that hits these;
// the story is simply picked again and re-authored on a later automation run.
export const BANNED_SPECULATION = [
  /পর্যবক্ষক(রা)?\s+মনে\s+করছেন/u,
  /পর্যবক্ষকদের\s+মনে\s+করছেন/u,
  /পর্যবক্ষকদের\s+মতে/u,
  /বলে\s+মনে\s+করছেন/u,
  /বলে\s+মনে\s+করা হচ্ছে/u,
  /মনে\s+করা হচ্ছে/u,
  /মনে\s+করছেন\s+অনেকে/u,
  /অনেকে\s+মনে\s+করছেন/u,
  /আশা\s+করছেন\s+পর্যবক্ষক/u,
  /পর্যবক্ষকরা\s+আশা\s+করছেন/u,
  /আরও\s+তথ্য\s+প্রকাশ\s+আশা/u,
  /আলোচনার\s+জন্ম\s+দেবে/u,
  /বলে\s+ধারণা/u,
  /বলে\s+আশা\s+করা হচ্ছে/u,
];

// Predictive sentences that add no information and assert an unapproved future.
export const BANNED_FILLER_SENTENCES = [
  /বিষয়টি\s+নিয়ে\s+ব্যাপক\s+আলোচনা\s+হতে\s+পারে।/u,
  /বিষয়টি\s+নিয়ে\s+আলোচনা\s+হতে\s+পারে।/u,
  /বিষয়টি\s+নিয়ে\s+আরও\s+আলোচনা\s+হতে\s+পারে।/u,
];

export function findEditorialViolations(body) {
  const text = String(body ?? '');
  const hits = [];
  for (const re of BANNED_SPECULATION) {
    const m = text.match(re);
    if (m) hits.push({ type: 'speculation', pattern: re.source, match: m[0] });
  }
  for (const re of BANNED_FILLER_SENTENCES) {
    if (re.test(text)) hits.push({ type: 'filler', pattern: re.source, match: re.source });
  }
  return hits;
}

// Whether a brief already has a finalized story in the content dir.
export function storyExists(slug, { siteDir } = {}) {
  const dir = siteDir ?? resolve(import.meta.dirname, '../../../site/src/content/news');
  try { return !!readFileSync(join(dir, `${slug}.md`), 'utf8'); } catch { return false; }
}