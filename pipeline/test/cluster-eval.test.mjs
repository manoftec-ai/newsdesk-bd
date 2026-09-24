// test/cluster-eval.test.mjs — Golden Test Dataset evaluator tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pairKey, goldPairs, pairwiseScores, eventReport, evaluateClusters } from '../lib/cluster-eval.mjs';

const golden = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../config/golden.json'), 'utf8'),
);

test('pairKey canonicalizes order', () => {
  assert.equal(pairKey('a', 'b'), pairKey('b', 'a'));
  assert.equal(pairKey('b', 'a'), 'a|b');
});

test('goldPairs counts all intra-event pairs only', () => {
  const gp = goldPairs(golden);
  // measles members: 160642,160311 -> 1 pair
  // gates: 3 members -> 3 pairs ; erdogan: 6 -> 15 ; dengue 3 -> 3
  assert.equal(gp.has(pairKey('160642', '160311')), true);
  assert.equal(gp.has(pairKey('159826', '158687')), true);
  assert.equal(gp.has(pairKey('158735', '141435')), true);
  assert.equal(gp.size, 1 + 3 + 15 + 3);
  // no pair can cross events
  assert.equal(gp.has(pairKey('160642', '158032')), false);
});

test('pairwiseScores perfect clustering gives 1/1/1', () => {
  const clusters = [
    ['160642', '160311'],               // measles
    ['159826', '158836', '158687'],     // gates
    ['158735', '145205', '120880', '123100', '121550', '141435'], // erdogan
    ['157906', '149951', '157783'],     // dengue
    ['159768'], ['157085'], ['160448'], ['158700'], ['158610'], ['158032'], ['159214'],
  ];
  const { precision, recall, f1 } = pairwiseScores(clusters, golden);
  assert.equal(precision, 1);
  assert.equal(recall, 1);
  assert.equal(f1, 1);
});

test('pairwiseScores penalizes both false merges and splits', () => {
  // merge measles with cyber trap (false positive) AND split dengue (false negative)
  const clusters = [
    ['160642', '160311', '158032'],
    ['159826', '158836', '158687'],
    ['158735', '145205', '120880', '123100', '121550', '141435'],
    ['157906', '149951'], ['157783'],
    ['159768'], ['157085'], ['160448'], ['158700'], ['158610'], ['159214'],
  ];
  const { tp, fp, fn, f1 } = pairwiseScores(clusters, golden);
  assert.ok(fp >= 2, 'cyber trap merged -> fp');
  assert.ok(fn >= 1, 'dengue split -> fn');
  assert.ok(f1 < 1);
  assert.ok(tp > 0);
});

test('eventReport flags merged / split / clean', () => {
  const rep = eventReport(golden, [
    ['160642', '160311'], ['158032'],
    ['159826', '158836', '158687'],
    ['158735', '145205', '120880', '123100', '121550', '141435'],
    ['157906'], ['149951', '157783'],
    ['159768'], ['157085'], ['160448'], ['158700'], ['158610'], ['159214'],
  ]);
  const by = Object.fromEntries(rep.map((r) => [r.event, r.status]));
  assert.equal(by['mesles-11-deaths'], 'merged');
  assert.equal(by['pm-erdogan-turkey'], 'merged');
  assert.equal(by['dengue-daily-report'], 'split');
  assert.equal(by['fuel-cut-statement'], 'clean');
});

test('evaluateClusters end-to-end: golden set at production tuning reaches high F1', () => {
  const items = Object.entries(golden.items).map(([id, it]) => ({ id, title: it.title, body: it.body ?? '' }));
  const { scores } = evaluateClusters(items, { similarity: 0.3, prune: 0.35, golden });
  assert.equal(scores.precision, 1, 'no false merges on the curated traps');
  assert.ok(scores.recall >= 0.9, `recall lost: ${scores.recall}`);
  assert.ok(scores.f1 >= 0.9, `F1 too low: ${scores.f1}`);
});