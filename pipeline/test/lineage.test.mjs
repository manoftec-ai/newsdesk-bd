// test/lineage.test.mjs — source independence (evidence groups)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupKey, groupEvidence } from '../lib/lineage.mjs';

const lineage = {
  a: { wire_origin: 'reuters' },
  b: { wire_origin: 'reuters' },
  c: { ownership_group: 'mediacorp' },
  d: { ownership_group: 'mediacorp' },
  official: { source_type: 'official' },
};

test('two outlets sharing a wire = ONE group, not two confirmations', () => {
  assert.equal(groupKey('a', lineage), 'wire:reuters');
  assert.equal(groupKey('b', lineage), 'wire:reuters');
  const { independentCount } = groupEvidence([{ source_id: 'a' }, { source_id: 'b' }], lineage);
  assert.equal(independentCount, 1);
});

test('same ownership = one group', () => {
  const { independentCount } = groupEvidence([{ source_id: 'c' }, { source_id: 'd' }], lineage);
  assert.equal(independentCount, 1);
});

test('no lineage entry -> source is its own independent group (safe default)', () => {
  const { independentCount } = groupEvidence([{ source_id: 'zz' }, { source_id: 'yy' }], lineage);
  assert.equal(independentCount, 2);
});

test('reuters wire + separate independent source + official = 3 groups', () => {
  const ev = [{ source_id: 'a' }, { source_id: 'b' }, { source_id: 'prothomalo' }, { source_id: 'official' }];
  const { independentCount, officialCount } = groupEvidence(ev, lineage);
  assert.equal(independentCount, 3); // wire:a/b=1, prothomalo=1, official=1
  assert.equal(officialCount, 1);
});