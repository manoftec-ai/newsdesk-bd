// The deterministic composer is now the only thing that writes article bodies,
// so its guarantees are load-bearing: real source text in, publishable body out,
// and an honest refusal when the evidence cannot carry a story.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  composeBody,
  cleanEvidence,
  bnWordCount,
  asBullet,
  MIN_ARTICLE_WORDS,
} from '../lib/compose.mjs';
import { mechanicalAudit } from '../lib/audit.mjs';
import { lengthForMode, publicationMode, evidenceWordsAvailable } from '../lib/editorial.mjs';

const brief = (over = {}) => ({
  slug: 'test-slug',
  headline: 'ডেঙ্গুতে আরও দুই মৃত্যু, হাসপাতালে ভর্তি ৯৫৫',
  category: 'national',
  date: '2026-09-25T15:14:25.000Z',
  sources: ['prothomalo', 'jugantor'],
  members: [
    {
      source_id: 'prothomalo',
      lead:
        '&lt;p&gt;দেশে ডেঙ্গুতে আক্রান্ত হয়ে আরও দুজনের মৃত্যু হয়েছে। নতুন করে ডেঙ্গু নিয়ে হাসপাতালে ভর্তি হয়েছেন ৯৫৫ জন। ' +
        'এ হিসাব আজ শুক্রবার সকাল আটটা থেকে আগের ২৪ ঘণ্টার। দেশে বর্তমানে হাসপাতালে ভর্তি রোগীর সংখ্যা ১ হাজার ৭০০। ' +
        'গত বছর এই সময়ে এ সংখ্যা ছিল ২ হাজার ১০০। https://example.com/x জানা গেছে যে চিকিৎসকরা রোগীর সংখ্যা বৃদ্ধি নিয়ে উদ্বেগ প্রকাশ করেছেন।' +
        // enough real text to clear the 150-word publish floor, as a live brief has
        ' জানা গেছে যে স্বাস্থ্য অধিদপ্তর সারা দেশে ডেঙ্গু নিয়ন্ত্রণ কার্যক্রম চালিয়ে যাচ্ছে।' +
        ' তিনি জানান বর্তমানে দেশের সব জেলা হাসপাতালে ডেঙ্গু রোগীর জন্য আলাদা বেড সংরক্ষণ করা হয়েছে।' +
        ' চিকিৎসকরা বলছে বর্ষাকালে রোগীর সংখ্যা আরও বাড়তে পারে।' +
        ' স্বাস্থ্য অধিদপ্তরের তথ্য অনুযায়ী গত বছর এই সময়ে দেশে ডেঙ্গুতে মৃত্যুর সংখ্যা ছিল ১৮৬।' +
        ' স্বাস্থ্য বিভাগের একজন কর্মকর্তা বলেন ডেঙ্গু প্রতিরোধে মশা নিয়ন্ত্রণে নগর কর্তৃপক্ষকে আরও সক্রিয় হতে হবে।' +
        ' শহরের বিভিন্ন এলাকায় ফাইগার মশা পরিবেশের ক্ষতিকর উদ্দেশ্যে পরিবেশ বিভাগ ও সিটি কর্পোরেশন যৌথভাবে অভিযান চালাচ্ছে।' +
        ' এদিকে টিকার কার্যক্রম চলছে বলে জানা গেছে।' +
        ' শিশুদের বাড়িতে ভিটামিন বি সমৃদ্ধ খাবার ও পানিযোগের পরামর্শ দিয়েছেন বিশেষজ্ঞরা।' +
        ' স্বাস্থ্য অধিদপ্তর জানিয়েছে, ডেঙ্গুর উপসর্গে আক্রান্ত রোগীদের রক্ত পরীক্ষা করে সরাসরি ফল প্রকাশ করা হচ্ছে।' +
        ' স্বাস্থ্য বিভাগের একজন কর্মকর্তা জানান, ভরী শরীরে ডেঙ্গুর উপসর্গ দেখা দিলে তা রোগ শনাক্ত হিসেবে গণ্য হয়।' +
        ' সেই লক্ষ্যে দেশের প্রতিটি উপজেলা হাসপাতালে পরীক্ষার ব্যবস্থা রাখা হয়েছে এবং জেলা পর্যায়ে ল্যাবরেটরি সক্রিয় রয়েছে।' +
        ' গত বছর একই সময়ে দেশে ডেঙ্গুতে আক্রান্ত হয়েছিলেন প্রায় ৪ লাখ ১০ হাজার মানুষ, যার একটি বড় অংশ ছিল শিশু।' +
        ' চিকিৎসকরা বলছেন, ডেঙ্গুর উপসর্গে জ্বরের সঙ্গে রক্তক্ষরণ বা পেট ফাঁপা দেখা দিলে দেরি না করে হাসপাতালে নিতে হবে।' +
        ' এ নিয়ে স্বাস্থ্য অধিদপ্তর সপ্তাহে দুই দিন দেশব্যাপী অভিযান পরিচালনার কথা জানিয়েছে।',
    },
    {
      source_id: 'jugantor',
      lead: 'ডেঙ্গুতে আরও দুই মৃত্যু, হাসপাতালে ভর্তি ৯৫৫ Jugantor https://jugantor.com/news',
    },
  ],
  ...over,
});

test('cleanEvidence strips HTML entities, tags, URLs and outlet tails', () => {
  const out = cleanEvidence(
    '&lt;p&gt;ককটেল বিস্ফোরণ ঘটনা। &amp; তদন্ত চলছে। https://a.com/x দেখুন। যুগান্তর',
  );
  assert.ok(!out.includes('<p>'), 'html entity decoded out');
  assert.ok(!/https?:/u.test(out), 'url removed');
  assert.ok(!out.includes('যুগান্তর'), 'banned outlet name removed');
  assert.ok(!out.includes('দেখুন'), 'editorial tail removed');
});

test('cleanEvidence converts English months and digits to Bengali', () => {
  const out = cleanEvidence('The meeting on September 25 saw 955 patients arrive at 10 am.');
  assert.ok(!out.includes('September'), 'english month removed');
  assert.ok(!out.includes('955'), 'latin digits removed');
  assert.ok(out.includes('সেপ্টেম্বর'), 'bengali month present');
  assert.ok(out.includes('৯৫৫'), 'bengali digits present');
});

test('composeBody builds a body that passes the real mechanical audit', () => {
  const b = brief();
  const out = composeBody(b);
  assert.ok(out.body.length > 80, 'body written');
  assert.ok(!out.short, 'not short');
  const audit = mechanicalAudit(b, out.body);
  assert.equal(audit.pass, true, `audit failures: ${JSON.stringify(audit.fails)}`);
});

test('composeBody never invents: every sentence traces to a member lead', () => {
  const b = brief();
  const out = composeBody(b);
  const pool = b.members
    .map((m) => cleanEvidence(m.lead))
    .join(' ')
    .replace(/[।?!]/gu, ' ')
    .split(/\s+/u)
    .filter((t) => t.length > 3);
  const body = out.body
    .split(/\n/gu)
    .filter((l) => !/এক\s*নজরে/u.test(l))
    .join(' ')
    .replace(/^\s*-\s*/gmu, ' ')
    .replace(/[*#>•-]/gu, ' ')
    .replace(/[।?!]/gu, ' ')
    .split(/\s+/u)
    .filter((t) => t.length > 3);
  // every body token must exist somewhere in the cleaned source text
  const foreign = body.filter(
    (t) => !pool.includes(t) && !/^[-*#।?!ঃ]+$/u.test(t) && !/^\d+$/u.test(t),
  );
  assert.deepEqual(foreign, [], `tokens not present in any source lead: ${foreign.join(' ')}`);
});

test('composeBody refuses rather than padding a brief with no real text', () => {
  const b = brief({
    headline: 'শুধু শিরোনাম',
    sources: ['x'],
    members: [{ source_id: 'x', lead: 'শুধু শিরোনাম' }],
  });
  const out = composeBody(b);
  assert.equal(out.short, true, 'short brief must be refused');
  assert.ok(bnWordCount(out.body) < MIN_ARTICLE_WORDS, 'body stays under the floor');
});

test('composeBody respects the publish floor, not just its own band', () => {
  // 2026-09-27: a band topping out below the finalizer's substance floor let
  // 104-133 word bodies through the picker and die at BODY_SUBSTANCE_BLOCKED.
  const thin = brief({
    headline: 'ছোট খবর',
    sources: ['a'],
    members: [
      {
        source_id: 'a',
        lead:
          'একটি ছোট খবর। দ্বিতীয় বাক্য। তৃতীয় বাক্য। চতুর্থ বাক্য। পঞ্চম বাক্য। ষষ্ঠ বাক্য। সপ্তম বাক্য।',
      },
    ],
  });
  const band = lengthForMode(publicationMode(thin), (thin.members ?? []).length, thin);
  assert.ok(band.max >= MIN_ARTICLE_WORDS, `band max ${band.max} must clear the floor ${MIN_ARTICLE_WORDS}`);
});

test('the band is a pure function of the brief, so writer and gate cannot disagree', () => {
  // The composer used to record its chosen band on the brief object, which the
  // finalizer never saw because it re-read each brief from disk.
  const b = brief();
  const first = lengthForMode(publicationMode(b), (b.members ?? []).length, b);
  const reloaded = JSON.parse(JSON.stringify(b));
  const second = lengthForMode(publicationMode(reloaded), (reloaded.members ?? []).length, reloaded);
  assert.deepEqual(first, second, 'band must survive a round trip through disk');
  assert.equal(b.lengthBand, undefined, 'no band state is written onto the brief');
});

test('evidenceWordsAvailable measures the real text a brief carries', () => {
  const b = brief();
  const words = evidenceWordsAvailable(b);
  assert.ok(words > 100, `expected >100 evidence words, got ${words}`);
  const empty = { members: [{ lead: '' }] };
  assert.equal(evidenceWordsAvailable(empty), 0);
});

test('evidenceWordsAvailable counts duplicated wire sentences once (2026-09-29)', () => {
  // national-679: 247 raw words set a 180 floor no honest body could reach,
  // because the composer must drop the cross-member overlap (else c14 fires).
  const wire =
    'ঠাকুরগাঁও আসনের উপনির্বাচনে ছয়জন প্রার্থীর মনোনয়নপত্র বৈধ ঘোষণা করা হয়েছে। ' +
    'জেলা নির্বাচন কর্মকর্তা কামরুল ইসলাম আজ মঙ্গলবার যাচাই-বাছাই শেষে এই ঘোষণা দেন। ' +
    'নির্বাচন কমিশন গত ১০ সেপ্টেম্বর এই আসনের উপনির্বাচনের তফসিল ঘোষণা করেছিল।';
  const same = { members: [{ lead: wire }, { lead: wire }] };
  const dup = evidenceWordsAvailable(same);
  const raw = wire.trim().split(/\s+/u).filter(Boolean).length * 2;
  assert.ok(dup < raw, `duplicated wire counted twice: ${dup} vs raw ${raw}`);
  assert.ok(dup > 20, `duplicated wire collapsed to nothing: ${dup}`);
  const distinct = {
    members: [
      { lead: 'পদ্মা সেতু ঘিরে দক্ষিণাঞ্চলে পর্যটন সম্ভাবনা বাড়ছে বলে বিশেষজ্ঞরা মনে করছেন।' },
      { lead: 'বরিশাল বিভাগে নতুন তিনটি অর্থনৈতিক অঞ্চল স্থাপনের সিদ্ধান্ত নিয়েছে সরকার।' },
    ],
  };
  const dd = evidenceWordsAvailable(distinct);
  assert.ok(dd >= 18, `distinct leads undercounted: ${dd}`);
});

test('asBullet never ends inside an open quote (2026-09-29 national-694)', () => {
  const out = asBullet(
    'রাজধানীর আদাবরে বাড়ি দখলের চেষ্টা ও ভাঙচুরের ঘটনায় পুলিশ জানায়: ‘বাসায় থাকিস তোদের দেখে নেব’ বলে হুমকি দিয়ে তারা পালিয়ে যায় এবং পরে অভিযান চালিয়ে গ্রেপ্তার করা হয়',
  );
  const q = (s) => [...s].filter((c) => /[''""«»]/u.test(c)).length;
  assert.equal(q(out) % 2, 0, `unbalanced quotes leaked: ${out}`);
  // 2026-10-02: a bullet is now a WHOLE sentence, never a cut one. The old
  // behaviour amputated at the opening quote ("…জানায়:") and published the
  // half-quote as a focus point. Taking the sentence whole removes the class
  // entirely, so the guarantee is now: whatever comes back is balanced and
  // stands on its own, and a sentence that genuinely cannot is refused.
  assert.ok(out.includes('বাসায়'), 'the whole sentence is kept, quote included');
  assert.ok(out.endsWith('হয়'), 'must not stop mid-sentence: ' + out);
  assert.ok(out.length > 20, 'must stand alone: ' + out);
  // a sentence whose quote is never closed is refused outright rather than
  // published ending inside the quotation
  assert.equal(
    asBullet('রাজধানীর আদাবরে বাড়ি দখলের চেষ্টার অভিযোগে পুলিশ জানায় ‘বাসায় থাকিস তোদের দেখে নেব বলে হুমকি দিয়ে তারা পালিয়ে যায় আর পরে অভিযান চালিয়ে গ্রেপ্তার'),
    '',
    'an unclosed quotation must not become a point',
  );
  // balanced short input passes through. 2026-10-02: a focus point must also
  // be at least 5 words to say anything, so the control is a real short
  // sentence rather than the 3-word placeholder this used.
  assert.ok(asBullet('তিনি আজ সকালে অফিসে ছিলেন।').length > 0);
  assert.equal(asBullet('ছোট বাক্য।'), '', 'a 3-word fragment is not a focus point');
});
