// test/synth.test.mjs — unit tests for synth helpers
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferTags } from '../lib/synth.mjs';

test('inferTags emits only defined tags from real keywords', () => {
  const brief = {
    headline: 'চট্টগ্রামে ডেঙ্গু রোগী বাড়ছে, হাসপাতালে ভর্তির চাপ',
    members: [{ title: 'প্রথম আলো প্রতিবেদন', lead: 'ঢাকাসহ সারা দেশে স্বাস্থ্য ঝুঁকি' }],
  };
  const tags = inferTags(brief);
  assert.ok(tags.includes('health'));
  assert.ok(tags.includes('chattogram'));
  assert.ok(tags.includes('dhaka'));
  assert.ok(!tags.includes('cricket'));
});

test('inferTags recognizes fact-check keywords', () => {
  const brief = {
    headline: 'গুজব ছড়ানোর অভিযোগে গ্রেপ্তার',
    members: [{ title: 'দৈনিক সংবাদ', lead: '‘ভুয়া’ খবর ছড়ানোর অভিযোগ' }],
  };
  const tags = inferTags(brief);
  assert.ok(tags.includes('gujob'));
});

test('inferTags emits nothing when no keyword appears', () => {
  assert.deepEqual(inferTags({ headline: 'নির্দিষ্ট কোনো ম্যাপিং ছাড়া দাবি', members: [] }), []);
});