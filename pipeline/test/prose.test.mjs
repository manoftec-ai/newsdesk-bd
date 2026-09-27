// 2026-07-27. 24 published articles carried the website's own furniture into
// the body: menu rows, "প্রকাশিত :" bylines, "ছবি:" photo credits, related-story
// link farms. Measured: 21 of 59 briefs with a fetched-page lead were affected,
// against 0 of 249 with a plain RSS lead - the cause was a tag-stripping
// extractor in which the furniture simply was not in furniture tags.
//
// lib/prose.mjs is the defence in depth. These tests pin the detectors, because
// a filter that silently stops matching is exactly how 24 bad articles shipped.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  proseProblem,
  hardChrome,
  looksLikeMenuRow,
  isNavList,
  navDensity,
} from '../lib/prose.mjs';
import { sentences, cleanEvidence, composeBody } from '../lib/compose.mjs';

test('hardChrome catches the byline and photo credit that shipped in 24 articles', () => {
  assert.equal(hardChrome('প্রকাশিত : ২৬ সেপ্টেম্বর, ২০২৬, ০৫:৫২ বিকাল'), 'byline');
  assert.equal(hardChrome('ছবি: সংগৃহীত'), 'photo-credit');
  assert.equal(hardChrome('সর্বস্বত্ব সংরক্ষিত'), 'copyright');
  assert.equal(hardChrome('সাবস্ক্রাইব করুন'), 'subscribe');
  assert.equal(hardChrome('আজ সোমবার। দেশে ডেঙ্গুতে আরও দুই মৃত্যু হয়েছে।'), null);
});

test('a menu row is rejected, comma-separated or not', () => {
  // space-separated nav, the shape that actually shipped in national-578
  const navRow =
    'জাতীয় রাজনীতি সারাবিশ্ব জেলার খবর ক্যাম্পাস ঢাকা বিশ্ববিদ্যালয় জগন্নাথ বিশ্ববিদ্যালয় ' +
    'জাহাঙ্গীরনগর বিশ্ববিদ্যালয় রাজশাহী বিশ্ববিদ্যালয় খুলনা বিশ্ববিদ্যালয় বাকৃবি কুমিল্লা বিশ্ববিদ্যালয়';
  assert.equal(proseProblem(navRow), 'nav-list');
  assert.equal(isNavList(navRow), true);

  // the comma-separated form a link farm renders
  const menu =
    'ঢাকা, চট্টগ্রাম, সিলেট, রাজশাহী, খুলনা, বরিশাল, রংপুর, ময়মনসিংহ, কুমিল্লা, কক্সবাজার, নারায়ণগঞ্জ';
  assert.equal(looksLikeMenuRow(menu), true);
  assert.equal(proseProblem(menu), 'menu-row');

  // a real sentence, however long, is not a menu
  const prose =
    'শনিবার সেই অর্থ তার কাছে পৌঁছে দিতে গেলেও রিফাত তা গ্রহণ করেননি, কারণ তিনি বিষয়টি নিয়ে ' +
    'এখনো নিশ্চিত হতে পারেননি এবং পরিচিত স্বার্থীয় ব্যক্তির কাছ থেকে টাকা নেওয়া তাঁর উপযুক্ত নয়।';
  assert.equal(looksLikeMenuRow(prose), false);
  assert.equal(proseProblem(prose), null);
});

test('nav vocabulary density separates a menu from a story', () => {
  const menu = 'খেলা এলাকা শিক্ষা বিজ্ঞান ও প্রযুক্তি ভ্রমণ ফ্যাক্ট চেক কৃষি অর্থ ও বাণিজ্য ধর্ম ও জীবন স্বাস্থ্য ও চিকিৎসা';
  assert.equal(isNavList(menu), true);
  const story =
    'বাংলাদেশ ব্যাংক গত বুধবার দেশে নতুন করে চারটি ডিজিটাল ব্যাংক প্রতিষ্ঠার প্রাথমিক অনুমোদন দিয়েছে। ' +
    'ফলে ডিজিটাল ব্যাংক ধারণাটি নতুন করে সামনে এসেছে এবং একেকটি প্রতিষ্ঠানের ন্যূনতম মূলধন ৩০০ কোটি টাকা।';
  assert.equal(isNavList(story), false);
  assert.ok(navDensity(menu) > navDensity(story), 'menu must score higher');
});

test('a list of institution names is not a sentence, however it is punctuated', () => {
  const list = 'ঢাকা বিশ্ববিদ্যালয়, জগন্নাথ বিশ্ববিদ্যালয়, রাজশাহী বিশ্ববিদ্যালয়।';
  assert.equal(proseProblem(list), 'institution-list');
});

test('sentences() never returns furniture, which is the whole point', () => {
  const page =
    'প্রকাশিত : ২৬ সেপ্টেম্বর, ২০২৬। ছবি: সংগৃহীত। ' +
    'শারীরিক অসুস্থতার কারণে হাসপাতালে চিকিৎসাধীন কবি ও অভিনেতা রিফাত চৌধুরী। ' +
    'জাতীয় রাজনীতি সারাবিশ্ব জেলার খবর ক্যাম্পাস ঢাকা বিশ্ববিদ্যালয় জগন্নাথ বিশ্ববিদ্যালয়।';
  const kept = sentences(cleanEvidence(page));
  const joined = kept.join(' ');
  assert.ok(!joined.includes('প্রকাশিত'), 'byline filtered');
  assert.ok(!joined.includes('ছবি'), 'photo credit filtered');
  assert.ok(!joined.includes('ক্যাম্পাস'), 'menu filtered');
  assert.ok(joined.includes('রিফাত চৌধুরী'), 'the real sentence survives');
});

test('the lead never opens on a dangling back-reference', () => {
  // 2026-07-27: "তবে সেই অর্থ তার কাছে পৌঁছানো হয়নি…" is grammatical, complete,
  // and useless as an opening, because the clause it refers to was truncated
  // away. These stay in the pool - they are fine mid-article - but the lead
  // must not be one of them.
  const brief = {
    headline: 'জায়েদ খানের পাঠানো ১০ হাজার টাকা গ্রহণ করেননি রিফাত চৌধুরী',
    sources: ['a'],
    members: [
      {
        source_id: 'a',
        lead:
          'তবে সেই অর্থ তার কাছে পৌঁছানো হয়নি এবং বিষয়টি নিয়েও তাকে নিশ্চিতভাবে জানানো হয়নি। ' +
          'শারীরিক অসুস্থতার কারণে হাসপাতালে চিকিৎসাধীন কবি ও অভিনেতা রিফাত চৌধুরী, ' +
          'যিনি যুক্তরাষ্ট্র থেকে চিত্রনায়ক জায়েদ খানের পাঠানো ১০ হাজার টাকা গ্রহণ করেননি। ' +
          'গত ১৪ সেপ্টেম্বর ঢাকা মেডিকেল কলেজ হাসপাতালে ভর্তি হন তিনি এবং তাঁর পা ও কোমরে সমস্যা রয়েছে।',
      },
    ],
  };
  const out = composeBody(brief);
  assert.ok(out.body.length > 0, 'a body was composed');
  const lead = out.body.split('\n\n')[0];
  assert.ok(!/^(তবে|অথচ|তাই|ফলে|তাইলে|অর্থাৎ|যদিও|এই|সেই|ওই)/u.test(lead),
    `lead opens on a dangling reference: ${lead.slice(0, 40)}`);
  assert.ok(lead.includes('রিফাত চৌধুরী') || lead.includes('জায়েদ খান'),
    `lead should state the story: ${lead.slice(0, 60)}`);
});
