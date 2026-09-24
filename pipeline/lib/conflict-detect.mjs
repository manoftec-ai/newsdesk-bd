// lib/conflict-detect.mjs — STRUCTURED contradiction detection (P0-10).
// Same attestation around the same unit with an irreconcilable gap = CONFLICT.
// All NFC-normalized, pure regex/arithmetic, zero LLM. Deterministic.

export const DEFAULT_MIN_REL = 0.25;

// figure: Bangla or Latin digits (plus thousand separator), optionally followed
// by a Bengala scale/unit word (লাখ/কোটি/হাজার/টাকা/জন/ভর্তি...) — the unit
// stays with the figure so a cluster's "৮৮ লাখ টাকা" vs "৯০ লাখ টাকা" pair
// compares like units and is a genuine conflict instead of derivative noise.
const FIGURE_RE =
  /(?:\b|(?<![অ-হ]))([0-9০-৯][0-9০-৯.,]*)\s*(লাখ|কোটি|হাজার|শত|টাকা|জন|ভর্তি|ডোজ|শতাংশ|দিন|জন|দিনের|মাস|মৃত্যু|হাজারো)/gu;

const DIGIT_MAP = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };

function toLatin(v) {
  return String(v).replace(/[০-৯]/g, (d) => DIGIT_MAP[d]);
}

export function extractAmounts(text) {
  const out = [];
  const src = String(text ?? '').normalize('NFC');
  for (const m of src.matchAll(FIGURE_RE)) {
    const raw = toLatin(m[1]).replace(/,/g, '');
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const unit = m[2] ?? '';
    const scale = { লাখ: 1e5, কোটি: 1e7, হাজার: 1e3, হাজারো: 1e3, শত: 1e2, ডোজ: 1, জন: 1, ভর্তি: 1, টাকা: 1, দিন: 1, দিনের: 1, মাস: 1, মৃত্যু: 1, শতাংশ: 1, জীবনহানি: 1 }[unit] ?? 1;
    out.push({ value, scale, unit });
  }
  return out;
}

// The same quantity-family in two claims — only figures within the SAME unit
// are comparable (লাখ vs কোটি are different denominators). Report the relative
// gap so callers decide thresholds; null when units disagree.
export function quantityGap(a, b) {
  if (!a || !b) return null;
  if (a.unit === 'লাখ' || a.unit === 'কোটি' || a.unit === 'হাজার' || a.unit === 'হাজারো' || a.unit === 'শত') {
    if (a.unit.replace(/ো$/, '') !== b.unit.replace(/ো$/, '')) return null;
  } else if (a.unit !== b.unit) {
    return null;
  }
  const av = a.value * a.scale, bv = b.value * b.scale;
  return Math.abs(av - bv) / Math.max(1, av, bv);
}

// polarity conflict: the same act affirmed in one claim, negated in another.
const NEGATION =
  /(?:করবেন\s*না|করবে\s*না|পারবে\s*না|হবে\s*না|জানিয়েছেন\s*না|জানায়নি|দেয়নি|দিচ্ছে\s*না|নয়|নাই|করেননি|দেয়\s*না|দেন\s*না|সমর্থন\s*করবেন\s*না|সমর্থন\s*দেয়নি)/u;

const AFFIRM_ACTORS = [
  /(সমর্থন|স্বাগত জানিয়ে|স্বীকার|মেনে নিয়েছে)/gu,
];

export function polarityConflict(a, b) {
  const A = String(a ?? '').normalize('NFC');
  const B = String(b ?? '').normalize('NFC');
  // same act grounded in both sides (shared anchor noun), one negated
  for (const re of AFFIRM_ACTORS) {
    const anchorsA = [...A.matchAll(re)].map((m) => m[1]);
    const anchorsB = [...B.matchAll(re)].map((m) => m[1]);
    const shared = anchorsA.filter((x) => B.includes(x));
    if (!shared.length) continue;
    const negA = NEGATION.test(A);
    const negB = NEGATION.test(B);
    if (negA !== negB) {
      return { field: shared[0], values: [A, B] };
    }
  }
  return null;
}

export function findPolarityConflict(a, b) { return polarityConflict(a, b); }
