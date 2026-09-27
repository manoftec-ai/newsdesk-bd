// 2026-07-27. national-532 published with a headline about the DMP criminal gang
// list and a body running to four unrelated stories. Nothing caught it, because
// the coherence guard compares cluster MEMBERS to each other - and both members
// of that brief were the same story, so it passed happily while the lead TEXT
// underneath was the publisher's "আরধু পড়ুন" digest of other headlines.
//
// The missing check was never between members. It is between what the reader was
// promised and what the reader is given.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyHeadlineRelevance } from '../lib/audit.mjs';

test('a body about different stories scores low against its headline', () => {
  const r = bodyHeadlineRelevance(
    "পত্রিকা (২৫শে সেপ্টেম্বর): 'ডিএমপির অপরাধী চক্রের তালিকায় প্রতি ছয়জনে একজন ১৮ বছরের কম বয়সী'",
    'দেশজুড়ে কিশোর গ্যাংয়ের তৎপরতা, স্মার্ট ডিভাইসের প্রতি তাদের আসক্তি। ' +
      'জাতিসংঘ সাধারণ পরিষদের অধিবেশনের ফাঁকে নিউইয়র্কে বাংলাদেশের প্রধানমন্ত্রী তারেক রহমানের সঙ্গে বৈঠক করেছেন। ' +
      'পাবলিক বিশ্ববিদ্যালয়গুলোতে আবাসন সংকট নিয়ে সংবাদ প্রকাশ করা হয়েছে। ' +
      'শর্ত না মানলে ইউজিসি শিক্ষার্থী ভর্তি বন্ধসহ নানা শাস্তিমূলক ব্যবস্থা নিতে পারে।',
  );
  assert.ok(r.coverage < 0.18, `expected a low overlap, got ${r.coverage}`);
  assert.ok(r.headlineTokens >= 4, 'the headline should have real content tokens');
});

test('a body that is about its headline scores high', () => {
  const r = bodyHeadlineRelevance(
    'হামের উপসর্গে আরও ৬ মৃত্যু, মোট মৃত্যু ১,০৬৩',
    'দেশে হামের উপসর্গে আরও ৬ জনের মৃত্যু হয়েছে, মোট মৃত্যু সংখ্যা দাঁড়িয়েছে ১,০৬৩। ' +
      'স্বাস্থ্য অধিদপ্তরের তথ্য অনুযায়ী গত ২৪ ঘণ্টায় হামের উপসর্গ নিয়ে ১ হাজার ১৪৮ জনের মৃত্যু হয়েছে।',
  );
  assert.ok(r.coverage > 0.4, `expected a high overlap, got ${r.coverage}`);
});

test('a short headline is not judged on too few tokens', () => {
  // 2-3 content words cannot support a relevance judgement, and the gate in
  // lib/audit.mjs requires >= 4 for exactly this reason
  const r = bodyHeadlineRelevance('খবর', 'আজ সোমবার দেশে নতুন একটি ঘটনা ঘটেছে।');
  assert.ok(r.headlineTokens < 4, 'a one-word headline must not reach the token floor');
});

test('shared digits and Latin tokens cannot fake agreement', () => {
  // two unrelated stories that both mention 2026 and a number
  const r = bodyHeadlineRelevance(
    'ঢাকায় ২০২৬ সালে নতুন ফ্লাইওভার উদ্বোধন',
    'গত বছর ২০২৫ সালে খেলাধুলায় জাতীয় প্রতিযোগিতায় দেশের খেলোয়াড়রা অংশ নিয়েছিলেন।',
  );
  assert.ok(r.coverage < 0.18, 'numerals alone must not make two stories look related');
});
