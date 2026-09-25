// test/publish-substance.test.mjs — the body-substance floor.
//
// Context (2026-09-25): the finalizer path runs runPublicationGate +
// validatePublicArticle, and NEITHER inspects whether the body is a real article.
// That let 14-26 word headline restatements publish with `badge: confirmed,
// tier: A`. The evidence gates verified the SOURCES; nothing checked the STORY.
//
// rv1 (readerValueCheck) already existed and caught this, but it was only wired
// into audit.mjs, which runs on the parked LLM authoring path. This file locks in
// the restored floor: NO_READER_VALUE + BODY_TOO_THIN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  bodySubstanceCheck,
  bodyWordCount,
  minPublishWords,
  DEFAULT_MIN_PUBLISH_WORDS,
} from '../lib/editorial.mjs';
import { readerValueCheck } from '../lib/editorial.mjs';

const HEADLINE = 'ঢাকায় মেট্রোরেলের নতুন লাইন চালু, ১০টি স্টেশনে ট্রেন চলবে';

// A real body: long, and adds concrete facts the headline does not state.
const GOOD_BODY = `ঢাকা মেট্রোরেলের নতুন লাইন রবিবার সকালে চালু হয়েছে। সকাল সাড়ে আটটায় কামরাঙ্গীরচর স্টেশন থেকে প্রথম ট্রেনটি যাত্রা শুরু করে।

**এক নজরে**
- নতুন লাইন চালু
- ১০টি স্টেশন
- রবিবার থেকে

মন্ত্রণালয় জানিয়েছে, ভাড়া নির্ধারণের কাজ এখনো চলছে। সকাল ৬টা থেকে রাত ১১টা পর্যন্ত ট্রেন চলবে। যাত্রীসহ প্রায় ২ হাজার মানুষ প্রথম দিনেই ভোলেন স্টেশন ব্যবহার করেছেন।

প্রকৌশলীরা জানিয়েছেন, নিরাপত্তার জন্য প্রতিটি কারে ও স্টেশনে সিসিটিভি ক্যামেরা বসানো হয়েছে। পরবর্তী পর্বে দ্বিতীয় ধাপে আরও ১৪টি স্টেশন যুক্ত হবে বলে জানানো হয়েছে।

মেট্রোরেল কর্তৃপক্ষের তথ্য অনুযায়ী, ট্রেনের সর্বোচ্চ গতি ঘণ্টায় ৮০ কিলোমিটার, যা ঢাকার রাস্তার তুলনায় অনেক কম সময়ে যাত্রী পৌঁছে দেবে বলে ধরা হচ্ছে।

প্রথম দিনে স্টেশনগুলোতে যাত্রীর সংখ্যা স্বাভাবিকের চেয়ে বেশি ছিল। কর্মকর্তারা জানিয়েছেন, ভাড়া চূড়ান্ত হওয়ার আগ পর্যন্ত যাত্রীদের টিকিট কিনতে হবে। প্রথম সপ্তাহে ট্রেন চলবে সকাল ছয়টা থেকে রাত এগারোটা পর্যন্ত।

দ্বিতীয় পর্বে আরও ১৪টি স্টেশন যুক্ত করার কাজ শুরু হবে আগামী বছর। নির্মাণ কাজ শেষ হলে ট্রেনের সংখ্যাও বাড়ানোর সিদ্ধান্ত নেওয়া হবে বলে জানিয়েছেন প্রকল্পে জড়িত কর্মকর্তারা।`;

// The exact failure mode seen live on 2026-09-25 (national-551, 14 words).
const STUB_BODY = 'মুসলিম বিয়ে নথিভুক্তির দায়িত্ব এখন সরকারি রেজিস্ট্রারের হাতে। কাজীদের এই ক্ষমতা আর থাকবে না।';

const SHORT_STUB = 'ঢাকায় মেট্রোরেলের নতুন লাইন চালু। ১০টি স্টেশনে ট্রেন চলবে। মন্ত্রণালয় জানিয়েছে, ভাড়া এখনো নির্ধারণ হয়নি।';

// Same thing but genuinely novel (adds ২৪, which the headline lacks) yet still
// far below the floor — this is the BODY_TOO_THIN case.
const SHORT_NOVEL = 'ঢাকায় মেট্রোরেলের নতুন লাইন চালু। ১০টি স্টেশনে ট্রেন চলবে। ২৪ সেপ্টেম্বর সকাল ৬টায় প্রথম ট্রেন ছেড়ে দেয়। ভাড়া এখনো নির্ধারণ করা হয়নি। পরবর্তী ধাপে ১৪টি স্টেশন যুক্ত হবে বলে জানানো হয়েছে। কামরাঙ্গীরচর থেকে যাত্রা শুরু হয়েছে।';

test('bodyWordCount counts Bengali and Latin words, ignoring markdown', () => {
  assert.equal(bodyWordCount('একটি দুই তিন'), 3);
  assert.equal(bodyWordCount('**bold** and `code` [link](/x)'), 5); // bold, and, code, link, /x
  assert.equal(bodyWordCount(''), 0);
  assert.equal(bodyWordCount(null), 0);
});

test('minPublishWords defaults to 150 (market-measured) and is overridable', () => {
  // 150 comes from measuring 51 real articles across Ittefaq, Dhaka Tribune,
  // Deshrupantor, New Age and BDNews24: only 2% fall under 100 words.
  assert.equal(DEFAULT_MIN_PUBLISH_WORDS, 150);
  assert.equal(minPublishWords({}), 150);
  assert.equal(minPublishWords({ PUBLISH_MIN_WORDS: '250' }), 250);
  assert.equal(minPublishWords({ PUBLISH_MIN_WORDS: 'not-a-number' }), 150, 'garbage must fall back to the default');
  assert.equal(minPublishWords({ PUBLISH_MIN_WORDS: '-5' }), 150, 'a negative floor is nonsense; fall back');
});

test('a real article PASSES the substance check', () => {
  const r = bodySubstanceCheck(HEADLINE, GOOD_BODY);
  assert.equal(r.pass, true);
  assert.equal(r.code, null);
  assert.ok(r.bodyWords >= 150, 'fixture should be a genuinely long body, got ' + r.bodyWords);
});

test('the live 14-word stub is BLOCKED as NO_READER_VALUE', () => {
  const r = bodySubstanceCheck('কাজীদের ক্ষমতা শেষ, এবার সরকারি রেজিস্ট্রারের হাতে মুসলিম বিয়ে নথিভুক্তির দায়িত্ব', STUB_BODY);
  assert.equal(r.pass, false);
  assert.equal(r.code, 'NO_READER_VALUE');
  assert.equal(r.bodyWords, 14);
});

test('a short but genuinely novel body is BLOCKED as BODY_TOO_THIN', () => {
  const r = bodySubstanceCheck(HEADLINE, SHORT_NOVEL);
  assert.equal(r.pass, false);
  assert.equal(r.code, 'BODY_TOO_THIN');
  assert.ok(r.bodyWords < 150);
});

test('the two codes are distinguished correctly', () => {
  // novel + long enough -> passes
  assert.equal(bodySubstanceCheck(HEADLINE, GOOD_BODY).code, null);
  // novel but tiny -> thin
  assert.equal(bodySubstanceCheck(HEADLINE, SHORT_NOVEL).code, 'BODY_TOO_THIN');
  // not novel, and tiny -> no reader value (the worse problem, named first)
  assert.equal(bodySubstanceCheck(HEADLINE, SHORT_STUB).code, 'NO_READER_VALUE');
  // the real 14-word live stub, against its OWN headline
  const KAZI = 'কাজীদের ক্ষমতা শেষ, এবার সরকারি রেজিস্ট্রারের হাতে মুসলিম বিয়ে নথিভুক্তির দায়িত্ব';
  assert.equal(bodySubstanceCheck(KAZI, STUB_BODY).code, 'NO_READER_VALUE');
});

test('the floor is configurable downward and upward', () => {
  assert.equal(bodySubstanceCheck(HEADLINE, SHORT_NOVEL, { minWords: 0 }).pass, true, 'minWords 0 disables the thin floor');
  assert.equal(bodySubstanceCheck(HEADLINE, GOOD_BODY, { minWords: 100000 }).code, 'BODY_TOO_THIN');
});

test('an empty body is blocked, not crashed on', () => {
  for (const b of ['', '   ', null, undefined]) {
    const r = bodySubstanceCheck(HEADLINE, b);
    assert.equal(r.pass, false);
  }
});

test('the check never claims a fact is true or false', () => {
  const r = bodySubstanceCheck(HEADLINE, STUB_BODY);
  const blob = JSON.stringify(r).toLowerCase();
  assert.ok(!blob.includes('is true'));
  assert.ok(!blob.includes('is false'));
  assert.ok(!blob.includes('verified') || !blob.includes('false'));
});

// ---- the real archive: the gate must not be a no-op, and must not be a stampede

test('AGAINST THE REAL ARCHIVE: the gate rejects a real, non-trivial slice', () => {
  const dir = join(import.meta.dirname, '../../site/src/content/news');
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return; // archive not present in this checkout; nothing to assert
  }
  if (!files.length) return;

  let rejected = 0;
  let total = 0;
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    const headline = ((text.match(/^title:\s*(.+)$/m) || [])[1] || '').replace(/^['"]|['"]$/g, '').trim();
    const body = (text.split(/^---\s*$/m).slice(2).join(' ') || '').trim();
    if (!headline || !body) continue;
    total++;
    if (!bodySubstanceCheck(headline, body).pass) rejected++;
  }
  assert.ok(total > 100, 'expected a real archive, saw ' + total);
  const pct = (rejected / total) * 100;
  // It must catch something, or the fix is worthless...
  assert.ok(rejected > 0, 'gate rejected nothing across ' + total + ' articles');
  // ...and it must never become a blanket ban, which would take the site offline.
  // NOTE: at the market-measured floor of 150 this rejects ~33% of the LEGACY
  // archive, because most of it is exactly the stub output we are fixing. That is
  // correct, not a regression. The forward-looking rate is what matters, and it is
  // governed by the 1200-char evidence cap and the body backfill, not by this
  // legacy figure. The ceiling here only exists to catch an accidental 100%.
  assert.ok(pct < 60, `gate would reject ${pct.toFixed(1)}% of the archive — that would take publishing offline`);
});

test('AGAINST THE REAL ARCHIVE: recent output is mostly publishable (no stampede)', () => {
  const dir = join(import.meta.dirname, '../../site/src/content/news');
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return;
  }
  if (files.length < 20) return;
  // The last 40 files approximate current bot output.
  const recent = files.slice(-40);
  let ok = 0;
  for (const f of recent) {
    const text = readFileSync(join(dir, f), 'utf8');
    const headline = ((text.match(/^title:\s*(.+)$/m) || [])[1] || '').replace(/^['"]|['"]$/g, '').trim();
    const body = (text.split(/^---\s*$/m).slice(2).join(' ') || '').trim();
    if (!headline || !body) continue;
    if (bodySubstanceCheck(headline, body).pass) ok++;
  }
  const ratio = ok / recent.length;
  assert.ok(ratio > 0.5, `only ${(ratio * 100).toFixed(0)}% of recent output would publish — the floor is too aggressive`);
});

test('readerValueCheck is unchanged — the gate composes it, not replaces it', () => {
  assert.equal(readerValueCheck(HEADLINE, GOOD_BODY).ok, true);
  assert.equal(readerValueCheck(HEADLINE, SHORT_NOVEL).ok, true, 'short but novel: rv1 alone allows it');
  assert.equal(readerValueCheck(HEADLINE, SHORT_STUB).ok, false, 'a pure restatement: rv1 alone rejects it');
});
