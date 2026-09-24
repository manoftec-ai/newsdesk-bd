// test/synth.test.mjs — unit tests for synth helpers
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferTags, claimRules, writingPrompt, factCheckBlock, prepBody } from '../lib/synth.mjs';

test('inferTags emits only defined tags from real keywords', () => {
  const brief = {
    headline: 'চট্টগ্রামে ডেঙ্গু রোগী বাড়ছে, হাসপাতালে ভর্তির চাপ',
    members: [{ title: 'প্রথম আলো প্রতিবেদন', lead: 'ঢাকাসহ সারা দেশে স্বাস্থ্য ঝুঁকি' }],
  };
  const tags = inferTags(brief);
  assert.ok(tags.includes('health'));
  assert.ok(tags.includes('chattogram'));
  assert.ok(tags.includes('dhaka'));
  assert.ok(!tags.includes('cricket'));
});

test('inferTags recognizes fact-check keywords', () => {
  const brief = {
    headline: 'গুজব ছড়ানোর অভিযোগে গ্রেপ্তার',
    members: [{ title: 'দৈনিক সংবাদ', lead: '‘ভুয়া’ খবর ছড়ানোর অভিযোগ' }],
  };
  const tags = inferTags(brief);
  assert.ok(tags.includes('gujob'));
});

test('inferTags emits nothing when no keyword appears', () => {
  assert.deepEqual(inferTags({ headline: 'নির্দিষ্ট কোনো ম্যাপিং ছাড়া দাবি', members: [] }), []);
});

test('claimRules: each status maps to a write-guidance line', () => {
  const brief = {
    claims: [
      { claim_text: 'দুজন মারা গেছেন', status: 'VERIFIED' },
      { claim_text: '১০টি স্টেশন', status: 'CORROBORATED' },
      { claim_text: 'ভ্যাকসিন দেওয়া হয়েছে', status: 'SINGLE_SOURCE' },
      { claim_text: 'আরও একটি হামলা', status: 'CONFLICTING' },
      { claim_text: 'নতুন তারিখ', status: 'UNCONFIRMED' },
      { claim_text: 'সরকারি সিদ্ধান্ত', status: 'OFFICIAL' },
    ],
  };
  const r = claimRules(brief);
  assert.match(r, /VERIFIED: দুজন মারা গেছেন — verified fact/);
  assert.match(r, /single-source — never present as established fact/);
  assert.match(r, /UNCONFIRMED/);
  assert.match(r, /NEVER silently pick one side/);
  assert.match(r, /OFFICIAL/);
});

test('claimRules: empty when brief has no claims', () => {
  assert.equal(claimRules({}), '');
});

test('writingPrompt includes claim-level rules for known statuses', () => {
  const brief = {
    headline: 'ঢাকায় ডেঙ্গু রোগী বাড়ছে',
    sources: [{ name: 'প্রথম আলো', url: 'https://example.com/a' }],
    tier: 'B',
    verdict: { badge: 'confirmed', tier: 'B' },
    members: [{ source_id: 'pal', title: 'ডেঙ্গু', lead: 'রোগী বাড়ছে', published_at: '2026-09-24' }],
    claims: [{ claim_text: '১০ হাজার রোগী হাসপাতালে', status: 'CONFLICTING' }],
  };
  const p = writingPrompt(brief);
  assert.match(p, /Claim-level writing rules/);
  assert.match(p, /CONFLICTING: ১০ হাজার রোগী হাসপাতালে/);
});

test('writingPrompt: news story has no fact-check template', () => {
  const p = writingPrompt({
    headline: 'ঢাকায় নতুন মেট্রো লাইন',
    category: 'national',
    sources: [{ name: 'প্রথম আলো', url: 'https://example.com/a' }],
    members: [{ source_id: 'pal', title: 'মেট্রো', lead: 'চালু হলো', published_at: '2026-09-24' }],
  });
  assert.doesNotMatch(p, /FACT-CHECK FORMAT/);
  assert.doesNotMatch(p, /ANALYSIS FORMAT/);
  assert.match(p, /PUBLICATION MODE:/u);
});

test('writingPrompt: factcheck story gets the claim->evidence->verdict template + verdict context', () => {
  const brief = {
    headline: 'সত্যতা যাচাই: ভাইরাল দাবি',
    category: 'factcheck',
    sources: [{ name: 'রিউমার স্ক্যানার', url: 'https://rumorscanner.example.com/x' }],
    members: [{ source_id: 'scanner', title: 'রিউমার স্ক্যানার', lead: 'দাবিটি যাচাই করে দেখা গেছে বিভ্রান্তিকর', published_at: '2026-09-24' }],
    claims: [{ claim_text: 'ভাইরাল দাবি', status: 'VERIFIED' }, { claim_text: 'বাকি অংশ', status: 'UNCONFIRMED' }],
  };
  const p = writingPrompt(brief);
  assert.match(p, /FACT-CHECK FORMAT/);
  assert.match(p, /## রায়/);
  assert.match(p, /Fact-check verdict/);
  assert.match(p, /Verdict: unverifiable/);
});

test('writingPrompt: analysis story gets analysis template', () => {
  const p = writingPrompt({
    headline: 'মেট্রো সম্প্রসারণের অর্থনৈতিক প্রভাব',
    category: 'opinion',
    sources: [{ name: 'সমকাল', url: 'https://example.com/a' }],
    members: [{ source_id: 'samakal', title: 'বিশ্লেষণ', lead: 'কারণ হিসেবে দেখা যাচ্ছে', published_at: '2026-09-24' }],
  });
  assert.match(p, /ANALYSIS FORMAT/);
  assert.match(p, /## উপসংহার/);
});

test('factCheckBlock: emitted only for factcheck format, honest verdict', () => {
  const brief = {
    headline: 'সত্যতা যাচাই: ভাইরাল ভিডিও',
    category: 'factcheck',
    date: '2026-09-24T10:00:00.000Z',
    sources: [],
    members: [{ source_id: 'scanner', title: 'রিউমার স্ক্যানার', lead: 'দাবি', published_at: '2026-09-24' }],
    claims: [{ claim_text: 'ভিডিওটির দাবি', status: 'VERIFIED' }],
  };
  const block = factCheckBlock(brief);
  assert.match(block, /^factCheck:/);
  assert.match(block, /claim: "ভিডিওটির দাবি"/);
  assert.match(block, /verdict: "true"/);
  assert.doesNotMatch(block, /keyPoints/);
});

test('factCheckBlock: empty for plain news story', () => {
  assert.equal(factCheckBlock({
    headline: 'ঢাকায় বৃষ্টি',
    category: 'national',
    members: [{ source_id: 'pal', title: 'x', lead: 'y' }],
  }), '');
});

test('prepBody: excerpt stripped of এক নজরে block and markdown markers', () => {
  const body = `ঢাকায় নতুন মেট্রো লাইন চালু হয়েছে। খরচ হয়েছে নির্ধারিত বাজেটের মধ্যেই।

**এক নজরে**
- স্টেশন ১০টি
- খরচ ৫০০ কোটি টাকা

## মূল খবর

বাস ও রিকশার উপরে ভর করে যাতায়াত করা ঢাকাবাসীর জন্য নতুন এই পথ যুক্ত হয়েছে।
`;
  const { excerpt, keyPoints, remaining } = prepBody(body);
  assert.equal(keyPoints.length, 2);
  assert.deepEqual(keyPoints, ['স্টেশন ১০টি', 'খরচ ৫০০ কোটি টাকা']);
  assert.match(remaining, /## মূল খবর/);
  assert.doesNotMatch(remaining, /এক\s*নজরে/);
  assert.ok(excerpt.length > 0);
  assert.ok(excerpt.startsWith('ঢাকায়'));
  assert.doesNotMatch(excerpt, /\*\*/);
  assert.doesNotMatch(excerpt, /এক\s*নজরে/);
  assert.doesNotMatch(excerpt, /## /);
});