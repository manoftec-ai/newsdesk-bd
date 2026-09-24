// lib/synth.mjs — SY/SNTH stage (Phase 5). Provider-swappable writer.
// provider: opencode (default) = generates a WRITING TASK prompt from the brief;
// the author (opencode agent or gemini provider) completes the body, then the
// story is finalized into a site draft .md at site/src/content/news/<slug>.md.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BRIEFS_DIR } from './extract.mjs';
import { loadConfig } from './config.mjs';
import { verifyHeadline } from './headline-verify.mjs';

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
  let headline = null;
  try {
    const hv = verifyHeadline(String(brief.headline ?? ''), {
      leads: (brief.members ?? []).map((m) => `${m.title ?? ''} ${m.lead ?? ''}`),
      claim: (brief.claims ?? [])[0] ?? null,
    });
    headline = { status: hv.status, support: Math.round(hv.support * 100) };
  } catch { headline = null; }
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
      headline,
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
${fm.verification.headline ? `  headline:
    status: "${fm.verification.headline.status}"
    support: ${fm.verification.headline.support}` : ''}
  evidence:
${(fm.verification.evidence ?? []).map((e) => `    - type: "${String(e.type).replace(/"/g, '\\"')}"\n      label: "${String(e.label).replace(/"/g, '\\"')}"`).join('\n')}`;
}

// 1.3 — Dynamic target length per story tier. Short briefs (few sources) carry
// little info → short article; rich clusters (many sources) justify a longer
// piece. The writer must stop when the information stops, never pad.
export function targetWords(brief) {
  const n = (brief.members ?? []).length;
  if (n <= 2) return { min: 100, max: 180, tier: 'short' };
  if (n === 3) return { min: 200, max: 350, tier: 'normal' };
  return { min: 400, max: 550, tier: 'complex' };
}

// Claim-level writing rules handed to the writer (proposal #13): how each
// verified claim may be written depends on its status. Returns a short list of
// "- status: claim_text — how to write it" lines (or '' when no claims known).
export function claimRules(brief, { language = 'bn' } = {}) {
  const claims = (brief.claims ?? []).filter((c) => c && c.status);
  if (!claims.length) return '';
  const guide = {
    VERIFIED: 'verified fact — state directly, plainly (…হয়েছে, পুলিশ নিশ্চিত করেছে)',
    CORROBORATED: 'corroborated — state as fact but softer (…জানা গেছে, …বলে জানিয়েছেন কর্মকর্তারা); do not over-claim certainty',
    OFFICIAL: 'official — state with the agency attached (মন্ত্রণালয় জানিয়েছে, বিজ্ঞপ্তিতে বলা হয়েছে)',
    SINGLE_SOURCE: 'single-source — never present as established fact; attribute it (একটি সূত্র জানিয়েছে / …দাবি করেছে)',
    UNCONFIRMED: 'unconfirmed — do not state as fact; put in কী এখনো জানা যায়নি or attribute with doubt (নিশ্চিত নয়, যাচাই হয়নি)',
    CONFLICTING: 'conflicting — NEVER silently pick one side; state the disagreement explicitly (কিছু সূত্রে X, অন্যদিকে Y; এখনো নিশ্চিত নয়)',
  };
  return claims
    .slice(0, 6)
    .map((c) => `- ${c.status}: ${String(c.claim_text ?? '').slice(0, 90)} — ${guide[c.status] ?? 'write carefully per evidence'}`)
    .join('\n');
}

// Writing prompt for the provider. Everything the writer needs in one place.
export function writingPrompt(brief) {
  const srcs = brief.sources.map((s) => `- ${s.name} — ${s.url}`).join('\n');
  const { min, max } = targetWords(brief);
  const leads = brief.members.map((m) =>
    `## [${m.source_id}] ${m.title}\n${m.published_at ?? ''}\n${m.lead}`
  ).join('\n\n');
  const claims = claimRules(brief);
  return `# Story task — newsdesk-bd

Write ONE original Bengali news article (সংবাদ) about this verified story.

## How to write it (fresh-news voice)
- Write ONE plain, fresh Bangla news story (সংবাদ). Report the NEWS itself — the
  event, the facts, what happened — NOT the sources and NOT what each outlet said.
- The member leads below are ONE fact pool: read them, extract the facts, then
  write the story in your own words as if you were on the scene. NEVER walk through
  the outlets one by one and NEVER compare "one report said X, another said Y".
- Body structure (in this order — omit any section that would be empty):
  1. Lead paragraph — most important fact up front (who/what/when/where), plain and short.
  2. "এক নজরে" bullet list of 3–4 key points. Format EXACTLY like this (bold label, then bullets, then a blank paragraph before the next block):
     **এক নজরে**
     - point one
     - point two
     - point three
  3. "## মূল খবর" — 2–5 short paragraphs telling the story in plain chronology or logic.
  4. "## কী জানা গেছে" — ONLY when important verified details need their own explanation
     (numbers, dates, documents, decisions). Omit if the মূল খবর section already carries them.
  5. "## কী এখনো জানা যায়নি" — ONLY if the leads truly leave unknowns (agenda, details,
     identities, decisions). Keep it to what is genuinely NOT reported. Omit the whole
     section if nothing is unknown.
- Source rule (hard): the article is a finished news story. A reader should NOT be
  able to tell which outlet reported what. NEVER name a media outlet, newspaper or
  news agency in the body; NEVER write "...প্রতিবেদনে বলা হয়েছে...", "দুই
  প্রতিবেদনেই...", "একই খবর প্রকাশ করেছে...", "একাধিক সংবাদমাধ্যম...", or a closing
  "…প্রতিবেদনে বিষয়টি নিশ্চিত করেছে…"। The sources are rendered once, AFTER the news,
  with links in the automatic 'সূত্র:' section from front matter.
- Attribute facts to the ACTOR only when it adds journalism (who said/did it):
  "পুলিশ জানিয়েছে, …", "মন্ত্রণালয় জানায়, …", "সংবাদ সম্মেলনে তিনি বলেন, …".
  When there is no actor, just state the fact plainly — do not invent a source
  citation. Say each fact once.

## Claim-level writing rules (how each verified claim may be written)
Apply per the claim status given for this brief (proposal #13):
- VERIFIED (অন্তত দুইটি স্বতন্ত্র নির্ভরযোগ্য সূত্র): may be stated as fact,
  plainly and directly — "…হয়েছে", "পুলিশ নিশ্চিত করেছে…".
- CORROBORATED (দুইটি সূত্র, দুর্বলতর সংকেত): state it as fact but softer —
  "…জানা গেছে", "…বলে জানিয়েছেন কর্মকর্তারা"। Do NOT write "প্রমাণিত" or claim a
  certainty the evidence does not support.
- OFFICIAL (সরকারি/প্রাথমিক সূত্র): state it with the agency attached —
  "মন্ত্রণালয় জানিয়েছে…", "বিজ্ঞপ্তিতে বলা হয়েছে…"।
- SINGLE_SOURCE (একক সূত্র): never present as established fact. Attribute it —
  "একটি সূত্র জানিয়েছে…" or "…দাবি করেছে"। Use cautiously; do not generalize it.
- UNCONFIRMED (নিশ্চিত নয়): say it plainly in কী এখনো জানা যায়নি, or attribute
  with doubt — "এখনো নিশ্চিত নয়", "দাবি, তবে যাচাই হয়নি"। Never state it as fact
  and never headline it.
- CONFLICTING (সূত্রে সাংঘর্ষিক তথ্য): NEVER silently choose one side. Say the
  difference explicitly — "কিছু সূত্রে X বলা হয়েছে, অন্যদিকে Y; কোনটি সঠিক তা
  এখনো নিশ্চিত নয়"। The reader must see both claims.

${claims}
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
- Aim ${min}–${max} words body for this brief. Stop when the information stops — never pad to reach a word count.
- Do NOT end with a 'সূত্র:' source list — source links are rendered automatically from front matter; never put source URLs in the body, and never write a raw/visible full URL.
- FORBIDDEN — no editorial/disclaimer footnotes anywhere. Never append lines like
  "এই সংবাদটি একাধিক যাচাইকৃত সূত্র থেকে সংশ্লেষিত" or "...এটি সম্পাদকীয় পর্যালোচনার অপেক্ষায় থাকা একটি খসড়া।"
  or any variant announcing the article is a draft/awaiting review. Write it as a finished, published news story.
- Badge/verification comes from the front matter — do not undermine it.

## Facts/sources verified
${brief.headline}

### Claim statuses for this brief (from the claim→evidence graph)
${claims.trim() === '' ? 'none provided' : claims.trim()}

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
export function isEditorialFooter(blockText) {
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
//
// News-style: the reader wants SIMPLE FRESH NEWS, not a comparison of "what the
// outlets said". Outlet names and source-comparison meta-language are banned from
// the body everywhere; sources render once AFTER the news in the front-matter
// 'সূত্র:' block (site-side, linked). audit.mjs also enforces these.
export const BANNED_OUTLET_NAMES = [
  'প্রথম আলো', 'দৈনিক ইত্তেফাক', 'কালের কণ্ঠ', 'যুগান্তর', 'সমকাল',
  'দৈনিক বাংলা', 'ঢাকা ট্রিবিউন', 'ডেইলি স্টার', 'বাংলা ট্রিবিউন',
  'বিডিনিউজ২৪', 'দ্য ইন্ডিপেন্ডেন্ট', 'দেশ রূপান্তর', 'জামুনা টিভি',
  'এটিএন বাংলা', 'চ্যানেল আই', 'দ্য বিজনেস স্ট্যান্ডার্ড', 'বিবিসি বাংলা',
  'ভিওএ বাংলা', 'দ্য ডেইলি অবজারভার', 'বিডি২৪লাইভ', 'দৈনিক আজাদী',
  'দ্য গার্ডিয়ান', 'রয়টার্স', 'এপি', 'এএফপি', 'ইউএনবি',
];

// Meta-language that makes the article ABOUT the sources instead of ABOUT the
// news: reporting-on-reporting. The reader must never see "এক প্রতিবেদনে… অন্য
// প্রতিবেদনে…", "দুই প্রতিবেদনেই বলা হয়েছে", "প্রতিবেদনে প্রকাশ পেয়েছে",
// or a closing "…প্রতিবেদনে বিষয়টি নিশ্চিত করা হয়েছে"। Only the front-matter
// সূত্র block carries sources, AFTER the news.
export const BANNED_SOURCE_META = [
  /প্রতিবেদনে\s+বলা\s+হয়েছে/u,
  /প্রতিবেদনেই\s+বলা\s+হয়েছে/u,
  /দুই\s+প্রতিবেদনে/u,
  /দুই\s+ভিন্ন\s+শিরোনামে/u,
  /একই\s+বিষয়ে\s+দুই\s+দৈনিক/u,
  /একই\s+খবর\s+প্রকাশ\s+করেছে/u,
  /একাধিক\s+সংবাদমাধ্যম/u,
  /সংবাদ\s+মাধ্যমে\s+প্রকাশিত/u,
  /প্রতিবেদনে\s+প্রকাশ\s+পেয়েছে/u,
  /প্রতিবেদনে\s+উল্লেখ/u,
  /প্রতিবেদনে\s+জানা\s+গেছে/u,
  /প্রতিবেদন\s+দুইটি/u,
  /দ্বিতীয়\s+প্রতিবেদনে/u,
  /আরেক\s+প্রতিবেদনে/u,
  /একটি\s+প্রতিবেদনে/u,
  /অন্য\s+প্রতিবেদনে/u,
  /গণমাধ্যমের\s+প্রতিবেদনে/u,
  /সংবাদমাধ্যমের\s+প্রতিবেদনে/u,
  /প্রতিবেদনের\s+প্রকাশিত\s+অংশ/u,
  /বিষয়টি\s+নিশ্চিত\s+করেছে\s+[^\s।]+\s*[।]?$/u, // trailing "…নিশ্চিত করেছে সমকাল।"
];

// Invented anonymous actors / analysis (proposal #7): a body must NEVER create
// its own "observers/experts/analysts". Only an explicitly quoted, sourced
// person may be named. "এদিকে/অন্যদিকে" are intentionally NOT banned — they
// are normal Bengali transitions and hard-blocking them would false-reject
// natural bodies; the writer simply must not pad with them.
export const BANNED_INVENTED_ACTORS = [
  /পর্যবক্ষক(রা)?\s+মনে\s+করছেন/u,
  /পর্যবক্ষক(রা)?\s+বলছেন/u,
  /পর্যবক্ষকদের\s+মতে/u,
  /বিশেষজ্ঞরা\s+মনে\s+করছেন/u,
  /বিশেষজ্ঞরা\s+বলছেন/u,
  /বিশেষজ্ঞদের\s+মতে/u,
  /সংশ্লিষ্টরা\s+(?:মনে\s+)?[ব]লছেন/u,
  /সংশ্লিষ্টরা\s+মনে\s+করছেন/u,
  /অনেকে\s+মনে\s+করছেন/u,
  /কেউ\s+কেউ\s+মনে\s+করছেন/u,
  /এ\s+নিয়ে\s+(?:রাজনৈতিক\s+অঙ্গনে\s+)?আলোচনা\s+সৃষ্টি/u,
  /বিষয়টি\s+গুরুত্বের\s+সাথে\s+দেখছেন/u,
  /গুরুত্বের\s+সঙ্গে\s+দেখছেন/u,
  /এ\s+ধরনের\s+পরিস্থিতিতে/u,
  /কয়েকটি\s+সূত্র/u,
  /বিভিন্ন\s+সূত্র/u,
];

export const BANNED_SPECULATION = [
  /বলে\s+মনে\s+করছেন/u,
  /বলে\s+মনে\s+করা হচ্ছে/u,
  /মনে\s+করা হচ্ছে/u,
  /আশা\s+করছেন\s+পর্যবক্ষক/u,
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
  for (const re of BANNED_SOURCE_META) {
    if (re.test(text)) hits.push({ type: 'source-meta', pattern: re.source, match: re.source });
  }
  for (const re of BANNED_INVENTED_ACTORS) {
    if (re.test(text)) hits.push({ type: 'invented-actor', pattern: re.source, match: re.source });
  }
  for (const name of BANNED_OUTLET_NAMES) {
    if (text.includes(name)) hits.push({ type: 'outlet-name', pattern: name, match: name });
  }
  return hits;
}

// Whether a brief already has a finalized story in the content dir.
export function storyExists(slug, { siteDir } = {}) {
  const dir = siteDir ?? resolve(import.meta.dirname, '../../../site/src/content/news');
  try { return !!readFileSync(join(dir, `${slug}.md`), 'utf8'); } catch { return false; }
}