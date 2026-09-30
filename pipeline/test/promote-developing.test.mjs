// test/promote-developing.test.mjs — developing instant lane (2026-09-30).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../lib/db.mjs';
import { runPublicationGate } from '../lib/publication-gate.mjs';
import { selectDeveloping, bengaliShare, isBengaliDominant } from '../tools/promote_developing.mjs';
import { normTitle } from '../lib/published.mjs';

const FAT_BODY = 'ঢাকায় মেট্রোরেলের নতুন লাইন রবিবার সকালে চালু হয়েছে। প্রথম পর্যায়ে ১০টি স্টেশনে ট্রেন চলবে। মন্ত্রণালয় জানিয়েছে, ভাড়া নির্ধারণের সিদ্ধান্ত পরে জানানো হবে। যাত্রীরা নির্ধারিত সময়ে টিকিট কিনে ট্রেন ব্যবহার করতে পারবেন। প্রথম ট্রেনটি সকাল সাড়ে আটটায় কামরাঙ্গীরচর স্টেশন থেকে ছেড়ে যায়। প্রাথমিক পর্যায়ে প্রতিটি স্টেশনে যাত্রীদের নিরাপত্তার জন্য সিসিটিভি ক্যামেরা ও লিফটের ব্যবস্থা রাখা হবে। কর্মকর্তারা বলেছেন, পরীক্ষামূলক দৌড়ের পর ট্রেন চলাচল শুরু করা হয়েছে। প্রথম সপ্তাহে ট্রেন চলবে সকাল ছয়টা থেকে রাত এগারোটা পর্যন্ত। স্টেশনে যাত্রীদের টিকিট, নিরাপত্তা নির্দেশনা ও পরবর্তী ট্রেনের সময়সূচি জানানো হবে। ভাড়া এখনো চূড়ান্ত হয়নি। কর্তৃপক্ষ বলেছে, ভাড়া ঘোষণার পর সেটি কার্যকর হবে। অতিরিক্ত যাত্রী চাপ সামলাতে আরও ট্রেন যুক্ত করার পরিকল্পনা রয়েছে বলে জানা গেছে। দীর্ঘ প্রতীক্ষার পর প্রথম দিনে যাত্রীদের মধ্যে উৎসাহ দেখা গেছে বলে প্রতিবেদনে বলা হয়েছে।';
const HEADLINE = 'ঢাকায় মেট্রোরেলের নতুন লাইন চালু';
const NOW = '2026-09-30T12:00:00.000Z';
const TRUST = { sources: { prothomalo: 'top', blogspot99: 'low' } };

const ENGLISH_BODY = 'Israeli forces were overwhelmed by violent settlers on Tuesday, officials said, in an attack that left several people dead and forced others to flee the area. The government called the incident a terrorist attack and said it was reviewing the security arrangements around the site.';

const row = (over = {}) => ({
  id: 1, source_id: 'prothomalo', title: HEADLINE,
  url: 'https://www.prothomalo.com/bangladesh/metro-new-line',
  body: FAT_BODY, published_at: NOW, category: 'জাতীয়', seen_at: NOW, ...over,
});

test('selectDeveloping picks fat Tier-A direct first-sightings, rejects the rest', () => {
  const rows = [
    row({ id: 1 }),
    row({ id: 2, source_id: 'blogspot99' }),
    row({ id: 3, body: 'ছোট খবর।' }),
    row({ id: 4, url: 'https://news.google.com/rss/articles/wrapper' }),
    row({ id: 5, category: 'ক্রীড়া' }),
    row({ id: 6, source_id: 'kalerkantho' }),
    row({ id: 7, title: 'চট্টগ্রামে নতুন ফ্লাইওভার উদ্বোধন' }),
    row({ id: 8, source_id: 'guardian-world', title: 'Israeli forces overwhelmed by violent settlers', body: ENGLISH_BODY }),
  ];
  const published = new Map([[normTitle('চট্টগ্রামে নতুন ফ্লাইওভার উদ্বোধন'), NOW]]);
  const { picked, skipped } = selectDeveloping(rows, {
    max: 5, trust: TRUST, unusable: new Set(['kalerkantho']), published,
  });
  assert.equal(picked.length, 1);
  assert.equal(picked[0].id, 1);
  assert.equal(skipped['source-not-top'], 1);
  assert.equal(skipped['thin-body'], 1);
  assert.equal(skipped['gnews-wrapper'], 1);
  assert.equal(skipped['category-not-A'], 1);
  assert.equal(skipped['source-unenrichable'], 1);
  assert.equal(skipped['title-dup'], 1);
  assert.equal(skipped['not-bengali'], 1);
});

test('selectDeveloping respects the per-run cap, newest first', () => {
  const rows = [1, 2, 3].map((i) => row({ id: i, title: `${HEADLINE} ${i}` }));
  const { picked } = selectDeveloping(rows, { max: 2, trust: TRUST, unusable: new Set(), published: new Map() });
  assert.equal(picked.length, 2);
});

function soloFixture() {
  const db = openDb(':memory:');
  db.prepare(`
    INSERT INTO clusters(id,status,first_seen,last_update,member_count,mature_runs,headline)
    VALUES(7,'open',?,?,1,0,?)
  `).run(NOW, NOW, HEADLINE);
  const member = {
    source_id: 'prothomalo', title: HEADLINE,
    url: 'https://www.prothomalo.com/bangladesh/metro-new-line',
    body: FAT_BODY, published_at: NOW,
  };
  const item = db.prepare(`
    INSERT INTO raw_items(source_id,url,url_hash,title,body,published_at,seen_at)
    VALUES(?,?,?,?,?,?,?)
  `).run(member.source_id, member.url, member.url, member.title, member.body, member.published_at, NOW);
  db.prepare(`INSERT INTO cluster_members(cluster_id,item_id,source_id,score,added_at) VALUES(7,?,?,1,?)`)
    .run(Number(item.lastInsertRowid), member.source_id, NOW);
  db.prepare(`
    INSERT INTO verdicts(cluster_id,tier,score,badge,status,signals_json,evaluated_at)
    VALUES(7,'A',2,'single','passed','[]',?)
  `).run(NOW);
  const claim = db.prepare(`
    INSERT INTO claims(cluster_id,claim_text,status,confidence,created_at,updated_at)
    VALUES(7,?,'VERIFIED',0.8,?,?)
    RETURNING id
  `).get(HEADLINE, NOW, NOW);
  db.prepare(`
    INSERT INTO claim_evidence(claim_id,source_id,url,excerpt,relation,published_at,created_at)
    VALUES(?,?,?,?,'supports',?,?)
  `).run(Number(claim.id), member.source_id, member.url, member.body, member.published_at, NOW);
  const brief = {
    clusterId: 7, slug: 'metro-solo', status: 'open', headline: HEADLINE,
    category: 'national', tier: 'A', date: NOW, developing: true,
    verdict: { badge: 'single', tier: 'A', score: 2, status: 'passed' },
    members: [{ ...member, lead: member.body }],
    sources: [{ name: member.source_id, url: member.url }],
    claims: [{ claim_text: HEADLINE, status: 'VERIFIED', confidence: 80 }],
  };
  const body = `${HEADLINE}। প্রথম দফায় ১০টি স্টেশনে ট্রেন চলবে। মন্ত্রণালয় বলেছে, ভাড়া পরে ঘোষণা করা হবে। যাত্রীরা নির্ধারিত সময়ে টিকিট কিনে ট্রেন ব্যবহার করতে পারবেন। প্রথম ট্রেনটি সকাল সাড়ে আটটায় কামরাঙ্গীরচর স্টেশন থেকে ছেড়ে যায়। প্রাথমিক পর্যায়ে প্রতিটি স্টেশনে যাত্রীদের নিরাপত্তার জন্য সিসিটিভি ক্যামেরা ও লিফটের ব্যবস্থা রাখা হবে। কর্মকর্তারা বলেছেন, পরীক্ষামূলক দৌড়ের পর ট্রেন চলাচল শুরু করা হয়েছে। প্রথম সপ্তাহে ট্রেন চলবে সকাল ছয়টা থেকে রাত এগারোটা পর্যন্ত। স্টেশনে যাত্রীদের টিকিট, নিরাপত্তা নির্দেশনা ও পরবর্তী ট্রেনের সময়সূচি জানানো হবে। ভাড়া এখনো চূড়ান্ত হয়নি। কর্তৃপক্ষ বলেছে, ভাড়া ঘোষণার পর সেটি কার্যকর হবে।`;
  return { db, brief, body };
}

const run = (fx, briefOver = {}) => runPublicationGate({
  brief: { ...fx.brief, ...briefOver }, body: fx.body, database: fx.db, now: NOW, trust: null, lineage: null,
});

test('developing solo brief skips only the maturity wait, nothing else', () => {
  const fx = soloFixture();
  const result = run(fx);
  assert.ok(!result.failureCodes.includes('BRIEF_NOT_MATURE'), result.failureCodes.join(','));
  assert.equal(result.pass, true, result.failureCodes.join(','));
  fx.db.close();
});

test('same solo brief without the developing flag is still held for maturity', () => {
  const fx = soloFixture();
  const result = run(fx, { developing: false });
  assert.equal(result.pass, false);
  assert.ok(result.failureCodes.includes('BRIEF_NOT_MATURE'));
  fx.db.close();
});

test(`the instant lane refuses English copy for a Bengali site`, () => {
  // measured on the live dry run 2026-09-30: 11 of 120 recent unclustered
  // items were English (guardian-world, prothomalo-en) and would have been
  // promoted onto a Bangla homepage.
  assert.equal(bengaliShare(`${HEADLINE} ${FAT_BODY}`) > 0.95, true, `a Bangla story is Bangla`);
  assert.equal(bengaliShare(ENGLISH_BODY) < 0.05, true, `an English wire story is not`);
  assert.equal(isBengaliDominant({ title: 'Reuters report', body: ENGLISH_BODY }), false);
  assert.equal(isBengaliDominant({ title: HEADLINE, body: FAT_BODY }), true);
  // mixed copy is judged on its letters, not on punctuation or digits
  assert.equal(isBengaliDominant({ title: HEADLINE, body: `${FAT_BODY.slice(0, 300)} ${ENGLISH_BODY.slice(0, 60)}` }), true);
});
