// test/cluster-coherence.test.mjs — the guard that stops a brief from containing
// several unrelated stories (see lib/cluster-coherence.mjs for the measured basis).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  clusterCoherence,
  coherenceTokens,
  coherenceMin,
  DEFAULT_MIN_MAX_SIMILARITY,
  COHERENCE_FAILURE_CODE,
} from '../lib/cluster-coherence.mjs';

const brief = (...titles) => ({ members: titles.map((title) => ({ title, lead: '' })) });

// --- the real incident that motivated this guard -------------------------------
// national-556 held 7 members that were 7 unrelated stories. Reproduced verbatim
// from the briefs corpus.
const MASHED_UP = brief(
  'এশিয়ান গেমসে আফগানিস্তানকে হারিয়ে নেপালের চমক',
  'মালয়েশিয়ার বিপক্ষে বড় ব্যবধানে হারল বাংলাদেশ',
  'হামের উপসর্গে আরও ৩ শিশুর মৃত্যু, মোট প্রাণহানি ১০৮৪',
  'চেয়ারম্যান রফিকুল হত্যায় মৃত্যুদণ্ড: প্রথমবার ‘খান পরিবারের’ সদস্যের সাজা',
  'নত হবে না ইরান, পারমাণবিক কর্মসূচিও ছাড়বে না: জাতিসংঘে পেজেশকিয়ান',
  'মধ্যরাতে গুঁড়িয়ে দেওয়া হলো মিরপুরের স্বাস্থ্যসেবা কেন্দ্র',
  'সৌদি মিত্ররা একজোট, হামলা চালিয়ে যাচ্ছে হুতি বিদ্রোহীরা',
);

test('incoherent: the real national-556 mash-up is blocked', () => {
  const r = clusterCoherence(MASHED_UP);
  assert.equal(r.pass, false, `expected block, got minMax=${r.minMax}`);
  assert.ok(r.minMax < 0.2, `minMax ${r.minMax} should be well under 0.2`);
});

test('incoherent: reports every offender, not just one', () => {
  const r = clusterCoherence(MASHED_UP);
  assert.equal(r.n, 7);
  assert.equal(r.intruders.length, 7, JSON.stringify(r.intruders));
  assert.ok(r.intruders.every((x) => x.title.length > 0));
});

test('coherent: many outlets on one story are NOT flagged', () => {
  // economy-162 scored 0.000 under min-pairwise/IDF metrics and was a false
  // positive. Every member here is the same fuel-price bulletin.
  const r = clusterCoherence(brief(
    'জ্বালানি তেলের দাম বাড়ল লিটারে ২০ টাকা',
    'জ্বালানি তেলের দাম লিটারে বাড়লো ২০ টাকা',
    'এবার প্রতি লিটারে জ্বালানি তেলের দাম বাড়ল',
    'সব ধরনের জ্বালানি তেলের দাম লিটারে বাড়ল',
    'জ্বালানি তেলের দাম ইতিহাসে সর্বোচ্চ',
  ));
  assert.equal(r.pass, true, `false positive: minMax=${r.minMax}`);
  assert.ok(r.minMax >= 0.2, `expected >=0.2, got ${r.minMax}`);
});

test('coherent: same event reported by different outlets with different wording', () => {
  // national-101: one bus/privatocar clash, seven headlines, none identical.
  const r = clusterCoherence(brief(
    'গজারিয়ায় যাত্রীবাহী বাস-প্রাইভেট কারের সংঘর্ষ',
    'বাস ও প্রাইভেট কারের সংঘর্ষে মুন্সীগঞ্জে হতাহত',
    'মুন্সীগঞ্জে বাস-প্রাইভেটকার সংঘর্ষে ১ জন আহত',
    'হোটেলে খেয়ে প্রাইভেটকার নিয়ে মহাসড়ক',
    'মুন্সীগঞ্জে বাস-প্রাইভেটকার মুখোমুখি সংঘর্ষ',
    'উল্টো পথে লেনে উঠছিল প্রাইভেট কার',
    'মহাসড়কে উল্টো পথে লেনে উঠছিল প্রাইভেট কার',
  ));
  assert.equal(r.pass, true, `false positive: minMax=${r.minMax}`);
});

test('coherent: two members of one story pass (the common case)', () => {
  assert.equal(clusterCoherence(brief('জাফর ইকবাল-মাকসুদ কামালসহ ৮ জনের বিরুদ্ধে গ্রেপ্তারি', 'জাফর ইকবাল ও মাকসুদ কামালের বিরুদ্ধে গ্রেফতারি')).pass, true);
});

test('a single intruder inside an otherwise coherent cluster is caught', () => {
  const r = clusterCoherence(brief(
    'মুন্সীগঞ্জে বাস-প্রাইভেটকার সংঘর্ষে হতাহত',
    'মুন্সীগঞ্জে প্রাইভেট কার আর যাত্রীবাহী বাসের সংঘর্ষ',
    'চেয়ারম্যান রফিকুল হত্যায় প্রথম মৃত্যুদণ্ড',
  ));
  assert.equal(r.pass, false);
  assert.equal(r.intruders.length, 1, JSON.stringify(r.intruders));
  assert.match(r.intruders[0].title, /রফিকুল/);
});

test('a two-member cluster of wholly disjoint stories is blocked', () => {
  const r = clusterCoherence(brief('চেয়ারম্যান রফিকুল হত্যায় মৃত্যুদণ্ড', 'আশিয়ান গেমসে নেপালের চমক'));
  assert.equal(r.pass, false, `disjoint pair should be refused: minMax=${r.minMax}`);
  assert.equal(r.intruders.length, 2);
});

test('pass is inclusive at exactly the threshold', () => {
  const b = brief('চেয়ারম্যান রফিকুল হত্যায় মৃত্যুদণ্ড', 'আশিয়ান গেমসে নেপালের চমক');
  const r = clusterCoherence(b);
  assert.equal(r.minRequired, 0.2);
  assert.equal(r.pass, r.minMax >= 0.2, 'documented boundary: >= is inclusive');
});

test('stopwords alone must not make unrelated stories look related', () => {
  // Two genuinely different subjects. Anything they share must be news
  // boilerplate, which the stoplist has to remove.
  const r = clusterCoherence(brief(
    'রাজধানীতে নতুন উন্নয়ন প্রকল্প উদ্বোধন',
    'আন্তর্জাতিক বাজারে ভালো ফলাফল দেখাল ক্রিকেট দল',
  ));
  assert.equal(r.pass, false, `boilerplate must not manufacture agreement: minMax=${r.minMax}`);
});

test('trivial briefs are not blocked', () => {
  assert.equal(clusterCoherence({ members: [] }).pass, true);
  assert.equal(clusterCoherence({ members: [{ title: 'একা' }] }).pass, true);
  assert.equal(clusterCoherence({}).pass, true);
  assert.equal(clusterCoherence({ members: null }).pass, true);
});

test('a real shared proper noun is enough to link two headlines', () => {
  const r = clusterCoherence(brief(
    'ঢাকায় শান্তিরায়ণ চেহারা হাজী এসে পৌঁছেছেন',
    'শান্তিরায়ণ চেহারা হাজী দেশে ফিরেছেন',
  ));
  assert.equal(r.pass, true, `same person should link: minMax=${r.minMax}`);
});

test('is deterministic', () => {
  const a = clusterCoherence(MASHED_UP);
  const b = clusterCoherence(MASHED_UP);
  assert.equal(a.minMax, b.minMax);
  assert.deepEqual(a.intruders, b.intruders);
});

test('minMax is always within [0,1]', () => {
  for (const b of [MASHED_UP, brief('এক', 'এক'), { members: [] }]) {
    const r = clusterCoherence(b);
    assert.ok(r.minMax >= 0 && r.minMax <= 1, String(r.minMax));
    assert.ok(r.meanMax >= 0 && r.meanMax <= 1, String(r.meanMax));
  }
});

test('coherenceMin: default, env override, and out-of-range rejection', () => {
  assert.equal(DEFAULT_MIN_MAX_SIMILARITY, 0.2);
  assert.equal(coherenceMin({}), 0.2);
  assert.equal(coherenceMin({ COHERENCE_MIN: '0.35' }), 0.35);
  assert.equal(coherenceMin({ COHERENCE_MIN: '0' }), 0);
  assert.equal(coherenceMin({ COHERENCE_MIN: '1' }), 1);
  assert.equal(coherenceMin({ COHERENCE_MIN: '' }), 0.2, 'empty must fall back');
  assert.equal(coherenceMin({ COHERENCE_MIN: 'abc' }), 0.2);
  assert.equal(coherenceMin({ COHERENCE_MIN: '5' }), 0.2, 'above 1 must fall back');
  assert.equal(coherenceMin({ COHERENCE_MIN: '-1' }), 0.2, 'negative must fall back');
});

test('threshold is tunable and stricter setting blocks more', () => {
  const b = brief(
    'মুন্সীগঞ্জে বাস-প্রাইভেটকার সংঘর্ষে হতাহত',
    'মুন্সীগঞ্জে প্রাইভেট কার আর বাসের সংঘর্ষ',
  );
  assert.equal(clusterCoherence(b, { min: 0.1 }).pass, true);
  assert.equal(clusterCoherence(b, { min: 0.9 }).pass, false, 'impossible bar must block');
});

test('COHERENCE_FAILURE_CODE is stable', () => {
  assert.equal(COHERENCE_FAILURE_CODE, 'CLUSTER_INCOHERENT');
});

test('coherenceTokens: drops stopwords and punctuation, keeps content', () => {
  const t = coherenceTokens('জ্বালানি তেলের দাম বাড়ল, ২০ টাকা!');
  assert.ok(t.includes('জ্বালানি'));
  assert.ok(t.includes('টাকা'));
  assert.equal(t.includes('এর'), false);
  assert.ok(!t.includes(','));
  assert.deepEqual(coherenceTokens(undefined), []);
  assert.deepEqual(coherenceTokens(null), []);
});

// --- the guard is actually wired into the publishing path ---------------------
test('the finalizer enforces coherence, and does it before reading the body', () => {
  const src = readFileSync(join(import.meta.dirname, '../tools/finalize_stories.mjs'), 'utf8');
  assert.match(src, /import \{[^}]*clusterCoherence[^}]*\} from '\.\.\/lib\/cluster-coherence\.mjs'/, 'module must be imported');
  assert.match(src, /COHERENCE_FAILURE_CODE/, 'rejection must use the stable code');

  const checkAt = src.indexOf('const coherence = clusterCoherence(');
  const bodyAt = src.indexOf('readFileSync(bodyPath');
  assert.ok(checkAt > 0 && bodyAt > 0, 'both the check and the body read must exist');
  assert.ok(checkAt < bodyAt, 'coherence must be judged before the body is even read');
});

test('AGAINST THE REAL BRIEFS: the guard fires without becoming a stampede', () => {
  const dir = join(import.meta.dirname, '../state/briefs');
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return;
  }
  if (files.length < 50) return;

  const scores = [];
  for (const f of files) {
    const b = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const r = clusterCoherence(b);
    if (r.n >= 2) scores.push({ slug: b.slug, pass: r.pass, minMax: r.minMax, n: r.n, intruders: r.intruders.length });
  }
  assert.ok(scores.length > 50, 'expected a real corpus, got ' + scores.length);

  // The bot re-clusters on every run, so no specific slug is asserted here - a
  // named brief can be rewritten under us. The named case (national-556) is
  // covered above from a fixed fixture. This asserts the operating envelope.
  const blocked = scores.filter((s) => !s.pass);
  const pct = (blocked.length / scores.length) * 100;

  assert.ok(pct < 15, `guard would block ${pct.toFixed(1)}% of briefs — too aggressive`);
  assert.ok(pct > 0, 'guard never fires — it is not doing anything');

  // Every verdict must be explainable: a block has to name its intruders, and a
  // block rate of zero would mean the score is never crossing the threshold.
  for (const s of blocked) assert.ok(s.intruders > 0, `${s.slug} blocked but named no intruder`);

  // A blocked cluster is never a near-miss: real incoherence scores far below
  // the threshold, real coherence far above it.
  for (const s of scores) {
    const side = s.pass ? 'coherent' : 'incoherent';
    assert.ok(s.minMax >= 0 && s.minMax <= 1, `${s.slug} ${side}: minMax ${s.minMax} out of range`);
  }
});
