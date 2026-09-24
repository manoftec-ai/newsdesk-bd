// test/entities.test.mjs — Bengali number/strong-token extraction (P0-9 hybrid input)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDigitRun,
  normNumberStr,
  leadingNumber,
  numberTokensOf,
  digitClose,
  strongTokenSet,
  strongAgree,
} from '../lib/entities.mjs';

test('isDigitRun handles Bengali + Latin', () => {
  assert.equal(isDigitRun('১৮৬৮'), true);
  assert.equal(isDigitRun('1868'), true);
  assert.equal(isDigitRun('৮১তম'), false);
  assert.equal(isDigitRun('abc'), false);
});

test('normNumberStr maps Bengali to Latin canonical N-token', () => {
  assert.equal(normNumberStr('১৮৬৮'), 'N1868');
  assert.equal(normNumberStr('006'), 'N6');
  assert.equal(normNumberStr('abc'), null);
});

test('leadingNumber splits concatenated number words', () => {
  assert.deepEqual(leadingNumber('ছয়জনের'), { value: 6n, rest: 'জনের' });
  assert.deepEqual(leadingNumber('১৮৬৮'), { value: 1868n, rest: '' });
  assert.equal(leadingNumber('উপসর্গে'), null);
});

test('numberTokensOf extracts and accumulates numbers', () => {
  assert.deepEqual(numberTokensOf(['হামে', '১১', 'শিশুর', 'মৃত্যু']), ['N11']);
  assert.deepEqual(numberTokensOf(['ছয়', 'জনের', 'মৃত্যু']), ['N6']);
  assert.deepEqual(numberTokensOf(['হাসপাতালে', 'ভর্তি', '১৮৬৮']), ['N1868']);
  // digits + multiplier (১০ হাজার => 10000)
  assert.deepEqual(numberTokensOf(['১০', 'হাজার', 'টাকা']), ['N10000']);
  assert.deepEqual(numberTokensOf([]), []);
});

test('digitClose: 1868 and 1866 agree, 1868 and 200 do not', () => {
  assert.equal(digitClose('N1868', 'N1866'), true);
  assert.equal(digitClose('N1868', 'N1868'), true);
  assert.equal(digitClose('N1868', 'N200'), false);
  assert.equal(digitClose('N6', 'N200'), false);
});

test('strongAgree: two shared signals, or one close 3+ digit figure with coverage', () => {
  const A = new Set(['N6', 'N1868']);
  const B = new Set(['N6', 'N1868', 'জনের']);
  const C = new Set(['N200', 'N24', 'N1866']);
  assert.equal(strongAgree(A, B), true); // >=2 shared
  assert.equal(strongAgree(A, C), true); // close digit + coverage 1/2=0.5
  assert.equal(strongAgree(new Set(['N11']), new Set(['N11'])), false); // lone mundane number is NOT enough
  assert.equal(strongAgree(new Set(), new Set(['N1'])), false);
});

test('strongTokenSet excludes pure-ASCII jargon and raw Bengali digit runs', () => {
  const df = new Map([['কম', 1], ['sources', 12]]);
  const N = 20;
  const s = strongTokenSet({ title: '১৮৬৮ মৃত্যু samakal com', body: '', df, N });
  assert.equal(s.has('N1868'), true);
  assert.equal(s.has('samakal'), false);
  assert.equal(s.has('com'), false);
  assert.equal(s.has('১৮৬৮'), false);
});