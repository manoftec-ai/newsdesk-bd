// test/sufficiency.test.mjs — Phase-2 editorial correction: content sufficiency
// gate (verification ≠ publishability), publication modes, mode-aware length,
// and the anti-repetition gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contentSufficiency,
  publicationMode,
  publicationModeOf,
  lengthForMode,
  isDevelopingBrief,
  repetitionViolations,
} from '../lib/editorial.mjs';

// ---- content sufficiency ----------------------------------------------------
test('thin headline-only brief (national-473 pattern) -> news-brief', () => {
  // Google-News header-only items: lead == title, no surplus info
  const brief = {
    headline: 'শান্তিপূর্ণ পারমাণবিক প্রযুক্তি ছাড়বে না ইরান: জাতিসংঘে পেজেশকিয়ান',
    members: [
      { source_id: 'samakal', title: 'শান্তিপূর্ণ পারমাণবিক প্রযুক্তি ছাড়বে না ইরান: জাতিসংঘে পেজেশকিয়ান', lead: 'শান্তিপূর্ণ পারমাণবিক প্রযুক্তি ছাড়বে না ইরান: জাতিসংঘে পেজেশকিয়ান' },
      { source_id: 'kalerkantho', title: 'শান্তিপূর্ণ পারমাণবিক প্রযুক্তি ছাড়বে না ইরান', lead: 'শান্তিপূর্ণ পারমাণবিক প্রযুক্তি ছাড়বে না ইরান' },
    ],
    claims: [],
  };
  const s = contentSufficiency(brief);
  assert.equal(s.richLeads, 0, JSON.stringify(s));
  assert.equal(publicationMode(brief), 'news-brief');
});

test('verified brief with real reporting detail -> standard', () => {
  const brief = {
    headline: 'ঢাকায় মেট্রোরেলের নতুন লাইন চালু',
    members: Array.from({ length: 3 }, () => ({
      source_id: 'x',
      title: 'ঢাকায় মেট্রোরেলের নতুন লাইন চালু',
      lead: 'রবিবার সকাল থেকে ঢাকা মেট্রোরেলের নতুন লাইনে প্রথম দফায় ১০টি স্টেশনে ট্রেন চলাচল শুরু হয়েছে। মন্ত্রণালয় জানায়, ভাড়া চূড়ান্ত হবার আগে পরীক্ষামূলক দৌড় সফলভাবে সম্পন্ন হয়েছে। নির্বাহী প্রকৌশলী জানান, প্রতিটি স্টেশনে সিসিটিভি ও লিফট ব্যবস্থা রাখা হয়েছে।',
    })),
    claims: [{ claim_text: 'প্রথম দফায় ১০টি স্টেশন', status: 'VERIFIED', confidence: 0.95 }],
  };
  assert.equal(publicationMode(brief), 'standard');
});

test('thin leads + verified claim crosses news-brief (2+ facts in pool)', () => {
  // two header-only leads but TWO verified claims: enough for a short standard
  const brief = {
    headline: 'বন্যায় সিলেটে ক্ষতি',
    members: [
      { source_id: 'a', title: 'বন্যায় সিলেটে ক্ষতি', lead: 'বন্যায় সিলেটে ক্ষতি' },
      { source_id: 'b', title: 'বন্যায় সিলেটে ক্ষতি', lead: 'বন্যায় সিলেটে ক্ষতি' },
    ],
    claims: [
      { claim_text: '৩ লাখ মানুষ আশ্রয়কেন্দ্রে এসেছে', status: 'VERIFIED' },
      { claim_text: 'সিলেট-সুনামগঞ্জে নতুন বন্যা', status: 'CORROBORATED' },
    ],
  };
  assert.notEqual(publicationMode(brief), 'news-brief');
});

test('publicationModeOf: only rich leads are rewarded', () => {
  assert.equal(publicationModeOf({ richLeads: 0, factClaims: 0, units: 0 }), 'news-brief');
  assert.equal(publicationModeOf({ richLeads: 1, factClaims: 1, units: 12 }), 'standard');
});

// ---- developing --------------------------------------------------------------
test('recent unfolding story with marker -> developing', () => {
  const brief = {
    headline: 'চট্টগ্রামে অগ্নিকাণ্ড: উদ্ধার কাজ চলমান',
    members: [{
      source_id: 'a',
      title: 'চট্টগ্রামে অগ্নিকাণ্ড',
      lead: 'চট্টগ্রামের নগরীতে অগ্নিকাণ্ডের ঘটনা ঘটেছে। জরুরি উদ্ধার কাজ চলমান। ক্ষয়ক্ষতির পরিমাণ এখনো নির্ধারণ করা যায়নি।',
      published_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    }],
  };
  assert.equal(publicationMode(brief), 'developing');
});

test('old story with marker is NOT developing', () => {
  const brief = {
    headline: 'চট্টগ্রামে অগ্নিকাণ্ড',
    members: [{
      source_id: 'a',
      title: 'চট্টগ্রামে অগ্নিকাণ্ড',
      lead: 'চট্টগ্রামের নগরীতে অগ্নিকাণ্ডের ঘটনা ঘটেছে। জরুরি উদ্ধার কাজ সম্পন্ন হয়েছে।',
      published_at: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
    }],
  };
  assert.equal(isDevelopingBrief(brief), false);
});

// ---- mode-aware length -------------------------------------------------------
test('lengthForMode gives brief band for news-brief, classic bands for standard', () => {
  assert.equal(lengthForMode('news-brief', 0).tier, 'brief');
  assert.equal(lengthForMode('news-brief', 4).max, 150);
  assert.equal(lengthForMode('developing', 2).tier, 'developing');
  assert.deepEqual(lengthForMode('standard', 2), { min: 100, max: 180, tier: 'short' });
});

// ---- anti-repetition gate ----------------------------------------------------
test('lead restating the headline is flagged', () => {
  const headline = 'ঢাকায় মেট্রোরেলের নতুন লাইন চালু';
  const body = `ঢাকায় মেট্রোরেলের নতুন লাইন চালু হয়েছে। মেট্রো লাইনটি চালু হয়ে গেছে।

## মূল খবর
নতুন লাইনটি সকাল থেকে চালু থাকবে। কর্মকর্তারা জানিয়েছেন, ভাড়া পরে নির্ধারণ করা হবে।

**এক নজরে**
- নতুন লাইন চালু
- ভাড়া চূড়ান্ত নয়`;
  const v = repetitionViolations(headline, body);
  assert.ok(v.some((x) => x.type === 'lead-repeats-headline'), JSON.stringify(v));
});

test('long elaborated lead does not trigger lead-repeats-headline', () => {
  const headline = 'ঢাকায় মেট্রোরেলের নতুন লাইন চালু';
  const lead = `রবিবার সকাল থেকে মেট্রোরেলের নতুন লাইনে প্রথম দফায় ১০টি স্টেশনে ট্রেন চলাচল শুরু হয়েছে। মন্ত্রণালয় জানায়, ভাড়া চূড়ান্ত হবার আগে পরীক্ষামূলক দৌড় সফলভাবে সম্পন্ন হয়েছে। নির্বাহী প্রকৌশলী জানান, প্রতিটি স্টেশনে সিসিটিভি ও লিফট ব্যবস্থা রাখা হয়েছে।`;
  const body = `${lead}

**এক নজরে**
- ১০টি স্টেশন চালু
- সিসিটিভি বসানো

## মূল খবর
কামরাঙ্গীরচর স্টেশন থেকে প্রথম ট্রেনটি যাত্রা শুরু করে। প্রতিটি স্টেশনে নিরাপত্তা ব্যবস্থা রাখা হয়েছে। ভাড়ার বিষয়ে সিদ্ধান্ত পরে জানানো হবে।`;
  const v = repetitionViolations(headline, body);
  assert.equal(v.length, 0, JSON.stringify(v));
});

test('duplicate এক নজরে bullets are flagged', () => {
  const body = `ঢাকায় মেট্রোরেলের নতুন লাইনে ১০টি স্টেশনে ট্রেন চলাচল শুরু হয়েছে। রবিবার সকাল থেকে প্রথম দফায় যাত্রী সেবা শুরু হয়েছে।

**এক নজরে**
- ১০টি স্টেশনে ট্রেন চালু
- ট্রেন চালু ১০টি স্টেশনে

## মূল খবর
প্রথম ট্রেনটি কামরাঙ্গীরচর স্টেশন থেকে যাত্রা শুরু করে।`;
  const v = repetitionViolations('ঢাকায় মেট্রোরেল', body);
  assert.ok(v.some((x) => x.type === 'duplicate-bullets'), JSON.stringify(v));
});

test('clean distinct body has no repetition violations', () => {
  const body = `রবিবার সকাল থেকে মেট্রোরেলের নতুন লাইনে প্রথম দফায় ১০টি স্টেশনে ট্রেন চলাচল শুরু হয়েছে। মন্ত্রণালয় জানায়, পরীক্ষামূলক দৌড় সফলভাবে সম্পন্ন হয়েছে।

**এক নজরে**
- ১০টি স্টেশন
- সিসিটিভি ক্যামেরা
- লিফট ও এসকেলেটর

## মূল খবর
কামরাঙ্গীরচর স্টেশন থেকে প্রথম ট্রেনটি যাত্রা শুরু করে। নির্বাহী প্রকৌশলী জানান, প্রতিটি স্টেশনে নিরাপত্তা ব্যবস্থা রাখা হয়েছে। ভাড়ার বিষয়ে সিদ্ধান্ত পরে জানানো হবে। যাত্রীদের জন্য পার্কিং ব্যবস্থা প্রস্তুত করা হচ্ছে।
`;
  const v = repetitionViolations('ঢাকায় মেট্রোরেলের নতুন লাইন চালু', body);
  assert.equal(v.length, 0, JSON.stringify(v));
});