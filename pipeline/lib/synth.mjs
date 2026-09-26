// lib/synth.mjs — SY/SNTH stage (Phase 5). Provider-swappable writer.
// provider: opencode (default) = generates a WRITING TASK prompt from the brief;
// the author (opencode agent or gemini provider) completes the body, then the
// story is finalized into a site draft .md at site/src/content/news/<slug>.md.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BRIEFS_DIR } from './extract.mjs';
import { loadConfig } from './config.mjs';
import { verifyHeadline } from './headline-verify.mjs';
import {
  publicationMode,
  lengthForMode,
  richSourceRule,
  richSourceThresholds,
  whyItMattersSupported,
  isSensitiveStory,
  storyFormat,
  factCheckClaim,
  factCheckVerdict,
  factCheckNote,
} from './editorial.mjs';
import { targetWords } from './length.mjs';
import { DEFAULT_MIN_PUBLISH_WORDS, TARGET_ARTICLE_WORDS } from './editorial.mjs';

// Re-export the length helper for the existing synthesis API consumers.
export { targetWords };

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
export function frontMatter(brief, { publication = null } = {}) {
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
  const fcBlock = factCheckBlock(brief);
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
  # 2026-09-26: true when a tier A (national/politics/international) story is
  # published from a single source. The site must say so on the page, because the
  # badge alone reads as stronger corroboration than one source can support.
  uncorroborated: ${fm.uncorroborated === true}
${publication ? `  status: "passed"
  evaluatedAt: "${String(publication.checkedAt).replace(/"/g, '\\"') }"
  clusterId: ${Number(publication.clusterId)}
  claimIds:
${(publication.claimIds ?? []).map((id) => `    - ${Number(id)}`).join('\n')}
  evidenceHash: "${String(publication.evidenceHash ?? '').replace(/"/g, '\\"') }"` : ''}
${fm.verification.headline ? `  headline:
    status: "${fm.verification.headline.status}"
    support: ${fm.verification.headline.support}` : ''}
  evidence:
${(fm.verification.evidence ?? []).length
  ? (fm.verification.evidence ?? []).map((e) => `    - type: "${String(e.type).replace(/"/g, '\\"')}"\n      label: "${String(e.label).replace(/"/g, '\\"')}"`).join('\n')
  : '    []'}
${publication ? `publication:
  slug: "${String(publication.slug).replace(/"/g, '\\"') }"
  gate: "passed"
  gateVersion: "${String(publication.gateVersion).replace(/"/g, '\\"') }"
  checkedAt: "${String(publication.checkedAt).replace(/"/g, '\\"') }"
  clusterId: ${Number(publication.clusterId)}
  claimIds:
${(publication.claimIds ?? []).map((id) => `    - ${Number(id)}`).join('\n')}
  evidenceHash: "${String(publication.evidenceHash ?? '').replace(/"/g, '\\"') }"
` : ''}${fcBlock}`;
}

// Deterministic  #19 fact-check front-matter block. Emitted ONLY when a story is
// classified as a fact-check piece — claim, verdict, date and note all derive
// from the verified evidence graph (never fabricated). Empty when not a
// fact-check, so normal news stories keep the current front matter untouched.
export function factCheckBlock(brief) {
  if (storyFormat(brief) !== 'factcheck') return '';
  const claim = factCheckClaim(brief);
  if (!claim) return '';
  const verdict = factCheckVerdict(brief);
  const date = brief.date ? new Date(brief.date).toISOString() : new Date().toISOString();
  const note = factCheckNote(verdict);
  const esc = (s) => String(s).replace(/"/g, '\\"');
  return `factCheck:
  claim: "${esc(claim)}"
  verdict: "${verdict}"
  verifiedDate: ${date}
  note: "${esc(note)}"`;
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
  const mode = publicationMode(brief);
  const format = storyFormat(brief);
  // Pass `brief` so lengthForMode can use the per-story targetWords(). It was
  // previously called without it, so every prompt silently fell back to the
  // old member-count bands and the real per-story targets were never applied.
  const { min, max } = lengthForMode(mode, brief.members.length, brief);
  const leads = brief.members.map((m) =>
    `## [${m.source_id}] ${m.title}\n${m.published_at ?? ''}\n${m.lead}`
  ).join('\n\n');
  const claims = claimRules(brief);
  const whySupported = whyItMattersSupported(brief);
  const whyBlock = whySupported
    ? `- "কেন গুরুত্বপূর্ণ" — the leads themselves carry a consequence (impact,
     risk, harm, decision, cost). Write ONE short paragraph titled "## কেন
     গুরুত্বপূর্ণ" ONLY when the impact you state is one of those consequences.
     Never invent importance the facts do not support.`
    : `- "কেন গুরুত্বপূর্ণ" — OMIT entirely. The fact pool carries no stated
     consequence, so a why-it-matters section would be invented (forbidden).`;
  const modeDesc = {
    'news-brief': `PUBLICATION MODE: NEWS BRIEF. This story is VERIFIED but THIN — the fact pool carries essentially the headline's one fact and nothing more. Do NOT pad. Write a short brief (${min}–${max} words): a crisp 1-2 sentence lead, then at most one paragraph of what is confirmed. Skip এক নজরে and skip the "মূল খবর" section entirely if they would only repeat the lead. Example shape:
• Lead (1-2 sentences) — the headline fact, plainly.
• One short paragraph — anything else that is actually confirmed (the "what/known" facts above).
That's it. Readers want the verified fact fast, not recycled sentences.`,
    'breaking': `PUBLICATION MODE: BREAKING NEWS. The event just happened (${min}–${max} words). Lead with the single strongest confirmed fact, immediately add the honest caveat "বিস্তারিত এখনো নিশ্চিত নয়" / "পরিস্থিতি চলমান" if details are unconfirmed. Structure: lead, 1–2 short paragraphs of what IS known, then "## কী জানা যায়নি" listing what is NOT yet confirmed. This is an UP-TO-THE-MINUTE brief — every sentence must be a verified fact or an explicit unknown; no padding, no "ইতিমধ্যে ইন্টারনেটে ভাইরাল", no invented reactions. It will be updated when more is confirmed, so say "আরও তথ্য আসছে" ONLY if true.`,
    'developing': `PUBLICATION MODE: DEVELOPING STORY. This is an ongoing situation with verified details still arriving (${min}–${max} words). Use this structure:
## মূল খবর — the strongest confirmed facts so far, written as one flowing narrative (not a list).
## সর্বশেষ আপডেট — ONLY if a newer development must be highlighted separately from the earlier facts (fresh time-stamped detail). Omit if the narrative already includes it.
## ঘটনাপঞ্জি — ONLY when there is a genuine sequence of dated steps (2+ distinct events at different times). Omit otherwise.
## কী জানা গেছে — the confirmed facts, cleanly, only those not already in মূল খবর.
## কী এখনো জানা যায়নি — explicitly honest: what is NOT yet known (causes, toll, identities, decisions). NEVER fill this with invented outcomes.
Explicitly say the situation is evolving ("পরিস্থিতি চলমান", "এখনো যাচাই চলছে") where true. No invented future-tense outcomes. Lead with the strongest confirmed fact.`,
    'standard': `PUBLICATION MODE: STANDARD NEWS. Write a full ${min}–${max}-word article using the structure below.`,
  }[mode] ?? '';

  // Market-derived length standard (2026-09-25). Measured from 51 real articles
  // across Ittefaq, Dhaka Tribune, Deshrupantor, New Age and BDNews24:
  // median 269, mean 348, p75 405. State it as a target, not a licence to pad:
  // every sentence must still trace to the fact pool or the claim set.
  // The length instruction must come from lengthForMode, not from a constant.
  //
  // 2026-09-26: this block hardcoded "aim for about 250 words ... between 250 and
  // 400" for EVERY story, while the line above computed the real per-story band
  // from contentSufficiency. national-555 — 3,692 words of evidence across 20
  // sources, sufficiency 100 — was told 250-400 here and 600-1000 by
  // lengthForMode, in the same prompt. The writer took the conservative number,
  // which is why the corpus sat at a 192-word median with briefs holding
  // thousands of words. The gate in editorial.mjs stops thin stories starting;
  // this is what lets well-sourced ones actually reach their length.
  const lengthStandard = `LENGTH STANDARD (measured from real Bangladeshi newspaper articles):
• Hard minimum ${DEFAULT_MIN_PUBLISH_WORDS} words. Below this the piece is REJECTED by the publisher, not trimmed.
• This story's band is ${min}-${max} words (tier: ${lengthForMode(mode, brief.members.length, brief).tier}). That band comes from how much source material this story actually has, so follow it rather than a generic number.
• Real outlets measure: median 269, mean 348, p75 405. Aim inside this story's band and you will match them.
• To reach that length, USE THE MATERIAL: every named person, place, date, number, figure, quote and consequence in the fact pool below is fair game and expected. Do not pad with scene-setting, restated sentences, or filler transitions.
• If the fact pool genuinely cannot support ${DEFAULT_MIN_PUBLISH_WORDS} words, say so plainly in your summary instead of padding.`;

  // The user's rich-source rule: when enough sources each carry a full article's
  // worth of text, the publisher REJECTS anything shorter. Say so in the prompt so
  // the writer aims high rather than discovering the floor as a rejection.
  const rich = richSourceRule(brief, richSourceThresholds());
  const richLine = rich.rich
    ? `\n• THIS STORY IS WELL SOURCED: ${rich.richSources} sources each carry ${rich.perSourceWords}+ words of article text. The publisher REJECTS this piece below ${rich.requiredWords} words, so write a full article - there is real material to use, not padding.`
    : '';

  // The claim set is the strongest verified material in the brief; surface it
  // before the raw leads so the writer leads with verified specifics.
  const claimBlock = (brief.claims || []).length
    ? `\n## VERIFIED CLAIMS (strongest material — lead with these)\n${(brief.claims || [])
        .slice(0, 10)
        .map((c) => `- [${c.status}] ${c.claim_text}`)
        .join('\n')}\n`
    : '';
  // #19/#32 — article FORMAT template. Overrides the STANDARD news structure
  // (below) when the story is a fact-check or an analysis piece. Each format has
  // its own section order; the claim-level + source rules apply to all.
  const formatBlock = format === 'factcheck'
    ? `## FACT-CHECK FORMAT (proposal #19) — THIS IS A FACT-CHECK PIECE, not a plain news story.
Write it as a VERIFICATION with a clear claim → evidence → verdict arc. Use this structure IN ORDER:
1. Lead — ONE short paragraph naming the claim to be verified (দাবি) and that this piece checks it (the front-matter factCheck block is authoritative: claim + verdict are already determined from the evidence graph — state the claim exactly as given, NEVER restate it as a fact).
2. "## প্রেক্ষাপট" — ONLY if the leads carry background on the claim (where it spread, who made it). Short; omit if absent.
3. "## যাচাই" — the core: walk the EVIDENCE step by step (each check a verified fact from the leads: official record, named agency, multiple independent outlets agreeing). Show the checks as facts: "রিউমার স্ক্যানার/যাচাইয়ে দেখা গেছে…", "বাধ্যবাধকতামূলক রেকর্ড অনুযায়ী…". This section is EVIDENCE, never argument.
4. "## রায়" — the verdict, stated in ONE short paragraph, matching the front-matter factCheck.verdict exactly and in your own words. Say plainly what the evidence showed. Example shape: "সুতরাং দাবিটি বিভ্রান্তিকর — মূল তথ্য সঠিক নয়" (match actual verdict). NEVER contradict the front-matter verdict.
5. "## কী জানা যায়নি" — ONLY genuine verified unknowns. Omit if none.
Rules (HARD): never invent a check; every "যাচাই" assertion must trace to a member lead below; the claim itself is quoted as a claim, not asserted as fact; do NOT switch to a normal news structure (no এক নজরে / মূল খবর).`
    : format === 'analysis'
      ? `## ANALYSIS FORMAT (proposal #32) — THIS IS AN ANALYSIS/OPINION PIECE, not a breaking news story.
Write it as a reasoned examination built ONLY on the verified facts in the leads. Use this structure IN ORDER:
1. Lead — the question/subject this analysis addresses, plainly.
2. "## প্রেক্ষাপট" — the verified background facts (who/what/when/where) needed to follow the argument.
3. "## বিশ্লেষণ" — the analysis: mostly interpretation/explanations. EVERY interpretive claim must be grounded in a member lead OR explicitly flagged as the piece's own reasoning ("কারণ হিসেবে দেখা যাচ্ছে…"); NEVER invent an expert, study, or number that is not in the leads; NEVER attribute analysis to a made-up "বিশ্লেষক"/"পর্যবেক্ষক" (banned); quotes only if they exist verbatim in the leads.
4. "## উপসংহার" — a short conclusion that follows from the evidence above; no new facts, no speculation beyond what the leads support.
Rules (HARD): analysis must stay inside what the evidence supports; no invented consequences; political/sensitive rules apply if the topic is sensitive; do NOT fall back to the one-নজরে/মূল খবর news structure.`
    : '';
  const political = isSensitiveStory(brief)
    ? `## Political / sensitive-topic rules (HARD)
This is a politically or personally sensitive subject. Apply these strictly:
- STATE FACTS, not motives. Never write "উদেশ্য ছিল", "চাওয়া হয়েছিল", "কারণ হল" for actors unless a source explicitly says it. Prefer "X বলেছেন… / পুলিশ জানিয়েছে… / আদালত বলেছে…" (proposal #26).
- NEVER turn an allegation into a fact: "অভিযোগ করেছে" not "অপরাধ করেছে"; "দাবি করেছেন" not "করেছেন"; keep the attribution on every accusation.
- Do not invent public reaction or political consequence ("রাজনৈতিক অঙ্গনে আলোচনা", "জনমনে ক্ষোভ") unless a source states it.
- Keep the person's name + designation, do not editorialize about them.
- Quotes: only exact quotes that exist in the member leads; never "clean up" a quote changing its meaning.
`
    : '';
  const hasEnSource = (brief.members ?? []).some((m) => m.lang === 'en');
  const natBn = `## Natural Bengali (proposal #10 + fine-tuning §4/§5)
- Write like a careful Bangladeshi reporter: plain, direct, professional Bangla. Target: আধুনিক বাংলাদেশি সংবাদমাধ্যমের ভাষা — NOT সাহিত্যিক, NOT textbook, NOT machine-translated.
- VARY sentence length and opening words; do NOT start every sentence the same way or repeat a formula ("জানা গেছে…", "বলেছেন…" max once per two paragraphs).
- Prefer ছোট + সরাসরি + স্বাভাবিক + তথ্যনির্ভর বাক্য। Break overly long sentences. Avoid unnecessary passive/কর্মবাচ্য and ambiguous pronouns.
- Word choice: common, simple Bangla; no repeated same word, no unnecessary English where Bangla exists; technical terms only when standard (সিসিটিভি, মেট্রোরেল).
- No ChatGPT-isms: no "উল্লেখ্য", no "এটি একটি গুরুত্বপূর্ণ বিষয়", no generic opening/closing, no "বিষয়টি নিয়ে…" filler, no formula.
- Before finishing, run internal checks: বাক্য স্বাভাবিকতা (would a Bangladeshi journalist write this?), বানান/ব্যাকরণ/যতিচিহ্ন correct, কর্তা-ক্রিয়া consistent, no translation-like structure.
`
  const translationBlock = hasEnSource
    ? `## AI Translation Detection (§6 — English sources present)
This brief includes English-language sources. After drafting Bengali, self-check: "Does any sentence read as a literal English translation?" If yes, rewrite naturally. Watch for: awkward preposition translation, excessive "যা/যেখানে/যখন" clauses, English-style long sentences, unnecessary passive, unnatural noun stacking.
`
    : '';
  const formattingBlock = `## Naming & Formatting Consistency (§7/§8 — HARD)
- Entity naming: first mention full ("ইরানের প্রেসিডেন্ট মাসউদ পেজেশকিয়ান"), thereafter consistent short form ("পেজেশকিয়ান" OR "ইরানের প্রেসিডেন্ট") — do NOT randomly alternate 4 variants in one article.
- Person/institution/place spelling must be consistent within the article and match sources.
- Dates/numbers/times: use ONE consistent JachaiDesk format throughout: "২৩ সেপ্টেম্বর ২০২৬", "সকাল ১০টা ৩০ মিনিট", "২৫টি উড়োজাহাজ" (Bengali numerals + Bengali month names). NEVER mix "23 September / ২৩ সেপ্টেম্বর / 10:30 AM" in one article.
- Punctuation: Bengali dari "।", proper commas, correct quotation marks; no "।।" or ",,"; headline has no unnecessary punctuation.
`

  return `# Story task — newsdesk-bd

Write ONE original Bengali news article (সংবাদ) about this verified story.

## How to write it (fresh-news voice)
- Write ONE plain, fresh Bangla news story (সংবাদ). Report the NEWS itself — the
  event, the facts, what happened — NOT the sources and NOT what each outlet said.
- The member leads below are ONE fact pool: read them, extract the facts, then
  write the story in your own words as if you were on the scene. NEVER walk through
  the outlets one by one and NEVER compare "one report said X, another said Y".
- ${modeDesc}
- ${lengthStandard}${richLine}
${formatBlock ? `- ${formatBlock}` : ''}
- Five-answer discipline (proposal #2): after drafting, CHECK the article that a
  reader who read the headline learns clear answers to: (1) What happened?
  (2) What do we know? (3) What do we NOT know? (4) Why does it matter? — only
  with a real, stated impact (see why-it-matters rule). (5) Where did this come
  from? — the front-matter sources, never named in the body. Omit an answer only
  when the facts genuinely don't cover it; never fill it with assumption.
- ${whyBlock}
- ${political.trim()}
${natBn}
${translationBlock}${formattingBlock}- If mode is STANDARD AND format is news, body structure (in this order):
  1. Lead paragraph — most important fact up front (who/what/when/where), plain and short.
  2. "এক নজরে" bullet list of DISTINCT key points (1–4 bullets — no filler, no
     repeating the headline; every bullet must name a different fact). Format
     EXACTLY like this (bold label, then bullets, then a blank paragraph before the next block):
     **এক নজরে**
     - point one
     - point two
     - point three
  3. 2–5 short paragraphs telling the story in plain chronology or logic — directly after এক নজরে, with NO heading like "## মূল খবর". Just the paragraphs.
  Do NOT add "## মূল খবর", "## কী জানা গেছে" or "## কী এখনো জানা যায়নি" sections — JachaiDesk keeps only lead + এক নজরে + body paragraphs in standard news.
- If format is factcheck or analysis, follow the ${format === 'factcheck' ? 'FACT-CHECK' : format === 'analysis' ? 'ANALYSIS' : ''} template above INSTEAD of the news structure; the news structure below does NOT apply.
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
- SOURCE DIFFERENCES (proposal #12, HARD): if the member leads genuinely disagree
  on a fact — different figures, opposite claims, contradictory descriptions — the
  article MUST show BOTH sides and say it is not yet settled, e.g. "কোনো কোনো
  হিসাবে ৩ জন, অন্য হিসাবে ৫ জন — সঠিক সংখ্যা এখনো নিশ্চিত নয়" or "এক পক্ষ বলেছে X,
  অপর পক্ষ বলেছে Y"। NEVER silently pick the one you prefer or the one that looks
  "more official". If there is no conflict, say the fact plainly once.

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
- UNCONFIRMED (নিশ্চিত নয়): attribute with doubt in মূল খবর — "এখনো নিশ্চিত নয়", "দাবি, তবে যাচাই হয়নি"। Never state it as fact and never headline it. Do NOT create a separate section for it.
- CONFLICTING (সূত্রে সাংঘর্ষিক তথ্য): NEVER silently choose one side. Say the
  difference explicitly — "কিছু সূত্রে X বলা হয়েছে, অন্যদিকে Y; কোনটি সঠিক তা
  এখনো নিশ্চিত নয়"। The reader must see both claims.

${claims}
## Constraints (hard)
- ORIGINAL synthesis only. Never reprint any one outlet's article. Rewrite in your own words.
- Every factual claim must trace to the member leads below.
- ANTI-REPETITION: never state the same fact more than once. The lead must move
  past the headline (extra detail, second fact), এক নজরে bullets must each name a
  DIFFERENT fact (never a rephrase of the headline), and মূল খবর must not re-state
  the lead. Each sentence must add information the previous one did not have.
- Neutral, plain editorial Bengali. No hype, NO speculation. Never invent reactions — no
  "পর্যবক্ষকরা মনে করছেন…", "আলোচনার জন্ম দেবে বলে মনে করা হচ্ছে…", "বলে মনে করছেন…" —
  unless an outlet explicitly quotes someone saying it.
- No generic background padding. Add context ONLY if it directly explains why the news
  matters AND is present in the leads. Never add background just to lengthen the article.
- If a fact is unknown, say so briefly or omit it.
- Title: an accurate, concise Bengali headline (report headline-news style).
- Excerpt: 1–2 sentence lead summary for cards.
- Aim ${min}–${max} words body for this brief. Length follows claim count: include EVERY verified claim from all sources; do not summarize — synthesize. Stop when the information stops — never pad to reach a word count.
- Do NOT end with a 'সূত্র:' source list — source links are rendered automatically from front matter; never put source URLs in the body, and never write a raw/visible full URL.
- FORBIDDEN — no editorial/disclaimer footnotes anywhere. Never append lines like
  "এই সংবাদটি একাধিক যাচাইকৃত সূত্র থেকে সংশ্লেষিত" or "...এটি সম্পাদকীয় পর্যালোচনার অপেক্ষায় থাকা একটি খসড়া।"
  or any variant announcing the article is a draft/awaiting review. Write it as a finished, published news story.
- Badge/verification comes from the front matter — do not undermine it.

## Facts/sources verified
${brief.headline}

### Claim statuses for this brief (from the claim→evidence graph)
${claims.trim() === '' ? 'none provided' : claims.trim()}

${format === 'factcheck' ? `### Fact-check verdict (front matter — authoritative)
Claim: ${factCheckClaim(brief) ?? '—'}
Verdict: ${factCheckVerdict(brief)}
Note: ${factCheckNote(factCheckVerdict(brief))}
` : ''}
### Member leads (facts pool)
${claimBlock}${leads}

### Sources to cite
${srcs}

Return ONLY the final markdown (front matter included).`;
}

// Finalize: write the draft .md into the site content dir.
export function finalizeStory(slug, bodyMd, { siteDir } = {}) {
  const brief = loadBrief(slug);
  let content = `---\n${frontMatter(brief)}\n---\n\n`;
  const body = stripEditorialFooters(bodyMd);
  const { excerpt, keyPoints, remaining } = prepBody(body);
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
  const lines = md
    .split('\n')
    .map((l) => l.trim().replace(/\*\*/g, ''))
    .filter((l) => l && !/^#{1,4}\s/.test(l));
  return lines.slice(0, 3).join(' ').replace(/"/g, '\\"').slice(0, 180);
}

// 2026-09-24 (D80): strip the "এক নজরে" bullet block into keyPoints FIRST, then
// build the excerpt from the remaining body. Previously the excerpt was taken
// from the raw body BEFORE keyPoints extraction, so a `**এক নজরে**` markdown
// marker leaked into excerpt/seoDescription front matter (seen on live homepage
// cards for national-485/486/488). prepBody is the single ordering authority used
// by finalizeStory, so the excerpt can never contain the stripped block.
export function prepBody(md) {
  const { keyPoints, remaining } = extractKeyPoints(md);
  return { excerpt: extractExcerpt(remaining), keyPoints, remaining };
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