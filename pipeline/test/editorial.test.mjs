// test/editorial.test.mjs — unit tests for the deterministic editorial module
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorialValue, readerValueCheck, concreteTokens } from '../lib/editorial.mjs';

test('concreteTokens picks digits, quantity and day words', () => {
  const s = 'রবিবার সোমবার ঢাকায় ১০টি স্টেশন এবং ৩২৫ টাকা ভাড়া।';
  const t = concreteTokens(s);
  assert.equal([...t].some((x) => x.startsWith('১০')), true, JSON.stringify([...t]));
  assert.equal(t.has('৩২৫'), true, JSON.stringify([...t]));
  assert.equal(t.has('টাকা'), true, JSON.stringify([...t]));
  assert.equal(t.has('সোমবার'), true, JSON.stringify([...t]));
});

test('body adding a new number passes reader value', () => {
  const headline = 'ঢাকায় নতুন মেট্রো লাইন চালু';
  const body = 'মেট্রোরেলের নতুন লাইনে প্রতিদিন ১২০টি ট্রেন চলবে। রবিবার থেকে যাত্রীরা ব্যবহার করতে পারবেন। ২৫০ টাকা ভাড়া নির্ধারণ করা হয়েছে।';
  const r = readerValueCheck(headline, body);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.novel.some((t) => t.startsWith('১২০')), JSON.stringify(r.novel));
  assert.ok(r.novel.includes('২৫০'), JSON.stringify(r.novel));
  assert.ok(r.novel.includes('রবিবার'), JSON.stringify(r.novel));
});

test('pure headline restatement fails reader value', () => {
  const headline = 'ঢাকায় নতুন মেট্রো লাইন চালু';
  const body = 'ঢাকায় নতুন মেট্রো লাইন চালু হয়েছে। মেট্রো লাইনটি চালু হয়ে গেছে। নতুন লাইনটি যাত্রীদের জন্য খুলে দেওয়া হয়েছে।';
  const r = readerValueCheck(headline, body);
  assert.equal(r.ok, false, JSON.stringify(r));
});

test('long elaborated body passes even if it repeats headline facts', () => {
  const headline = 'ঢাকায় মেট্রো লাইন চালু';
  const body = `ঢাকায় মেট্রো লাইন চালু হয়েছে। সকাল ছয়টায় প্রথম ট্রেনটি যাত্রা শুরু করে। প্রতিটি স্টেশনে সিসিটিভি ক্যামেরা বসানো হয়েছে। জরুরি পরিস্থিতিতে যাত্রীদের দ্রুত সরিয়ে নেওয়ার ব্যবস্থা রাখা হয়েছে। নির্বাহী প্রকৌশলী জানান, পরীক্ষামূলক দৌড় সফলভাবে সম্পন্ন হয়েছে। ট্রেনটি প্রতিদিন সকাল ছয়টা থেকে রাত এগারোটা পর্যন্ত চলবে। বাসের ভাড়ার তুলনায় মেট্রো ভাড়া কত হবে, তা এখনো ঘোষণা হয়নি। স্টেশনে লিফট ও এসকেলেটর চালু থাকবে এবং কর্মকর্তারা বলছেন, সার্বিক নিরাপত্তায় বিশেষ নজর রাখা হবে।`;
  const r = readerValueCheck(headline, body);
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('editorialValue is deterministic and scores rich briefs higher', () => {
  const impactBrief = {
    headline: 'বন্যার কারণে সিলেটে ১০ লাখ মানুষ ক্ষতিগ্রস্ত',
    members: [
      { source_id: 'a', title: 'বন্যা', lead: 'ফেনীতে বন্যা পরিস্থিতি ভয়াবহ' },
      { source_id: 'b', title: 'বন্যা', lead: 'জরুরি ত্রাণ পাঠানো হয়েছে' },
      { source_id: 'c', title: 'বন্যা', lead: 'রাস্তাঘাট তলিয়ে গেছে' },
      { source_id: 'd', title: 'বন্যা', lead: 'হাসপাতালে রোগীর চাপ বেড়েছে' },
    ],
  };
  const trivialBrief = {
    headline: 'একটি বই প্রকাশ',
    members: [{ source_id: 'a', title: 'বই', lead: 'একটি নতুন বই প্রকাশিত হয়েছে' }],
  };
  const a = editorialValue(impactBrief);
  const b = editorialValue(trivialBrief);
  assert.ok(a.score > b.score, `expected ${a.score} > ${b.score}`);
  assert.ok(a.score >= 0 && a.score <= 100);
  assert.equal(typeof a.signals.impact, 'number');
});

test('editorialValue is pure (same input -> same score)', () => {
  const brief = { headline: 'ঢাকায় আগুন, ৩ জন নিহত', members: [{ source_id: 'a', title: 'x', lead: 'ফায়ার সার্ভিস কাজ করছে' }] };
  assert.equal(editorialValue(brief).score, editorialValue(brief).score);
});