// test/tier-a-single-source.test.mjs — the 2026-09-26 policy change.
//
// USER ASKED: publish a story even when no second source matches; only give the
// corroborated badge when several sources agree.
//
// WHAT I MEASURED FIRST, and told them, because it changed the shape of the fix:
//   427 briefs total
//   357 (84%) blocked by the evidence gate (< 100 words of source material)
//    70 pass the evidence gate
//      55 of those already have 3+ sources
//      15 have only 1-2 sources  <- the only ones this change unlocks
//
// So dropping corroboration would not have made the site update much more often.
// The blockage is missing text, not missing corroboration. The change was still
// worth making, for a different reason: tier A demanded "confirmed", and with
// only 7 of 20 sources able to enrich from CI, national/politics/international
// news almost never published at all.
//
// WHAT CHANGED
//   min_badge A: confirmed -> single, in three places that must agree:
//     lib/verify.mjs, lib/publication-gate.mjs, config/sources.yaml
//   lib/extract.mjs no longer drops a tier A story that is not verified/confirmed.
//     It marks it brief.uncorroborated instead, which flows into article
//     frontmatter and renders a notice on the page.
//
// WHAT MUST NOT CHANGE, and is asserted below
//   The badge ladder is untouched. "confirmed" still requires score >=
//   confirmed_min (3), so a single-source story can never be labelled
//   corroborated. That is the whole safety property of this change: the floor
//   dropped, the labelling did not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(join(import.meta.dirname, p), 'utf8');

// --- the badge ladder is the safety property ---------------------------------
test('confirmed still requires corroborated_min, so one source can never be "confirmed"', () => {
  const src = read('../lib/verify.mjs');
  // The ladder itself must be byte-identical in shape to before the change.
  assert.match(
    src,
    /const badge = hasOfficial && score >= vcfg\.verified_min \? 'verified'\s*\n\s*: score >= vcfg\.confirmed_min \? 'confirmed'\s*\n\s*: score >= vcfg\.single_val \? 'single'\s*\n\s*: 'skeptical';/,
    'the badge ladder must not be reordered or relaxed',
  );
  // And the thresholds must still come from config, not be hardcoded down.
  assert.match(src, /score >= vcfg\.confirmed_min/, 'confirmed must stay tied to confirmed_min');
  assert.match(src, /score <= vcfg\.single_val - 1 \? 'human_check'/, 'skeptical must never auto-publish');
});

test('all three min_badge sites agree, or a story could pass one and fail another', () => {
  const verify = read('../lib/verify.mjs');
  const gate = read('../lib/publication-gate.mjs');
  const config = read('../config/sources.yaml');

  assert.match(verify, /min_badge: \{ A: 'single', B: 'single', C: 'single' \}/, 'verify.mjs default');
  assert.match(
    gate,
    /DEFAULT_MIN_BADGE = Object\.freeze\(\{ A: 'single', B: 'single', C: 'single' \}\)/,
    'publication-gate default',
  );
  assert.match(config, /min_badge:[\s\S]*?A: single\s*\n\s*B: single\s*\n\s*C: single/, 'sources.yaml');

  // Nothing anywhere may still demand A: confirmed.
  for (const [name, src] of [['verify.mjs', verify], ['publication-gate.mjs', gate], ['sources.yaml', config]]) {
    assert.ok(
      !/A:\s*'?confirmed'?/.test(src),
      `${name} still requires A: confirmed, which would silently block tier A again`,
    );
  }
});

// --- extract no longer silently drops tier A ---------------------------------
test('extract marks a tier A single-source story instead of dropping it', () => {
  const src = read('../lib/extract.mjs');
  assert.ok(
    !/tier === 'A' && brief\.verdict\.badge !== 'verified' && brief\.verdict\.badge !== 'confirmed'\)\s*\{\s*skipped\+\+; continue;/.test(
      src,
    ),
    'the old hard drop of non-confirmed tier A stories is gone',
  );
  assert.match(src, /if \(tierA && !corroborated\) brief\.uncorroborated = true;/, 'it must be marked instead');
  assert.match(src, /uncorroborated = true/, 'the flag must be set on the brief');
});

test('the flag reaches the article frontmatter', () => {
  const src = read('../lib/synth.mjs');
  assert.match(src, /uncorroborated: \$\{fm\.uncorroborated === true\}/, 'frontmatter must carry the flag');
});

test('the article page tells the reader the story is not corroborated', () => {
  const src = read('../../site/src/pages/article/[slug].astro');
  assert.match(src, /post\.verification\?\.uncorroborated/, 'the notice must be conditional on the flag');
  assert.match(src, /স্বাধীনভাবে যাচাই করা হয়নি/, 'the notice must say it was not independently verified');
  assert.match(src, /একটি মাধ্যমের তথ্যের ভিত্তিতে/, 'the notice must say it rests on one source');
});

// --- the fast lane -----------------------------------------------------------
test('picking prefers lower-risk tiers at equal editorial value', () => {
  const src = read('../tools/pick_briefs.mjs');
  assert.match(src, /const TIER_RISK = \{ B: 0, C: 0, A: 1 \}/, 'tier A must rank as the higher risk');
  assert.match(src, /\(riskOf\(a\) - riskOf\(b\)\) \|\|/, 'risk must break ties after editorial value');
  // It must come AFTER date and evScore, so it only breaks ties.
  const order = src.indexOf('String(b.date).localeCompare');
  const ev = src.indexOf('(b.evScore - a.evScore)');
  const risk = src.indexOf('(riskOf(a) - riskOf(b))');
  assert.ok(order < ev && ev < risk, 'tie-break order must be date, then value, then risk');
});

// --- what the change did NOT touch -------------------------------------------
test('the evidence floor is unchanged by this policy change', () => {
  // The whole point of the measurement was that evidence, not corroboration, is
  // the constraint. A collaborator "fixing" the volume problem by dropping this
  // floor would recreate exactly the stub content this project removed.
  const src = read('../lib/editorial.mjs');
  assert.match(src, /export const DEFAULT_MIN_EVIDENCE_WORDS = 100;/, 'evidence floor must stay at 100');
  assert.match(src, /export const DEFAULT_MIN_PUBLISH_WORDS = 150/, 'body floor must stay at 150');
  const verify = read('../lib/verify.mjs');
  assert.match(verify, /confirmed_min/, 'corroboration threshold must still be config-driven');
});

// --- the FOURTH tier A gate (found 2026-09-27) --------------------------------
// D112 relaxed min_badge in three places. This is the fourth, and it is why the
// site stayed silent afterwards: 94 of 272 unpublished briefs were blocked here,
// so the policy change was almost entirely inert.
test('tier A on a single source is no longer blocked at the headline check', () => {
  const src = read('../lib/publication-gate.mjs');
  assert.ok(
    !/tier === 'A' && claimStatus === 'SINGLE_SOURCE'/.test(src),
    'the tier A + SINGLE_SOURCE clause is back - it silently blocks every single-source tier A story',
  );
  assert.match(
    src,
    /if \(!headline \|\| !claim \|\| result\.status !== 'supported' \|\| surfacesWeak\)/,
    'the genuine protections must remain: headline must exist, trace to sources, and no weak surface',
  );
});

test('the headline gate keeps every real protection', () => {
  const src = read('../lib/publication-gate.mjs');
  // Weakening one clause must not have removed the others.
  assert.match(src, /!headline/, 'a missing headline must still fail');
  assert.match(src, /!claim/, 'a missing claim must still fail');
  assert.match(src, /result\.status !== 'supported'/, 'an unsupported headline must still fail');
  assert.match(src, /\['weak', 'poor', 'overclaim'\]/, 'a weak surface must still fail');
  assert.match(src, /headlineHasHype/, 'hype detection must remain');
  assert.match(src, /HEADLINE_HYPE/, 'hype must still be a separate failure code');
});

test('a single-source claim still cannot be labelled confirmed', () => {
  // The safety of the D112/D113 change rests on the badge ladder, not on
  // suppression. If this ever passes, the "not corroborated" notice becomes a lie.
  const src = read('../lib/verify.mjs');
  const confirmed = src.match(/score >= vcfg\.confirmed_min \? 'confirmed'/);
  assert.ok(confirmed, 'confirmed must still be gated on corroboration');
  const single = src.match(/score >= vcfg\.single_val \? 'single'/);
  assert.ok(single, 'a lower score must yield single, not confirmed');
  // and extract must still mark the story uncorroborated
  assert.match(read('../lib/extract.mjs'), /if \(tierA && !corroborated\) brief\.uncorroborated = true;/);
});
