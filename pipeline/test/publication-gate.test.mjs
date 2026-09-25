// test/publication-gate.test.mjs — deterministic fail-closed publication gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../lib/db.mjs';
import {
  PUBLICATION_GATE_VERSION,
  runPublicationGate,
} from '../lib/publication-gate.mjs';

const HEADLINE = 'ঢাকায় মেট্রোরেলের নতুন লাইন চালু';
const NOW = '2026-09-25T12:00:00.000Z';

function fixture() {
  const db = openDb(':memory:');
  db.prepare(`
    INSERT INTO clusters(id,status,first_seen,last_update,member_count,mature_runs,headline)
    VALUES(1,'mature',?,?,2,3,?)
  `).run(NOW, NOW, HEADLINE);

  const members = [
    {
      source_id: 'dailystar',
      title: HEADLINE,
      url: 'https://www.dailystar.net/story/metro-1',
      body: `${HEADLINE}। প্রথম দফায় ১০টি স্টেশনে ট্রেন চলবে। মন্ত্রণালয় বলেছে, ভাড়া পরে ঘোষণা করা হবে।`,
      published_at: NOW,
    },
    {
      source_id: 'bdnews24',
      title: HEADLINE,
      url: 'https://bdnews24.com/story/metro-2',
      body: `${HEADLINE}। প্রথম দফায় ১০টি স্টেশনে ট্রেন চলবে। নিরাপত্তার জন্য স্টেশনে সিসিটিভি থাকবে।`,
      published_at: NOW,
    },
  ];
  for (const member of members) {
    const row = db.prepare(`
      INSERT INTO raw_items(source_id,url,url_hash,title,body,published_at,seen_at)
      VALUES(?,?,?,?,?,?,?)
    `).run(member.source_id, member.url, member.url, member.title, member.body, member.published_at, NOW);
    db.prepare(`
      INSERT INTO cluster_members(cluster_id,item_id,source_id,score,added_at)
      VALUES(1,?,?,1,?)
    `).run(Number(row.lastInsertRowid), member.source_id, NOW);
  }

  db.prepare(`
    INSERT INTO verdicts(cluster_id,tier,score,badge,status,signals_json,evaluated_at)
    VALUES(1,'A',4,'confirmed','passed','[]',?)
  `).run(NOW);
  const claim = db.prepare(`
    INSERT INTO claims(cluster_id,claim_text,status,confidence,created_at,updated_at)
    VALUES(1,?,'VERIFIED',0.8,?,?)
    RETURNING id
  `).get(HEADLINE, NOW, NOW);
  for (const member of members) {
    db.prepare(`
      INSERT INTO claim_evidence(claim_id,source_id,url,excerpt,relation,published_at,created_at)
      VALUES(?,?,?,?,'supports',?,?)
    `).run(Number(claim.id), member.source_id, member.url, member.body, member.published_at, NOW);
  }

  const brief = {
    clusterId: 1,
    slug: 'metro-line',
    status: 'mature',
    headline: HEADLINE,
    category: 'national',
    tier: 'A',
    verdict: { badge: 'confirmed', tier: 'A', score: 4, status: 'passed' },
    members: members.map((member) => ({ ...member, lead: member.body })),
    sources: members.map((member) => ({ name: member.source_id, url: member.url })),
    claims: [{ claim_text: HEADLINE, status: 'VERIFIED', confidence: 80 }],
  };
  const body = `ঢাকায় মেট্রোরেলের নতুন লাইন রবিবার সকালে চালু হয়েছে। প্রথম পর্যায়ে ১০টি স্টেশনে ট্রেন চলবে। মন্ত্রণালয় জানিয়েছে, ভাড়া নির্ধারণের সিদ্ধান্ত পরে জানানো হবে। যাত্রীরা নির্ধারিত সময়ে টিকিট কিনে ট্রেন ব্যবহার করতে পারবেন।

প্রথম ট্রেনটি সকাল সাড়ে আটটায় কামরাঙ্গীরচর স্টেশন থেকে ছেড়ে যায়। প্রাথমিক পর্যায়ে প্রতিটি স্টেশনে যাত্রীদের নিরাপত্তার জন্য সিসিটিভি ক্যামেরা ও লিফটের ব্যবস্থা রাখা হবে। কর্মকর্তারা বলেছেন, পরীক্ষামূলক দৌড়ের পর ট্রেন চালাচল শুরু করা হয়েছে।

প্রথম সপ্তাহে ট্রেন চলবে সকাল ছয়টা থেকে রাত এগারোটা পর্যন্ত। স্টেশনে যাত্রীদের টিকিট, নিরাপত্তা নির্দেশনা ও পরবর্তী ট্রেনের সময়সূচি জানানো হবে। ভাড়া এখনো চূড়ান্ত হয়নি। কর্তৃপক্ষ বলেছে, ভাড়া ঘোষণার পর সেটি কার্যকর হবে।

একই সঙ্গে, নিরাপত্তা ব্যবস্থার অংশ হিসেবে প্রতিটি স্টেশনে জরুরি সেবার নির্দেশনা রাখা হবে। যাত্রীরা সেবার সময় মেট্রোরেলের কর্মকর্তাদের সহায়তা চাইতে পারবেন। নতুন লাইনের পরবর্তী ধাপ কীভাবে চালু হবে, তা এখনো ঘোষণা করা হয়নি।`;
  return { db, brief, body };
}

function run(fx, overrides = {}) {
  return runPublicationGate({
    brief: overrides.brief ?? fx.brief,
    body: overrides.body ?? fx.body,
    database: Object.hasOwn(overrides, 'database') ? overrides.database : fx.db,
    now: NOW,
    trust: overrides.trust ?? null,
    lineage: overrides.lineage ?? null,
  });
}

test('publication gate passes a complete, direct-source snapshot', () => {
  const fx = fixture();
  const result = run(fx);
  assert.equal(result.pass, true, result.failureCodes.join(','));
  assert.deepEqual(result.failureCodes, []);
  assert.deepEqual(result.claimIds, [1]);
  assert.match(result.evidenceHash, /^[a-f0-9]{16}$/);
  assert.equal(result.checkedAt, NOW);
  assert.equal(result.gateVersion, PUBLICATION_GATE_VERSION);
  fx.db.close();
});

test('publication gate fails closed for an immature brief', () => {
  const fx = fixture();
  fx.brief.status = 'open';
  const result = run(fx);
  assert.equal(result.pass, false);
  assert.ok(result.failureCodes.includes('BRIEF_NOT_MATURE'));
  fx.db.close();
});

test('publication gate rejects unresolved Google News wrappers', () => {
  const fx = fixture();
  const wrapper = 'https://news.google.com/rss/articles/wrapped-story';
  fx.brief.members[0].url = wrapper;
  fx.brief.sources[0].url = wrapper;
  const result = run(fx);
  assert.equal(result.pass, false);
  assert.ok(result.failureCodes.includes('GOOGLE_NEWS_WRAPPER_UNRESOLVED'));
  fx.db.close();
});

test('publication gate rejects a failed or tier-ineligible verdict', () => {
  const fx = fixture();
  fx.brief.verdict.status = 'human_check';
  const result = run(fx);
  assert.equal(result.pass, false);
  assert.ok(result.failureCodes.includes('VERDICT_NOT_PASSED'));
  fx.db.close();

  const tiered = fixture();
  tiered.brief.verdict.badge = 'single';
  const tierResult = run(tiered);
  assert.equal(tierResult.pass, false);
  assert.ok(tierResult.failureCodes.includes('VERDICT_MISMATCH'));
  tiered.db.close();
});

test('publication gate rejects missing claim evidence and unknown sources', () => {
  const fx = fixture();
  fx.db.exec("DELETE FROM claim_evidence WHERE claim_id = 1");
  const result = run(fx, {
    trust: { sources: { dailystar: 'top', bdnews24: 'top' } },
    lineage: {},
  });
  assert.equal(result.pass, false);
  assert.ok(result.failureCodes.includes('CLAIM_EVIDENCE_MISSING'));
  fx.db.close();
});

test('publication gate rejects unresolved conflicts', () => {
  const fx = fixture();
  fx.db.prepare(`
    INSERT INTO conflicts(cluster_id,claim_id,conflict_type,resolution,created_at)
    VALUES(1,1,'number','unresolved',?)
  `).run(NOW);
  const result = run(fx);
  assert.equal(result.pass, false);
  assert.ok(result.failureCodes.includes('UNRESOLVED_CONFLICT'));
  fx.db.close();
});

test('publication gate rejects quote and generic-heading failures in the body', () => {
  const fx = fixture();
  const result = run(fx, { body: `${fx.body}\n\n## মূল খবর\nকেউ বলেছেন, "এটি সম্পূর্ণ সত্য।"` });
  assert.equal(result.pass, false);
  assert.ok(result.failureCodes.includes('ARTIFICIAL_GENERIC_HEADING'));
  assert.ok(result.failureCodes.includes('QUOTE_INTEGRITY_FAILED'));
  fx.db.close();
});

test('publication gate rejects frontmatter smuggled into a body', () => {
  const fx = fixture();
  const result = run(fx, { body: `---\ntitle: injected\n---\n${fx.body}` });
  assert.equal(result.pass, false);
  assert.ok(result.failureCodes.includes('INVALID_FRONTMATTER'));
  fx.db.close();
});

test('publication gate rejects hype and unrelated cluster members', () => {
  const fx = fixture();
  fx.brief.headline = 'অবিশ্বাস্য বিস্ফোরণে ঢাকায় নতুন লাইন চালু';
  const result = run(fx);
  assert.equal(result.pass, false);
  assert.ok(result.failureCodes.includes('HEADLINE_HYPE'));

  const unrelated = fixture();
  const row = unrelated.db.prepare(`
    INSERT INTO raw_items(source_id,url,url_hash,title,body,published_at,seen_at)
    VALUES('prothomalo','https://www.prothomalo.com/unrelated','u','অন্য আগস্টের খেলার ফলাফল','তারা জিতেছে।',?,?)
  `).run(NOW, NOW);
  unrelated.db.prepare(`
    INSERT INTO cluster_members(cluster_id,item_id,source_id,score,added_at)
    VALUES(1,?,'prothomalo',1,?)
  `).run(Number(row.lastInsertRowid), NOW);
  unrelated.brief.members.push({ source_id: 'prothomalo', title: 'অন্য আগস্টের খেলার ফলাফল', url: 'https://www.prothomalo.com/unrelated', lead: 'তারা জিতেছে।' });
  unrelated.brief.sources.push({ name: 'prothomalo', url: 'https://www.prothomalo.com/unrelated' });
  const unrelatedResult = run(unrelated);
  assert.equal(unrelatedResult.pass, false);
  assert.ok(unrelatedResult.failureCodes.includes('UNRELATED_CLUSTER_MEMBER'));
  unrelated.db.close();
});

test('publication gate rejects a missing database and malformed brief', () => {
  const fx = fixture();
  const noDb = run(fx, { database: null });
  assert.equal(noDb.pass, false);
  assert.ok(noDb.failureCodes.includes('DATABASE_CONTEXT_MISSING'));
  const malformed = run(fx, { brief: { ...fx.brief, slug: 'Not A Slug' } });
  assert.equal(malformed.pass, false);
  assert.ok(malformed.failureCodes.includes('BRIEF_INVALID'));
  fx.db.close();
});
