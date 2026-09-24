// lib/audit.mjs — AI AUDITOR (P0 stage: two-stage Writer→Auditor).
//
// Stage 1 (mechanical, deterministic, zero-cost): applies the project's LOCKED
// editorial rules (speculation ban, editorial-footer ban, outlet-name ban,
// source-list/URL ban, target-length discipline) purely with regex — no LLM.
//
// Stage 2 (LLM, only if LLM_API_KEY is available): a second pass judges the same
// article on 10 points (accuracy vs leads, neutrality, originality, ...) and
// returns PASS/FAIL with per-point notes.
//
// On FAIL the writer is RE-RUN with the auditor's notes appended to its prompt,
// up to MAX_AUDIT_RETRIES (bounded; default 2). Only PASSING articles are
// finalized (= published). If no LLM key, stage 2 is skipped and the mechanical
// gate alone decides (backward compatible with existing author path).
import { writingPrompt, findEditorialViolations, BANNED_SPECULATION, isEditorialFooter } from './synth.mjs';
import { readerValueCheck } from './editorial.mjs';
import { chatComplete, llmApiKey } from './llm.mjs';
import { verifyHeadline } from './headline-verify.mjs';

export const MAX_AUDIT_RETRIES = Number(process.env.AUDIT_MAX_RETRIES || 2);

// Known outlet display names (from config/sources.yaml) — never allowed in body.
export const BANNED_OUTLET_NAMES = [
  'প্রথম আলো', 'দৈনিক ইত্তেফাক', 'কালের কণ্ঠ', 'যুগান্তর', 'সমকাল',
  'দৈনিক বাংলা', 'ঢাকা ট্রিবিউন', 'ডেইলি স্টার', 'বাংলা ট্রিবিউন',
  'বিডিনিউজ২৪', 'দ্য ইন্ডিপেন্ডেন্ট', 'দেশ রূপান্তর', 'জামুনা টিভি',
  'এটিএন বাংলা', 'চ্যানেল আই', 'দ্য বিজনেস স্ট্যান্ডার্ড', 'বিবিসি বাংলা',
  'ভিওএ বাংলা', 'দ্য ডেইলি অবজারভার', 'বিডি২৪লাইভ', 'দৈনিক আজাদী',
  'দ্য গার্ডিয়ান', 'রয়টার্স', 'এপি', 'এএফপি', 'ইউএনবি',
];

// Raw http(s) URLs appearing inside the body (forbidden — sources render from fm).
const RAW_URL_RE = /https?:\/\/\S+/u;

// The 10 audit points (encode the writer prompt + locked editorial rules).
export const AUDIT_POINTS = [
  { id: 'c1', en: 'Original synthesis', rule: 'The article is an ORIGINAL merged narrative, not a reprint/copy of any single outlet article.' },
  { id: 'c2', en: 'Traceability', rule: 'Every factual claim (names, numbers, quotes, dates) traces to the member leads; nothing fabricated.' },
  { id: 'c3', en: 'No speculation', rule: 'No speculation, no predictive filler, no invented reactions or "মনে করা হচ্ছে" phrasing.' },
  { id: 'c4', en: 'Neutral tone', rule: 'Plain, neutral editorial Bengali. No hype, clickbait, emotional/labeled language.' },
  { id: 'c5', en: 'Attribution', rule: 'Facts are attributed to ACTORS (পুলিশ/মন্ত্রণালয়), never to media outlet names.' },
  { id: 'c6', en: 'Headline accuracy', rule: 'Title is an accurate, concise summary of the strongest supported claim.' },
  { id: 'c7', en: 'Finished story', rule: 'Reads as a published news story. No "draft/awaiting review/awaiting expert" footnotes or disclaimers.' },
  { id: 'c8', en: 'Structure', rule: 'Lead paragraph first, এক নজরে key points, কী ঘটেছে section in order; যা এখনো জানা যায়নি only if real unknowns.' },
  { id: 'c9', en: 'Length discipline', rule: 'Body length inside the tier target (100–180 / 200–350 / 400–550 words); stops when information stops.' },
  { id: 'c10', en: 'Source hygiene', rule: 'No সূত্র: list, no raw URLs, no media links inside the body — sources render from front matter.' },
];

// ---- Stage 1 — mechanical (deterministic, always runs) --------------------
export function mechanicalAudit(brief, body) {
  const text = String(body ?? '');
  const fails = [];
  const note = (id, msg) => fails.push({ id, ok: false, note: msg });
  const srcCount = (brief.members ?? []).length;
  const { min, max } = targetLength(srcCount);

  for (const v of findEditorialViolations(text)) {
    note('c3', `speculation/filler "${v.match}"`);
  }
  for (const name of BANNED_OUTLET_NAMES) {
    if (text.includes(name)) note('c5', `outlet name "${name}" in body`);
  }
  const m = text.match(RAW_URL_RE);
  if (m) note('c10', `raw URL in body: ${m[0]}`);
  if (/সূত্র[:：]/u.test(text)) note('c10', 'সূত্র: list in body');
  // editorial footer (draft/awaiting-review disclaimers)
  const blocks = text.trim().split(/\n\s*\n/);
  for (let i = 0; i < blocks.length; i++) {
    if (isEditorialFooter(blocks[i])) note('c7', 'editorial/draft footer');
  }
  const bnWords = text.replace(/[A-Za-z0-9]/g, ' ').trim().split(/\s+/u).filter(Boolean).length;
  if (bnWords < min - 20) note('c9', `too short (~${bnWords} words, min ${min})`);
  if (bnWords > max + 40) note('c9', `too long (~${bnWords} words, max ${max})`);
  const hasLeadPara = text.split(/\n\s*\n/).some((p) => !p.startsWith('#') && !p.startsWith('*') && p.trim().length > 40);
  if (!hasLeadPara) note('c8', 'no plain lead paragraph up front');
  const hasKP = /এক\s*নজরে/u.test(text);
  if (srcCount > 2 && !hasKP) note('c8', 'এক নজরে key points missing (≥3 sources)');
  // headline verification (deterministic c6 checking): headline must trace to the
  // fact pool and never overclaim a conflicting/unconfirmed claim.
  const hdr = verifyHeadline(brief.headline ?? '', {
    leads: (brief.members ?? []).map((m) => `${m.title ?? ''} ${m.lead ?? ''}`),
    claim: (brief.claims ?? [])[0] ?? null,
  });
  if (hdr.status === 'poor') note('c6', `headline barely traces to facts (${Math.round(hdr.support * 100)}% tokens)`);
  if (hdr.status === 'overclaim') note('c6', `headline overclaims an ${hdr.claim_status} claim`);
  if (hdr.flags.includes('hype')) note('c6', `headline hype term detected`);
  // #21 — reader-value check (critique): the article must add a concrete fact
  // beyond the headline, or the reader who read the headline learns nothing new.
  const rv = readerValueCheck(brief.headline ?? '', text);
  if (!rv.ok) note('rv1', `no reader value: body adds no concrete fact beyond headline (${rv.bodyWords}/${rv.headWords} words)`);

  return { pass: fails.length === 0, fails, count: fails.length, headline: hdr };
}

function targetLength(srcCount) {
  if (srcCount <= 2) return { min: 100, max: 180 };
  if (srcCount === 3) return { min: 200, max: 350 };
  return { min: 400, max: 550 };
}

// ---- Stage 2 — LLM 10-point audit -----------------------------------------
export function auditPrompt(brief, body) {
  const points = AUDIT_POINTS.map((p) => `  "${p.id}": { "ok": true_or_false, "note": "one short sentence in English, why/why not" } // ${p.en}: ${p.rule}`).join('\n');
  const leads = (brief.members ?? []).map((m) => `- [${m.source_id}] ${m.title}\n  ${m.lead}`).join('\n');
  return `You are the newsdesk-bd AUDITOR, a strict second-stage editor. Judge the writer's draft article against the 10 rules. The member leads below are the ONLY allowed fact pool — any claim not traceable to a lead, or any invented name/number/quote, FAILS c2. Reply with ONLY a JSON object, no prose, no markdown fences:

{
  "pass": true_or_false,
  "scores": {
${points}
  }
}

Rules (audit all 10 rigorously; do NOT rubber-stamp):
1. c1 originality — is this a genuine merged synthesis, not a near-copy of any lead?
2. c2 traceability — every factual claim traces to a lead; nothing invented.
3. c3 no speculation — any "মনে করা হচ্ছে / মনে করছেন / আশা করা হচ্ছে" or invented reaction FAILS.
4. c4 neutral tone — hype, clickbait, emotional adjectives FAIL.
5. c5 attribution — media outlet names in the body FAIL; actor attribution (পুলিশ/মন্ত্রণালয়) required.
6. c6 headline accuracy — title must match the strongest supported claim without exaggeration.
7. c7 finished story — draft/editorial-review/awaiting disclaimers FAIL.
8. c8 structure — lead up front; এক নজরে (if ≥3 sources); কী ঘটেছে present; যা এখনো জানা যায়নি only if real unknowns.
9. c9 length discipline — within 100–180 / 200–350 / 400–550 words by source count; no padding.
10. c10 source hygiene — সূত্র list, raw URLs, or media links in the body FAIL.

# Article to audit
"""${String(body).slice(0, 6000)}"""

# Member leads (fact pool)
${leads}

# Headline
${brief.headline ?? ''}`;
}

// Tolerant JSON extraction from an LLM answer (strip code fences, find braces).
export function parseAudit(raw) {
  const text = String(raw ?? '').replace(/```[a-z]*/gi, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const j = JSON.parse(text.slice(start, end + 1));
    const scores = j?.scores ?? j?.checks ?? null;
    const ok = (s) => Boolean(s && (s.ok === true || s.pass === true || s.ok === 'true'));
    const normalized = {};
    if (scores && typeof scores === 'object') {
      for (const [k, v] of Object.entries(scores)) {
        if (typeof v === 'object' && v !== null) normalized[k] = { ok: ok(v), note: String(v.note ?? '').slice(0, 160) };
      }
    }
    return { pass: Boolean(j?.pass === true || Object.keys(normalized).every((k) => normalized[k].ok)), scores: normalized };
  } catch {
    return null;
  }
}

// Run BOTH stages. Always returns { pass, mechanical, llm, retries }.
export async function auditArticle(brief, body, { key } = {}) {
  const mechanical = mechanicalAudit(brief, body);
  const needsLLM = mechanical.pass; // mechanical gate is a hard floor
  let llm = null;
  if (needsLLM) {
    const apiKey = key ?? (await llmApiKey());
    if (apiKey) {
      const raw = await chatComplete(
        [{ role: 'system', content: 'You are the strict newsdesk-bd auditor. Reply in JSON only.' },
         { role: 'user', content: auditPrompt(brief, body) }],
        { key: apiKey },
      );
      llm = parseAudit(raw) ?? { pass: false, scores: {} };
    }
  }
  const retries = 0;
  return { pass: mechanical.pass && (llm ? llm.pass : true), mechanical, llm, retries };
}

function notesFrom(llm) {
  if (!llm?.scores) return [];
  return Object.entries(llm.scores)
    .filter(([, v]) => !v?.ok)
    .map(([id, v]) => `${id}: ${v?.note ?? 'fix required'}`)
    .slice(0, 10);
}

// Two-stage writer→auditor with bounded retries. Regenerates the article with
// the auditor's notes appended to the writer prompt until pass or MAX_AUDIT_RETRIES.
export async function writeThenAudit(brief, { key } = {}) {
  const apiKey = key ?? (await llmApiKey());
  let body = null;
  let result = { pass: false, mechanical: { fails: [{ id: 'start', note: '' }] }, llm: null, retries: 0 };
  for (let attempt = 0; attempt <= MAX_AUDIT_RETRIES; attempt++) {
    let prompt = writingPrompt(brief);
    if (attempt > 0 && result.llm) {
      const notes = notesFrom(result.llm);
      if (notes.length) prompt += `\n\n## Auditor feedback (fix ALL of these, then resubmit)\n${notes.join('\n')}`;
    }
    if (attempt > 0 && result.mechanical?.fails?.length) {
      prompt += `\n\n## Mechanical gate refused (fix these too)\n${result.mechanical.fails.map((f) => `- ${f.id}: ${f.note}`).join('\n')}`;
    }
    const out = await chatComplete(
      [{ role: 'system', content: 'You are the newsdesk-bd staff writer. Follow the task exactly.' },
       { role: 'user', content: prompt }],
      { key: apiKey },
    );
    if (!out || !String(out).trim()) throw new Error('empty writer completion');
    body = String(out);
    result = await auditArticle(brief, body, { key: apiKey });
    if (result.pass) {
      result.retries = attempt;
      return { pass: true, body, result };
    }
  }
  return { pass: false, body, result };
}