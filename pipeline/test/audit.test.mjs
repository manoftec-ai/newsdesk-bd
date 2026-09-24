// test/audit.test.mjs — unit tests for the two-stage auditor (mechanical stage)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mechanicalAudit, parseAudit, auditPrompt, AUDIT_POINTS, SPEC_AUDIT_POINTS } from '../lib/audit.mjs';

const brief = (n, headline) => ({
  headline: headline ?? 'ঢাকায় মেট্রোরেলের নতুন লাইন চালু',
  members: Array.from({ length: n }, (_, i) => ({
    source_id: `s${i}`,
    title: `ঢাকায় মেট্রোরেলের নতুন লাইন চালু`,
    lead: `রবিবার সকাল থেকে ঢাকা মেট্রোরেলের নতুন লাইনে প্রথম দফায় ১০টি স্টেশনে ট্রেন চলাচল শুরু হয়েছে। মন্ত্রণালয় জানায়, ভাড়া চূড়ান্ত হবার আগে পরীক্ষামূলক দৌড় সফলভাবে সম্পন্ন হয়েছে। নির্বাহী প্রকৌশলী জানান, প্রতিটি স্টেশনে সিসিটিভি ও লিফট ব্যবস্থা রাখা হয়েছে।`,
  })),
});

function goodBody() {
  return `ঢাকা মেট্রোরেলের নতুন একটি লাইন রবিবার সকালে চালু হয়েছে। পুলিশ জানিয়েছে, প্রথম দফায় ১০টি স্টেশনে ট্রেন চলবে। যাত্রীরা নির্ধারিত সময় অনুযায়ী টিকিট কেটে মেট্রো ব্যবহার করতে পারবেন।

**এক নজরে**
- নতুন লাইন চালু
- ১০টি স্টেশন
- রবিবার থেকে

## মূল খবর
সকাল সাড়ে আটটায় কামরাঙ্গীরচর স্টেশন থেকে প্রথম ট্রেনটি যাত্রা শুরু করে। মন্ত্রণালয় জানায়, ভাড়া নির্ধারণের বিষয়ে সিদ্ধান্ত পরে জানানো হবে। কর্মকর্তারা জানিয়েছেন, প্রথম সপ্তাহে প্রতিদিন সকাল ছয়টা থেকে রাত এগারোটা পর্যন্ত ট্রেন চলবে।

নির্বাহী প্রকৌশলী জানান, পরীক্ষামূলক দৌড় কয়েক সপ্তাহ আগে সফলভাবে সম্পন্ন হয়েছে। নিরাপত্তার জন্য প্রতিটি স্টেশনে সিসিটিভি ক্যামেরা বসানো হয়েছে। জরুরি পরিস্থিতিতে যাত্রীদের দ্রুত সরিয়ে নেওয়ার ব্যবস্থাও রাখা হয়েছে।

ট্রান্সপোর্ট কর্মীরা বলছেন, নতুন লাইন চালুর ফলে রাজধানীর যানজট কিছুটা কমবে। বাস মালিক সমিতির একাধিক সদস্য জানিয়েছেন, মেট্রোর বেশিরভাগ যাত্রী আগে বাসে যাতায়াত করতেন। তবে বাসের ভাড়ার তুলনায় মেট্রো ভাড়া কত হবে, তা এখনো ঘোষণা হয়নি।

## কী এখনো জানা যায়নি
ভাড়া কত নির্ধারণ হবে এবং দ্বিতীয় ধাপে কোন কোন স্টেশন যুক্ত হবে, তা এখনো নিশ্চিত নয়। কর্তৃপক্ষ বলেছে, পরবর্তী সপ্তাহে বিস্তারিত কর্মপরিকল্পনা ঘোষণা করা হবে। যাত্রীদের জন্য পার্কিং ও রিকশা স্ট্যান্ডের ব্যবস্থা করা হচ্ছে বলেও জানা গেছে। প্রতিটি স্টেশনে লিফট ও এসকেলেটর চালু থাকবে। কর্মকর্তারা বলছেন, সার্বিক নিরাপত্তায় বিশেষ নজর রাখা হবে।`;
}

test('clean body passes mechanical audit (3 sources)', () => {
  const r = mechanicalAudit(brief(3), goodBody());
  assert.equal(r.pass, true, JSON.stringify(r.fails));
});

test('why-it-matters section without evidence blocks (n15)', () => {
  const r = mechanicalAudit(brief(3), goodBody() + '\n\n## কেন গুরুত্বপূর্ণ\nএটি জাতীয় অর্থনীতিতে বড় প্রভাব ফেলবে।');
  assert.ok(r.fails.some((f) => f.id === 'n15'), JSON.stringify(r.fails));
});

test('speculation phrase blocks (c3)', () => {
  const r = mechanicalAudit(brief(3), goodBody() + '\n\nপর্যবক্ষকরা মনে করছেন, ভাড়া বাড়বে।');
  assert.ok(r.fails.some((f) => f.id === 'c3'));
});

test('outlet name in body blocks (c5)', () => {
  const r = mechanicalAudit(brief(3), goodBody() + '\n\nপ্রথম আলো জানিয়েছে, ট্রেন চালু হয়েছে।');
  assert.ok(r.fails.some((f) => f.id === 'c5'));
});

test('raw URL in body blocks (c10)', () => {
  const r = mechanicalAudit(brief(3), goodBody() + '\n\nhttps://example.com/details');
  assert.ok(r.fails.some((f) => f.id === 'c10'));
});

test('editorial/draft footer blocks (c7)', () => {
  const r = mechanicalAudit(brief(3), goodBody() + '\n\nএই সংবাদটি সম্পাদকীয় পর্যালোচনার অপেক্ষায় থাকা একটি খসড়া।');
  assert.ok(r.fails.some((f) => f.id === 'c7'));
});

test('missing one নজরে blocks for 3+ sources (c8)', () => {
  const b = goodBody().replace(/\*\*এক নজরে\*\*[\s\S]*?## মূল খবর/g, '## মূল খবর');
  const r = mechanicalAudit(brief(3), b);
  assert.ok(r.fails.some((f) => f.id === 'c8'));
});

test('short body blocks (c9)', () => {
  const r = mechanicalAudit(brief(4), 'ছোট লেখা।');
  assert.ok(r.fails.some((f) => f.id === 'c9'));
});

test('2-source brief does not demand একটি নজরে', () => {
  const b = goodBody().replace(/\*\*এক নজরে\*\*[\s\S]*?## মূল খবর/g, '## মূল খবর');
  const r = mechanicalAudit(brief(2), b);
  assert.equal(r.pass, true, JSON.stringify(r.fails));
});

test('parseAudit tolerates code fences + prose', () => {
  const a = parseAudit('Here you go:\n```json\n{"pass": false, "scores": {"c2": {"ok": false, "note": "invented quote"}, "c1": {"ok": true, "note": "ok"}}}\n```\nthanks');
  assert.equal(a.pass, false);
  assert.equal(a.scores.c2.ok, false);
  assert.equal(a.scores.c1.ok, true);
});

test('AUDIT_POINTS is exactly 10 points c1..c10', () => {
  assert.equal(AUDIT_POINTS.length, 10);
  assert.deepEqual(AUDIT_POINTS.map((p) => p.id), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']);
});

test('SPEC_AUDIT_POINTS is the 12-point proposal checklist n1..n12', () => {
  assert.equal(SPEC_AUDIT_POINTS.length, 12);
  assert.deepEqual(
    SPEC_AUDIT_POINTS.map((p) => p.id),
    ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'n11', 'n12'],
  );
  const en = SPEC_AUDIT_POINTS.map((p) => p.en.toLowerCase()).join(',');
  for (const k of ['factuality', 'source support', 'claim coverage', 'natural bengali', 'repetition', 'speculation', 'fill', 'headline', 'quote integrity', 'context relevance', 'attribution', 'readability']) {
    assert.ok(en.includes(k), `missing ${k}`);
  }
});

test('auditPrompt uses the spec checklist + delete-sentence rules', () => {
  const p = auditPrompt(brief(3), goodBody());
  assert.match(p, /checklist \(proposal #29\/#36\)/);
  assert.match(p, /"n1":/);
  assert.match(p, /"n12":/);
  assert.match(p, /Delete-sentence rules/);
  assert.match(p, /adds no information/);
});

test('headline restatement with no new facts blocks reader value (rv1)', () => {
  const headline = 'ঢাকায় মেট্রোরেলের নতুন লাইন চালু';
  const body = 'ঢাকায় নতুন একটি মেট্রো লাইন চালু হয়েছে। মেট্রো লাইনটি চালু হয়ে গেছে। নতুন লাইনটি খুলে দেওয়া হয়েছে। তখন থেকে যাত্রীরা এটি ব্যবহার করতে পারবেন।';
  const r = mechanicalAudit(brief(3, headline), body);
  assert.ok(r.fails.some((f) => f.id === 'rv1'), JSON.stringify(r.fails));
});

test('good body passes reader value (rv1 not triggered)', () => {
  const r = mechanicalAudit(brief(3), goodBody());
  assert.equal(r.pass, true, JSON.stringify(r.fails));
});

test('#12 disclosure — CONFLICTING claim with silent single side blocks (n13)', () => {
  const b = { ...brief(3), claims: [{ claim_text: 'সংখ্যা ২০০, অন্য সূত্রে ৫০০', status: 'CONFLICTING', confidence: 0.9 }] };
  const silentBody = `ঢাকা মেট্রোরেলের নতুন একটি লাইন চালু হয়েছে। পুলিশ জানিয়েছে, এতে ২০০ জন যাত্রী সেবা পাবেন।

**এক নজরে**
- নতুন লাইন চালু
- ২০০ জন যাত্রী

## মূল খবর
সকাল সাড়ে আটটায় প্রথম ট্রেনটি যাত্রা শুরু করে। মন্ত্রণালয় জানায়, ২০০ জন যাত্রীর জন্য এ ব্যবস্থা। কর্মকর্তারা জানিয়েছেন, প্রথম সপ্তাহে প্রতিদিন ট্রেন চলবে।`;
  const r = mechanicalAudit(b, silentBody);
  assert.ok(r.fails.some((f) => f.id === 'n13'), JSON.stringify(r.fails.map((f) => f.id)));
});

test('#12 disclosure — body showing both sides passes (n13 not triggered)', () => {
  const b = { ...brief(3), claims: [{ claim_text: 'সংখ্যা ২০০, অন্য সূত্রে ৫০০', status: 'CONFLICTING', confidence: 0.9 }] };
  const body = goodBody() + '\n\nকিছু সূত্রে ৫০০ জন বলা হয়েছে, অন্যদিকে আবার ২০০ জনের কথাও জানা গেছে; কোনটি সঠিক তা এখনো নিশ্চিত নয়।';
  const r = mechanicalAudit(b, body);
  assert.ok(!r.fails.some((f) => f.id === 'n13'), JSON.stringify(r.fails.map((f) => f.id)));
});

test('#15 quote integrity — quote absent from leads blocks (n14)', () => {
  const r = mechanicalAudit(brief(3), goodBody() + '\n\nপুলিশ বলেছেন, "আমরা এটি পুরোপুরি ভেঙে ফেলেছি সম্পূর্ণ।"');
  assert.ok(r.fails.some((f) => f.id === 'n14'), JSON.stringify(r.fails));
});

test('#15 quote integrity — verbatim quote from a lead passes (n14 not triggered)', () => {
  const b = brief(3);
  const quote = 'প্রথম দফায় ১০টি স্টেশনে ট্রেন চলবে';
  b.members[0] = { ...b.members[0], lead: `${b.members[0].lead} ${quote}` };
  const r = mechanicalAudit(b, goodBody() + `\n\nপুলিশ বলেছেন, "${quote}।"`);
  assert.equal(r.pass, true, JSON.stringify(r.fails));
});