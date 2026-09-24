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
import { readerValueCheck, publicationMode, lengthForMode, repetitionViolations } from './editorial.mjs';
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

// Quoted lines inside an article body — Bengali guillemets / double quotes /
// single-curly quotes, straight quotes too. Multi-line quotes are captured whole.
function extractQuotes(text) {
  const out = [];
  const src = String(text ?? '');
  const re = /[""'']([^""'']{8,400})[""'']/gu;
  for (const m of src.matchAll(re)) {
    if (m[1].trim()) out.push(m[1].trim().normalize('NFC'));
  }
  return out;
}

// A body explicitly showing BOTH sides of a disputed figure/event satisfies the
// #12 disclosure rule (the draft writer prompt tells it to say conflicts).
const DISAGREEMENT_RE =
  /(অন্যদিকে|কিছু\s*সূত্র|কোনটি|প্রকৃত\s*সংখ্যা|সংখ্যা\s*এখনো|মিল\s*নেই|ভিন্ন\s*তথ্য|বিরোধপূর্ণ|দাবি,\s*তবে|নিশ্চিত\s*নয়|সঠিক\s*তথ্য\s*নয়)/u;

// The 10 audit points (encode the writer prompt + locked editorial rules).
export const AUDIT_POINTS = [
  { id: 'c1', en: 'Original synthesis', rule: 'The article is an ORIGINAL merged narrative, not a reprint/copy of any single outlet article.' },
  { id: 'c2', en: 'Traceability', rule: 'Every factual claim (names, numbers, quotes, dates) traces to the member leads; nothing fabricated.' },
  { id: 'c3', en: 'No speculation', rule: 'No speculation, no predictive filler, no invented reactions or "মনে করা হচ্ছে" phrasing.' },
  { id: 'c4', en: 'Neutral tone', rule: 'Plain, neutral editorial Bengali. No hype, clickbait, emotional/labeled language.' },
  { id: 'c5', en: 'Attribution', rule: 'Facts are attributed to ACTORS (পুলিশ/মন্ত্রণালয়), never to media outlet names.' },
  { id: 'c6', en: 'Headline accuracy', rule: 'Title is an accurate, concise summary of the strongest supported claim.' },
  { id: 'c7', en: 'Finished story', rule: 'Reads as a published news story. No "draft/awaiting review/awaiting expert" footnotes or disclaimers.' },
  { id: 'c8', en: 'Structure', rule: 'Lead paragraph first, এক নজরে key points, মূল খবর section in order; কী এখনো জানা যায়নি only if real unknowns.' },
  { id: 'c9', en: 'Length discipline', rule: 'Body length inside the tier target (100–180 / 200–350 / 400–550 words); stops when information stops.' },
  { id: 'c10', en: 'Source hygiene', rule: 'No সূত্র: list, no raw URLs, no media links inside the body — sources render from front matter.' },
];

// The proposal #29/#36 Editorial AI Auditor checklist (12 points) — the LLM
// stage judges against THIS spec list (the mechanical c1..c10+rv1 floor stays
// deterministic and independent). Ordered exactly as the spec enumerates.
export const SPEC_AUDIT_POINTS = [
  { id: 'n1', en: 'Factuality', rule: 'Facts are accurate vs the member leads; no invented name/number/date/event; uncertainty disclosed.' },
  { id: 'n2', en: 'Source support', rule: 'Every factual claim is supported by a member lead; nothing unsupported is asserted as fact.' },
  { id: 'n3', en: 'Claim coverage', rule: 'The strongest supported claim(s) of the cluster are actually covered in the article.' },
  { id: 'n4', en: 'Natural Bengali', rule: 'Natural professional Bangla; no ChatGPT-isms, no transliteration where a Bangla word exists.' },
  { id: 'n5', en: 'No repetition', rule: 'No repetitive paragraphs or repeated ideas; each sentence adds new information.' },
  { id: 'n6', en: 'No speculation', rule: 'No speculation, no invented reaction (পর্যবক্ষকরা মনে করছেন…), no unsupported prediction.' },
  { id: 'n7', en: 'No AI filler', rule: 'No padding ("আরও তথ্য প্রকাশের আশা…", "এ নিয়ে রাজনৈতিক অঙ্গনে…"): every sentence earns its place.' },
  { id: 'n8', en: 'Headline accuracy', rule: 'Headline (and sub/summary/social title) matches the strongest supported claim; no hype/overclaim.' },
  { id: 'n9', en: 'Quote integrity', rule: 'Every quoted line exists exactly in a member lead; paraphrase has no quote marks; no invented quotes.' },
  { id: 'n10', en: 'Context relevance', rule: 'Background/context is only included when it explains THIS event; no generic boilerplate.' },
  { id: 'n11', en: 'Attribution', rule: 'Facts are attributed to real actors (পুলিশ/মন্ত্রণালয়); no media outlet names in the body.' },
  { id: 'n12', en: 'Readability', rule: 'Reads as one clear news story; structure, flowing sentence variety, lengths meeting the tier.' },
];

// ---- Stage 1 — mechanical (deterministic, always runs) --------------------
export function mechanicalAudit(brief, body) {
  const text = String(body ?? '');
  const fails = [];
  const note = (id, msg) => fails.push({ id, ok: false, note: msg });
  const srcCount = (brief.members ?? []).length;
  const mode = publicationMode(brief);
  const { min, max } = lengthForMode(mode, srcCount);

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

  // publication-mode length discipline (Phase-2 #3): the numeric range above
  // already comes from lengthForMode(publicationMode(brief), srcCount), so a
  // verified-but-thin NEWS_BRIEF is allowed to be 50–150 words and is not
  // forced up to the STANDARD tier. The c9 checks below enforce that range.

  // anti-repetition (Phase-2 #4/#5): lead must not merely restate the headline
  // and মূল খবর paragraphs must not re-state the lead; bul points must be
  // distinct. Mechanical overlap probe, zero LLM cost.
  for (const rep of repetitionViolations(brief.headline ?? '', text)) {
    note('rep1', `${rep.type} (${rep.section})`);
  }

  // #12 source disagreement must be SAID, never silently chosen. Any claim the
  // graph marked CONFLICTING forces the body to show both sides. When exactly
  // two statuses disagree on the same quantity we cannot judge from text alone,
  // but a CONFLICTING row is an explicit instruction from the verification layer.
  const conflicting = (brief.claims ?? []).filter((c) => c?.status === 'CONFLICTING');
  if (conflicting.length && !DISAGREEMENT_RE.test(text)) {
    note('n13', `conflicting claim(s) present but body silently picks one side: "${conflicting[0].claim_text.slice(0, 70)}"`);
  }
  // #15 quote integrity — a quoted line in the body must exist verbatim in the
  // member leads (reuse the claim/evidence pool: any evidence excerpt). An exact
  // quote with NO lead match is either invented or paraphrased-with-quote-marks —
  // both FAIL (quote must be exact and proven, paraphrase must not use q-marks).
  const quotePool = (brief.members ?? []).map((m) => `${m.title ?? ''} ${m.lead ?? ''}`)
    .concat((brief.claims ?? []).map((c) => c.claim_text ?? ''))
    .concat((brief.claims ?? []).map((c) => c.quote ?? '').filter(Boolean))
    .join(' ').normalize('NFC');
  const quotes = extractQuotes(text);
  for (const q of quotes) {
    if (!quotePool.includes(q.slice(0, 25))) note('n14', `quote not found in any member lead: "${q.slice(0, 60)}"`);
  }
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

// ---- Stage 2 — LLM 12-point editorial auditor (proposal #29/#36) -----------
export function auditPrompt(brief, body) {
  const points = SPEC_AUDIT_POINTS.map((p) => `  "${p.id}": { "ok": true_or_false, "note": "one short sentence in English, why/why not" } // ${p.en}: ${p.rule}`).join('\n');
  const rules = SPEC_AUDIT_POINTS.map((p, i) => `${i + 1}. ${p.id} ${p.en.toLowerCase()} — ${p.rule}`).join('\n');
  const leads = (brief.members ?? []).map((m) => `- [${m.source_id}] ${m.title}\n  ${m.lead}`).join('\n');
  return `You are the newsdesk-bd AUDITOR, a strict second-stage editor using the JachaiDesk editorial checklist (proposal #29/#36). Judge the writer's draft article against all 12 points. The member leads below are the ONLY allowed fact pool — any claim not traceable to a lead, or any invented name/number/quote, FAILS its point. Reply with ONLY a JSON object, no prose, no markdown fences:

{
  "pass": true_or_false,
  "scores": {
${points}
  }
}

Checklist (audit all 12 rigorously; do NOT rubber-stamp):
${rules}
Delete-sentence rules (a sentence violating ANY of these must be flagged):
- adds no information the reader didn't have
- exists only to reach a word count
- repeats an earlier sentence/idea
- unsupported interpretation
- generic background that doesn't explain this event
- invented reaction or unsupported speculation

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