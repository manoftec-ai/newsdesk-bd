// regression tests for tokenizer + clustering (node --test test/*.test.mjs)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokens, titleSimilarity } from '../lib/normalize.mjs';
import { buildVectors, cosine, clusterItems, pruneOutliers, findClusters } from '../lib/cluster.mjs';

describe('tokens (Bengali conjunct/anusvara regression)', () => {
  it('keeps conjunct words as one token', () => {
    assert.deepEqual(tokens('অপ্রতিম'), ['অপ্রতিম']);
    assert.deepEqual(tokens('বাংলাদেশ'), ['বাংলাদেশ']);
    assert.deepEqual(tokens('সর্বনিম্ন'), ['সর্বনিম্ন']);
  });
  it('does not emit syllable fragments', () => {
    const t = tokens('অপ্রতিম');
    assert.ok(!t.includes('অপ') && !t.includes('রত'));
  });
  it('keeps numbers and latin together', () => {
    assert.deepEqual(tokens('২০২৬ সালে GDP 5.7% বাড়বে'), ['২০২৬', 'সালে', 'gdp', 'বাড়বে']);
  });
});

describe('titleSimilarity', () => {
  it('near-duplicate titles score high', () => {
    assert.ok(titleSimilarity('মিরপুরে যাত্রীবাহী বাসে আগুন', 'মিরপুরে যাত্রীবাহী বাসে আগুন') > 0.9);
    assert.ok(titleSimilarity('ডেঙ্গুতে আরও ২ জনের মৃত্যু', 'ডেঙ্গুতে আরও দুই মৃত্যু') > 0.3);
  });
  it('unrelated titles score low', () => {
    assert.ok(titleSimilarity('হামে আরও ৫ জনের মৃত্যু', 'হোয়াইট হাউজে সংবাদমাধ্যম নিষিদ্ধ') < 0.2);
  });
});

const item = (id, title, body) => ({ id, title, body });

describe('clustering (word-level TF-IDF)', () => {
  it('same-event stories with a shared entity merge', () => {
    const items = [
      item(1, 'কুমিল্লায় অপ্রতিম হত্যাকাণ্ডের ঘটনায় আটক তিনজন', 'কুমিল্লায় অপ্রতিম হত্যা মামলায় পুলিশ তিনজনকে আটক করেছে। জিজ্ঞাসাবাদ চলছে।'),
      item(2, 'কুমিল্লায় অপ্রতিম হত্যাকাণ্ডে আরও একজন সন্দেহভাজন আটক', 'পুলিশ কুমিল্লায় অপ্রতিম হত্যা মামলায় আরও একজন সন্দেহভাজনকে আটক করেছে। জিজ্ঞাসাবাদ চলছে।'),
      item(3, 'হোয়াইট হাউজে সংবাদমাধ্যম নিষিদ্ধ', 'হোয়াইট হাউজের এক প্রেস ব্রিফিংয়ে সংবাদমাধ্যমের প্রবেশ নিষিদ্ধ করা হয়েছে।'),
    ];
    const clusters = findClusters(items, 0.45, 0.35);
    const one = clusters.find((g) => g.includes(1));
    const two = clusters.find((g) => g.includes(2));
    assert.equal(one.length, 2, 'event pair should share a cluster');
    assert.deepEqual(one.sort(), [1, 2].sort());
    assert.ok(!two.some((i) => i === 3), 'unrelated story must not be pulled in');
  });

  it('dengue vs measles stories do not merge', () => {
    const items = [
      item(1, 'ডেঙ্গুতে আরও ২ জনের মৃত্যু, হাসপাতালে ভর্তি বাড়ছে', 'ডেঙ্গুতে আরও দুইজনের মৃত্যু হয়েছে। হাসপাতালে ভর্তি রোগীর সংখ্যা এখন ১২৩২।'),
      item(2, 'ডেঙ্গুতে আরও দুই মৃত্যু, নতুন ভর্তি ১২৩২', 'ডেঙ্গুতে আরও দুই জনের মৃত্যু। হাসপাতালে ভর্তি নতুন রোগী ১২৩২ জন।'),
      item(3, 'হামে আরও ৫ জনের মৃত্যু', 'হাম রোগে আক্রান্ত হয়ে আরও পাঁচটি শিশুর মৃত্যু হয়েছে। টিকা ক্যাম্প চালু।'),
    ];
    const clusters = findClusters(items, 0.45, 0.35);
    const one = clusters.find((g) => g.includes(1));
    assert.equal(one.length, 2);
    assert.ok(!clusters.find((g) => g.includes(3)).some((i) => i === 1 || i === 2), 'measles must stay separate');
  });

  it('pruneOutliers drops a weakly-attached member', () => {
    const items = [
      item(1, 'নতুন পে স্কেলের প্রজ্ঞাপন জুলাই থেকে', 'নতুন পে স্কেলের প্রজ্ঞাপন জারি হয়েছে। জুলাই থেকে বেতন বাড়বে।'),
      item(2, 'নতুন পে-স্কেলে বাড়িভাড়া কত জানাল অর্থ বিভাগ', 'নতুন পে স্কেলে বাড়িভাড়া সর্বোচ্চ কত হবে তা জানিয়েছে অর্থ বিভাগ।'),
      item(3, 'মোবাইল ফোনের জন্যই কুবি শিক্ষকের ছেলেকে হত্যা', 'পুলিশের ধারণা মোবাইল ফোনের কারণে কুবি শিক্ষকের ছেলেকে হত্যা করা হয়েছে।'),
    ];
    const v = buildVectors(items);
    const groups = clusterItems(items, 0.30, v); // low threshold chains everything
    const pruned = pruneOutliers(v, groups, 0.35);
    assert.ok(pruned.every((g) => !(g.includes(3) && g.length > 1)), 'grab-away member pruned');
  });
});

describe('cosine sanity', () => {
  it('identical vectors -> ~1', () => {
    const a = new Map([['x', 1], ['y', 2]]);
    assert.ok(Math.abs(cosine(a, a) - 1) < 1e-9);
  });
  it('empty vector -> 0', () => {
    assert.equal(cosine(new Map(), new Map([['x', 1]])), 0);
  });
});