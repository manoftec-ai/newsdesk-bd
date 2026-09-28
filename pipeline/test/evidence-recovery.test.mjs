// 2026-09-28: the site ran out of publishable briefs and the cause was not the
// author. 589 briefs sat on disk and the picker found 0 pending, because 217 of
// them were under the 100-word evidence floor. Most were not thin sources - the
// extractor was throwing away text it had already fetched.
//
// A second thing surfaced here: c12 was refusing correct articles, because its
// threshold had been set by feel and never measured.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  mechanicalAudit,
  bodyHeadlineRelevance,
  MIN_HEADLINE_COVERAGE,
} from '../lib/audit.mjs';

const load = (name) => {
  const t = fs.readFileSync(new URL(`./fixtures/${name}.md`, import.meta.url), 'utf8');
  const m = t.match(/^---\n([\s\S]*?)\n---/);
  const front = m ? m[1] : '';
  return {
    title: (front.match(/title:\s*"([^"]+)/) || [])[1] || '',
    body: t.slice(m ? m[0].length : 0),
  };
};

const audit = (title, body) =>
  mechanicalAudit({ headline: title, members: [{ lead: 'সংবাদ সম্মেলন' }] }, body);

// The real articles, not reconstructions of them. The defect this check was
// written for and an article it was wrongly refusing, both at their measured
// scores: 8% and 14%.
test('c12 still refuses the real digest-under-a-headline defect', () => {
  const { title, body } = load('national-532-known-bad');
  const r = bodyHeadlineRelevance(title, body);
  assert.ok(r.coverage < 0.10, `defect should stay under 0.10, got ${r.coverage.toFixed(2)}`);
  assert.ok(audit(title, body).fails.some((f) => f.id === 'c12'), 'c12 must still fire on it');
});

test('c12 passes a real article that paraphrases its headline', () => {
  const { title, body } = load('national-543-known-good');
  const r = bodyHeadlineRelevance(title, body);
  assert.ok(r.coverage >= MIN_HEADLINE_COVERAGE, `a genuine article scored ${r.coverage.toFixed(2)}`);
  assert.ok(!audit(title, body).fails.some((f) => f.id === 'c12'), 'c12 must not fire on it');
});

test('the threshold sits in the gap between the defect and the good articles', () => {
  const bad = bodyHeadlineRelevance(...Object.values(load('national-532-known-bad'))).coverage;
  const good = bodyHeadlineRelevance(...Object.values(load('national-543-known-good'))).coverage;
  assert.ok(
    bad < MIN_HEADLINE_COVERAGE && MIN_HEADLINE_COVERAGE <= good,
    `threshold ${MIN_HEADLINE_COVERAGE} must separate ${bad.toFixed(2)} from ${good.toFixed(2)}`,
  );
});

test('the extractor bridges a weak paragraph instead of truncating the body', () => {
  // scoreParagraph rejects anything under 12 words, and real news copy contains
  // one-sentence paragraphs, so one short quote used to reset the run and return
  // a one-paragraph "article". Measured on live fetches of the very briefs that
  // were starving the pipeline: 2794 -> 4001 evidence words across 13 URLs, and
  // one URL that returned nothing at all returned 123 words after.
  const src = fs.readFileSync(new URL('../lib/article-text.mjs', import.meta.url), 'utf8');
  assert.match(src, /longestRun\(paragraphs, 25, maxGap\)/, 'the run must allow a gap');
  assert.match(src, /maxGap = 2/, 'the default gap must be 2');
  // A gap may bridge a WEAK paragraph, never furniture. Furniture is what
  // actually separates two unrelated stories on a page, so bridging it is how a
  // publisher's "আরও পড়ুন" list gets spliced into the story above it.
  assert.match(src, /!p\.furniture/, 'furniture must not be bridgeable');
});
