// test/evidence-sufficiency.test.mjs — the gate added 2026-09-26.
//
// WHY: the site published a 192-word median body against a 269-word market
// median, and the tempting fix was "tell the writer to write more". Measuring
// first showed the writer is not the constraint:
//
//   median brief members           2
//   median source words per brief  49
//   median article produced       192   (already a 4x expansion)
//
// 407 of 423 briefs carry under 250 words of evidence. So the gate is not
// "write longer", it is "do not start a story the evidence cannot finish".
//
// Real corpus, at the same 1200-char per-source cap the writer receives:
//   >=100 evidence words  70/423 briefs (17%)
//   >=135                 48/423 (11%)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  evidenceSufficiency,
  evidenceWords,
  DEFAULT_MIN_EVIDENCE_WORDS,
} from '../lib/editorial.mjs';

const briefWith = (...leads) => ({ members: leads.map((lead) => ({ title: 'x', lead })) });

// --- the real incident, reproduced ------------------------------------------
// national-378 is a live article whose brief gave the writer 10 words of
// material. It published anyway.
const REAL_THIN = briefWith(
  'প্রধানমন্ত্রীর সঙ্গে বিশ্বব্যাংকের প্রেসিডেন্টের বৈঠক করেছেন',
  'বৈঠকের সময়, স্থান ও আলোচনার বিস্তারিত এখনো প্রকাশিত হয়নি',
);

test('the real thin brief is blocked', () => {
  const r = evidenceSufficiency(REAL_THIN);
  assert.equal(r.pass, false, `expected block, got ${r.evidenceWords} words`);
  assert.ok(r.evidenceWords < 40, 'fixture should be genuinely thin, got ' + r.evidenceWords);
});

test('a brief with no members is blocked, never passed', () => {
  for (const b of [{ members: [] }, {}, { members: null }, null, undefined]) {
    const r = evidenceSufficiency(b);
    assert.equal(r.pass, false, JSON.stringify(b));
    assert.equal(r.evidenceWords, 0);
  }
});

test('a genuinely well-sourced brief passes', () => {
  // Each lead is a realistic single-source excerpt: the pipeline caps a member at
  // 1200 chars, and a real bdnews24/tbs article yields 350-900 words.
  const long = (n) => 'ঢাকা মেট্রোরেলের নতুন লাইন রবিবার সকালে চালু হয়েছে। '.repeat(n);
  const rich = briefWith(long(8), long(7), long(9));
  const r = evidenceSufficiency(rich);
  assert.equal(r.pass, true, `expected pass, got ${r.evidenceWords} words`);
});

test('the default floor is 100 and it is overridable', () => {
  assert.equal(DEFAULT_MIN_EVIDENCE_WORDS, 100);
  assert.equal(evidenceSufficiency(REAL_THIN, { min: 0 }).pass, true, 'min 0 disables the gate');
  assert.equal(evidenceSufficiency(REAL_THIN, { min: 1 }).pass, true, '18 words clears a floor of 1');
  assert.equal(evidenceSufficiency(REAL_THIN, { min: 19 }).pass, false, 'a floor above 18 blocks it');
});

test('a brief with many members but no text is still blocked', () => {
  // Member COUNT is not evidence. A cluster of 9 empty leads proves nothing.
  const r = evidenceSufficiency(briefWith('', '', '', '', '', '', '', '', ''));
  assert.equal(r.pass, false);
  assert.equal(r.members, 9);
  assert.equal(r.evidenceWords, 0);
});

test('duplicate members do not manufacture evidence', () => {
  // The same lead 20 times is one piece of evidence, and the pipeline's real
  // corpus contains exactly this (58,015 evidence rows, 914 distinct).
  const one = briefWith('একটি সংবাদ। এতে কিছু তথ্য রয়েছে। আরও কিছু বিবরণ আছে।');
  const many = briefWith(...Array(20).fill('একটি সংবাদ। এতে কিছু তথ্য রয়েছে। আরও কিছু বিবরণ আছে।'));
  assert.equal(evidenceWords(one), evidenceWords(many), 'repeats must not inflate the count');
  assert.equal(evidenceSufficiency(many).pass, false);
});

test('evidenceWords applies the same 1200-char cap the writer receives', () => {
  const huge = briefWith('আ'.repeat(50000));
  // 1200 chars / 6.5 chars-per-word = 185
  assert.equal(evidenceWords(huge), 185);
  assert.equal(evidenceWords(huge, { cap: 1200 }), 185);
  assert.equal(evidenceWords(huge, { cap: 600 }), 92, 'a smaller cap yields less');
});

test('never crashes on malformed input', () => {
  for (const b of [null, undefined, 0, '', [], { members: 'nope' }, { members: [null, {}] }]) {
    const r = evidenceSufficiency(b);
    assert.equal(typeof r.pass, 'boolean', JSON.stringify(b));
    assert.ok(Number.isFinite(r.evidenceWords));
  }
});

test('is deterministic', () => {
  const a = evidenceSufficiency(REAL_THIN);
  const b = evidenceSufficiency(REAL_THIN);
  assert.deepEqual(a, b);
});

// --- against the real corpus -------------------------------------------------
test('AGAINST THE REAL BRIEFS: the gate bites, but does not stop everything', () => {
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
    const r = evidenceSufficiency(b);
    scores.push({ slug: b.slug, pass: r.pass, words: r.evidenceWords });
  }

  const pass = scores.filter((s) => s.pass).length;
  const pct = (pass / scores.length) * 100;

  // 70/423 = 17% measured. If this ever approaches 100% the gate is inert; if it
  // is 0% the pipeline can never publish again and something is broken.
  assert.ok(pct > 3, `only ${pct.toFixed(1)}% of briefs clear the gate — publishing would stop`);
  assert.ok(pct < 60, `${pct.toFixed(1)}% of briefs clear the gate — the gate is not biting`);

  // Every pass must be justified by real material, never by member count alone.
  for (const s of scores.filter((x) => x.pass)) {
    assert.ok(s.words >= DEFAULT_MIN_EVIDENCE_WORDS, `${s.slug} passed on ${s.words} words`);
  }
});
