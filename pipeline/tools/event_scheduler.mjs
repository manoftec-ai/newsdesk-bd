// tools/event_scheduler.mjs — Ghotona Pongji planning tool (F4)
//
// Reads site/src/data/events.json, assigns a work score, flags upcoming
// anniversaries, and prints a suggested weekly authoring plan.
//
// Scoring (0-100):
//   +  priority: high=40, med=20, low=5
//   +  status:   active=30, planned=0
//   +  coverage: covered (has matched articles)=15, uncovered=0
//   +  anniversary within next 14 days: +20 (recency hook)
//   +  reading demand can be overridden per event via `demandScore`
//
// usage: node tools/event_scheduler.mjs [--waiting-days=7] [--top=12]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENTS_FILE = resolve(import.meta.dirname, '../../site/src/data/events.json');

const PRIORITY = { high: 40, med: 20, low: 5 };
const STATUS = { active: 30, planned: 0 };

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\u200c\u200d]/g, '')
    .replace(/\s+/g, ' ');
}

const GENERIC_WORDS = new Set([
  'বাংলাদেশ', 'ঢাকা', 'ভারত', 'সরকার', 'দেশ', 'রাজধানী', 'দেশজুড়ে', 'লাখ', 'কোটি',
  'প্রতিবেদন', 'তথ্য', 'শেষ', 'একই', 'সংশ্লিষ্ট', 'সন্ধান', 'এখন',
]);
const isSpecific = (k) => normalize(k).length >= 5 && !GENERIC_WORDS.has(normalize(k));

const countOf = (hay, needle) => {
  hay = normalize(hay);
  needle = normalize(needle);
  if (!needle) return 0;
  let c = 0;
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    c += 1;
    i += needle.length;
  }
  return c;
};

export function eventMatchScore(event, post) {
  const title = normalize(post?.title);
  const excerpt = normalize(post?.excerpt);
  const body = normalize(post?.body);
  let score = 0;
  for (const k of event?.keywords ?? []) {
    const w = isSpecific(k) ? 1 : 0.1;
    score += countOf(title, k) * 3 * w;
    score += countOf(excerpt, k) * 1.5 * w;
    if (body) score += countOf(body, k) * 0.8 * w;
  }
  return score;
}

export function matchEvent(event, post, minimum = 4) {
  if (!event || !post) return false;
  if (eventMatchScore(event, post) >= minimum) return true;
  for (const k of event?.keywords ?? []) {
    if (isSpecific(k) && normalize(post.title).includes(normalize(k))) return true;
  }
  return false;
}

export function anniversaryDate(event, refDate = new Date()) {
  const a = event?.anniversary;
  if (!a) return null;
  const [m, day] = a.split('-').map((x) => parseInt(x, 10));
  if (!m || !day) return null;
  const year = refDate.getUTCFullYear();
  const d = new Date(Date.UTC(year, m - 1, day));
  return d;
}

export function daysUntilAnniversary(event, refDate = new Date()) {
  const next = anniversaryDate(event, refDate);
  if (!next) return null;
  const start = Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate());
  let diff = Math.round((next.getTime() - start) / 86400000);
  if (diff < 0) {
    const nextYear = new Date(
      Date.UTC(refDate.getUTCFullYear() + 1, next.getUTCMonth(), next.getUTCDate()),
    );
    diff = Math.round((nextYear.getTime() - start) / 86400000);
  }
  return diff;
}

export function workScore(event, covered, daysAhead) {
  const priority = PRIORITY[event?.priority] ?? 5;
  const status = STATUS[event?.status] ?? 0;
  const coverage = covered ? 15 : 0;
  const annBonus = daysAhead !== null && daysAhead >= 0 && daysAhead <= 14 ? 20 : 0;
  const demand = Number(event?.demandScore ?? 0);
  return priority + status + coverage + annBonus + demand;
}

export function planEvents({
  eventsFile = EVENTS_FILE,
  waitingDays = 7,
  anniversaryWindow = 14,
  covered = [],
} = {}) {
  const data = JSON.parse(readFileSync(eventsFile, 'utf8'));
  const ref = new Date();
  const coveredSet = new Set(covered);
  return data.events
    .map((e) => {
      const ahead = daysUntilAnniversary(e, ref);
      return {
        ...e,
        score: workScore(e, coveredSet.has(e.id), ahead),
        annInDays: ahead,
        annInWindow: ahead !== null && ahead >= 0 && ahead <= anniversaryWindow,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, waitingDays > 0 ? waitingDays + 5 : undefined);
}

function main() {
  const waitingDays = process.argv.includes('--waiting-days')
    ? Number(process.argv[process.argv.indexOf('--waiting-days') + 1]) || 7
    : 7;
  const json = process.argv.includes('--json');
  const plan = planEvents({ waitingDays });
  const top = plan.slice(0, waitingDays);
  if (json) {
    const rows = top.map((e) => ({
      id: e.id,
      nameBn: e.nameBn,
      score: e.score,
      priority: e.priority,
      status: e.status,
      anniversary: e.anniversary ?? null,
      annInDays: e.annInDays,
    }));
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  const dateLabel = new Date().toISOString().slice(0, 10);
  const line = (e) =>
    `${String(e.score).padStart(3)}  ${String(e.priority[0]).toUpperCase()}  ${String(
      e.status[0],
    ).toUpperCase()}  ${e.nameBn}${e.annInDays !== null ? `  [anniversary in ${e.annInDays}d]` : ''}`;

  console.log(`\nGHOTONA-PONGJI PLAN — ${dateLabel}`);
  console.log('='.repeat(52));
  for (const e of top) console.log(line(e));

  const anns = plan.filter((e) => e.annInWindow);
  if (anns.length) {
    console.log('\nUPCOMING ANNIVERSARIES (<=14d):');
    for (const e of anns) console.log(`  ${e.anniversary}  ${e.nameBn}  (in ${e.annInDays}d)`);
  }
  console.log(`\nTotal events: ${plan.length}  | suggested this week: ${top.length}`);
}

// spawn-friendly: planEvents exported, main runs only when executed directly
const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) main();