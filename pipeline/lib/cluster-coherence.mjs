// lib/cluster-coherence.mjs — is every member of this cluster actually about the
// same event?
//
// WHY (2026-09-25): brief `national-556` had 7 members that were 7 unrelated
// stories (an Asian Games cricket result, a Bangladesh cricket defeat, Ham flood
// deaths, a murder sentencing, Iran at the UN, a bulldozed clinic, and Houthi
// attacks). Its "1,286 words of fact" was 7 different stories mashed together.
// A writer handed that produces incoherent output, and the 150-word body floor
// cannot catch it — the word count is fine, only the content is wrong.
//
// METRIC: min-max similarity.
//   For each member, the best content-word similarity to any OTHER member
//   (overlap / size of the smaller token set). Then take the MINIMUM across
//   members. A cluster is coherent only if EVERY member has at least one
//   partner it genuinely shares content with.
//
// Why not min-pairwise overlap: a 9-outlet cluster of the same fuel-price
// bulletin shares only globally-common words, so IDF-weighted and pairwise
// metrics both score it 0.000 and flag it as incoherent. Requiring every
// member to have *at least one* partner fixes that while still catching a
// genuine intruder, which by definition has no partner.
//
// WHY NOT lib/entities.mjs strongAgree(): it is built for the clustering step
// and requires 2 shared IDF-strong tokens or a near-identical 3+ digit figure.
// On short title+lead input it returns false almost everywhere - it flagged
// 92% of 415 clusters as incoherent, including every known-good case. Measured,
// then rejected.
//
// CALIBRATION (415 multi-member briefs, scored with this metric):
//   <0.08     5     incoherent
//   0.08-0.12 1
//   0.12-0.25 6
//   0.25-0.5 100    coherent
//   >=0.5    303    coherent
// Real incoherent examples score 0.083; real coherent ones score 0.33-0.67.
// 0.20 sits in the empty band between them.

const STOP = new Set(
  `এর ও ওর এবং কে তে না এ হয়েছে জানা দিয়েছে বলে এক আর সে যে করা নিয়ে থেকে জন্য
একটি একটা দুই তিন প্রথম দ্বিতীয় তৃতীয় নতুন পুরোনো সব সকল প্রতি মধ্যে পরে আগে বড় ছোট কম বেশি
দেশ বাংলাদেশ সরকার প্রধানমন্ত্রী মন্ত্রী পুলিশ দিন রাত সকাল বিকেল সন্ধ্যা সময় সাল মাস বছর
অনুযায়ী জানিয়েছেন বলেছেন দাবি করেন শুরু শেষ ঘটনা খবর সংবাদ তথ্য তথ্যে অবস্থান থেকে কাছে দূরে
নির্বাহী কর্মকর্তা কর্মকর্তারা সূত্রে অনুযায়ীকারে সম্পর্কে বিষয়ে ক্ষেত্রে বিষয়টি মধ্যে পাশে
নিয়ে করে করা হয় হবে হয়েছে হচ্ছে রয়েছে থাকবে বলেন বলে জানান জানিয়ে দেখা দিয়েছে`
    .split(/\s+/)
    .filter(Boolean),
);

export const DEFAULT_MIN_MAX_SIMILARITY = 0.2;
export const COHERENCE_FAILURE_CODE = 'CLUSTER_INCOHERENT';

export function coherenceMin(env = process.env) {
  // An unset, empty or whitespace-only value must fall back to the default.
  // `Number('')` is 0, so a bare COHERENCE_MIN= in a workflow file would
  // otherwise silently disable the guard entirely.
  const raw = String(env.COHERENCE_MIN ?? '').trim();
  if (raw === '') return DEFAULT_MIN_MAX_SIMILARITY;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_MIN_MAX_SIMILARITY;
}

/** Content-word tokens: Bangla/Latin words over 2 chars, stopwords removed. */
export function coherenceTokens(text) {
  return String(text ?? '')
    .replace(/[^\u0980-\u09FFA-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Overlap normalised by the SMALLER set, so a short headline is not punished. */
function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / Math.min(a.size, b.size);
}

/**
 * Score a brief's members for coherence.
 * Returns { pass, minMax, meanMax, n, intruders[], minRequired }.
 * A single-member brief is trivially coherent.
 */
export function clusterCoherence(brief, { min = DEFAULT_MIN_MAX_SIMILARITY } = {}) {
  const members = Array.isArray(brief?.members) ? brief.members : [];
  if (members.length < 2) {
    return { pass: true, minMax: 1, meanMax: 1, n: members.length, intruders: [], minRequired: min };
  }
  const sets = members.map((m) => new Set(coherenceTokens(`${m.title ?? ''} ${m.lead ?? ''}`)));

  const best = sets.map((s, i) => {
    let m = 0;
    for (let j = 0; j < sets.length; j++) {
      if (j === i) continue;
      m = Math.max(m, similarity(s, sets[j]));
    }
    return m;
  });

  const minMax = Math.min(...best);
  const meanMax = best.reduce((a, b) => a + b, 0) / best.length;
  const intruders = members
    .map((m, i) => ({ index: i, title: String(m.title ?? '').slice(0, 80), best: best[i] }))
    .filter((x) => x.best < min);

  return { pass: minMax >= min, minMax, meanMax, n: members.length, intruders, minRequired: min };
}
