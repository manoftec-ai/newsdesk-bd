// test/finalizer.test.mjs — exact-pick and publication-gate integration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import YAML from 'yaml';
import { openDb } from '../lib/db.mjs';
import { finalizeStories } from '../tools/finalize_stories.mjs';

const HEADLINE = 'ঢাকায় মেট্রোরেলের নতুন লাইন চালু';
const NOW = '2026-09-25T12:00:00.000Z';
const BODY = `ঢাকায় মেট্রোরেলের নতুন লাইন রবিবার সকালে চালু হয়েছে। প্রথম পর্যায়ে ১০টি স্টেশনে ট্রেন চলবে। মন্ত্রণালয় জানিয়েছে, ভাড়া নির্ধারণের সিদ্ধান্ত পরে জানানো হবে। যাত্রীরা নির্ধারিত সময়ে টিকিট কিনে ট্রেন ব্যবহার করতে পারবেন।

প্রথম ট্রেনটি সকাল সাড়ে আটটায় কামরাঙ্গীরচর স্টেশন থেকে ছেড়ে যায়। প্রাথমিক পর্যায়ে প্রতিটি স্টেশনে যাত্রীদের নিরাপত্তার জন্য সিসিটিভি ক্যামেরা ও লিফটের ব্যবস্থা রাখা হবে। কর্মকর্তারা বলেছেন, পরীক্ষামূলক দৌড়ের পর ট্রেন চালাচল শুরু করা হয়েছে।

প্রথম সপ্তাহে ট্রেন চলবে সকাল ছয়টা থেকে রাত এগারোটা পর্যন্ত। স্টেশনে যাত্রীদের টিকিট, নিরাপত্তা নির্দেশনা ও পরবর্তী ট্রেনের সময়সূচি জানানো হবে। ভাড়া এখনো চূড়ান্ত হয়নি। কর্তৃপক্ষ বলেছে, ভাড়া ঘোষণার পর সেটি কার্যকর হবে।

একই সঙ্গে, নিরাপত্তা ব্যবস্থার অংশ হিসেবে প্রতিটি স্টেশনে জরুরি সেবার নির্দেশনা রাখা হবে। যাত্রীরা সেবার সময় মেট্রোরেলের কর্মকর্তাদের সহায়তা নিতে পারবেন। নতুন লাইনের পরবর্তী ধাপ কীভাবে চালু হবে, তা এখনো ঘোষণা করা হয়নি।`;

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'jachai-finalizer-'));
  const briefsDir = join(root, 'briefs');
  const bodiesDir = join(root, 'bodies');
  const siteDir = join(root, 'site');
  const dbPath = join(root, 'state.db');
  const pickPath = join(root, 'pick.json');
  const rejectionsPath = join(root, 'rejections.json');
  mkdirSync(briefsDir, { recursive: true });
  mkdirSync(bodiesDir, { recursive: true });
  mkdirSync(siteDir, { recursive: true });

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
  const db = openDb(dbPath);
  db.prepare(`
    INSERT INTO clusters(id,status,first_seen,last_update,member_count,mature_runs,headline)
    VALUES(1,'mature',?,?,2,3,?)
  `).run(NOW, NOW, HEADLINE);
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
  db.close();

  const brief = {
    clusterId: 1,
    slug: 'metro-test',
    status: 'mature',
    date: NOW,
    headline: HEADLINE,
    category: 'national',
    tier: 'A',
    verdict: { badge: 'confirmed', tier: 'A', score: 4, status: 'passed' },
    members: members.map((member) => ({ ...member, lead: member.body })),
    sources: members.map((member) => ({ name: member.source_id, url: member.url })),
    claims: [{ claim_text: HEADLINE, status: 'VERIFIED', confidence: 80 }],
  };
  writeFileSync(join(briefsDir, 'metro-test.json'), JSON.stringify(brief));
  writeFileSync(join(bodiesDir, 'metro-test.b.md'), BODY);
  writeFileSync(pickPath, JSON.stringify({ picked: [{ slug: 'metro-test' }] }));
  return { root, briefsDir, bodiesDir, siteDir, dbPath, pickPath, rejectionsPath, brief };
}

function runFixture(fixture) {
  return finalizeStories({
    ...fixture,
    now: NOW,
  });
}

test('finalizer writes only the picked story with gate metadata', () => {
  const fixture = makeFixture();
  try {
    const result = runFixture(fixture);
    assert.equal(result.written.length, 1);
    assert.equal(result.rejected.length, 0);
    const article = readFileSync(join(fixture.siteDir, 'metro-test.md'), 'utf8');
    const frontmatter = article.match(/^---\n([\s\S]*?)\n---/)[1];
    const data = YAML.parse(frontmatter);
    assert.equal(data.draft, false);
    assert.equal(data.publication.slug, 'metro-test');
    assert.equal(data.publication.gate, 'passed');
    assert.equal(data.publication.clusterId, 1);
    assert.deepEqual(data.publication.claimIds, [1]);
    assert.equal(data.verification.status, 'passed');
    assert.equal(data.publication.evidenceHash, data.verification.evidenceHash);
    assert.notEqual(data.excerpt, '…');
    assert.notEqual(data.seoTitle, '…');
    assert.notEqual(data.seoDescription, '…');
    const bodyOnly = article.split('\n---\n').at(-1);
    assert.equal(bodyOnly.match(/ঢাকায় মেট্রোরেলের নতুন লাইন রবিবার সকালে চালু হয়েছে।/g).length, 1);
    assert.equal(JSON.parse(readFileSync(fixture.rejectionsPath, 'utf8')).written.length, 1);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('finalizer records but never renders an unpicked body', () => {
  const fixture = makeFixture();
  try {
    writeFileSync(join(fixture.bodiesDir, 'other.b.md'), BODY);
    const result = runFixture(fixture);
    assert.deepEqual(result.written.map((item) => item.slug), ['metro-test']);
    assert.ok(result.rejected.some((item) => item.slug === 'other' && item.reason === 'UNPICKED_BODY_IGNORED'));
    assert.equal(readFileSync(join(fixture.siteDir, 'metro-test.md'), 'utf8').includes('other'), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('finalizer rejects a gate failure without creating a public file', () => {
  const fixture = makeFixture();
  try {
    const briefPath = join(fixture.briefsDir, 'metro-test.json');
    const brief = JSON.parse(readFileSync(briefPath, 'utf8'));
    brief.verdict.status = 'human_check';
    writeFileSync(briefPath, JSON.stringify(brief));
    const result = runFixture(fixture);
    assert.equal(result.written.length, 0);
    assert.equal(result.rejected[0].reason, 'PUBLICATION_GATE_BLOCKED');
    assert.ok(result.rejected[0].failureCodes.includes('VERDICT_NOT_PASSED'));
    assert.throws(() => readFileSync(join(fixture.siteDir, 'metro-test.md'), 'utf8'));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
