import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eventMatchScore,
  matchEvent,
  anniversaryDate,
  daysUntilAnniversary,
  workScore,
} from '../tools/event_scheduler.mjs';

const dengueEvent = {
  id: 'dengue-outbreak-season',
  priority: 'high',
  status: 'active',
  keywords: ['ডেঙ্গু', 'এডিস', 'মশা', 'জ্বর'],
};

const sagorEvent = {
  id: 'sagor-runi-murder',
  priority: 'high',
  status: 'planned',
  anniversary: '02-11',
  keywords: ['সাগর রুনি', 'সাংবাদিক', 'হত্যা'],
};

test('eventMatchScore boosts specific keyword hits in title', () => {
  const post = { title: 'ডেঙ্গুতে মৃত্যু', excerpt: 'ঢাকায় ডেঙ্গুর প্রভাব' };
  assert.ok(eventMatchScore(dengueEvent, post) >= 4);
});

test('matchEvent rejects generic-only matches (ঢাকা)', () => {
  const metroLike = {
    title: 'ঢাকায় নতুন উড়ালপথ উদ্বোধন',
    excerpt: 'ঢাকার যানজট কমাতে নতুন সড়ক',
  };
  assert.equal(matchEvent(dengueEvent, metroLike), false);
});

test('matchEvent accepts a specific keyword in title', () => {
  const post = { title: 'রানা প্লাজার স্মরণে মিছিল', excerpt: 'সাভারে প্রতিবাদ' };
  const event = { id: 'x', keywords: ['রানা প্লাজা', 'সাভার'] };
  assert.equal(matchEvent(event, post), true);
});

test('anniversaryDate parses MM-DD to a UTC date', () => {
  const d = anniversaryDate(sagorEvent, new Date('2026-09-20T00:00:00Z'));
  assert.ok(d);
  assert.equal(d.getUTCMonth(), 1);
  assert.equal(d.getUTCDate(), 11);
});

test('daysUntilAnniversary wraps to next year when anniversary passed', () => {
  const ref = new Date('2026-05-01T00:00:00Z');
  const diff = daysUntilAnniversary(sagorEvent, ref);
  assert.ok(diff > 0 && diff < 365);
});

test('workScore penalizes planned events without anniversary hook', () => {
  const base = workScore(sagorEvent, false, 200);
  const hooked = workScore(sagorEvent, true, 10);
  assert.ok(hooked > base);
});