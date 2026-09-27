#!/usr/bin/env node
// tools/backfill_tags.mjs — one-off tag backfill for tagless articles.
// 2026-09-27 interlinking: 92/398 articles shipped with `tags: []`, which left
// them out of every tag cluster and weakened relatedPosts + context links +
// tag pages corpus-wide. This tool assigns 1-4 navigational tags per tagless
// article using the SAME keyword signals as inferTags() in lib/synth.mjs plus
// a category fallback. Tags are navigation only (never factual claims), and
// /tags pages generate dynamically for any slug, so there is no 404 risk.
//
// Usage:
//   node tools/backfill_tags.mjs            # dry run, report only
//   node tools/backfill_tags.mjs --apply    # write files
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const NEWS_DIR = resolve(import.meta.dirname, '../../site/src/content/news');
const APPLY = process.argv.includes('--apply');

// slug -> keywords (BN + EN), mirrors inferTags() signal vocabulary.
const SIGNALS = {
  health: ['ডেঙ্গু', 'হাসপাতাল', 'স্বাস্থ্য', 'কিডনি', 'হাম', 'ভর্তি', 'রোগী', 'dengue', 'hospital', 'health', 'চিকিৎসা', 'ভাইরাস'],
  education: ['শিক্ষা', 'স্কুল', 'কলেজ', 'বিশ্ববিদ্যালয়', 'বিশ্ববিদ্যালয়', 'শিক্ষার্থী', 'education', 'পরীক্ষা'],
  economy: ['গ্যাস', 'বেতন', 'ভাতা', 'অর্থনীতি', 'বাজেট', 'মুদ্রাস্ফীতি', 'বাণিজ্য', 'economy', 'bank', 'ব্যাংক', 'trade', 'budget', 'রপ্তানি', 'আমদানি'],
  transport: ['মহাসড়ক', 'মহাসড়ক', 'বাস', 'হাইওয়ে', 'রেল', 'সড়ক', 'সড়ক', 'মেট্রোরেল', 'মেট্রো রেল', 'ট্রেন', 'গাড়ি', 'গাড়ি', 'road', 'train', 'bus', 'highway', 'যানজট', 'ফ্লাইট', 'বিমান'],
  weather: ['আবহাওয়া', 'আবহাওয়া', 'বৃষ্টি', 'ঝড়', 'ঝড়', 'তাপমাত্রা', 'rain', 'drizzle', 'weather', 'monsoon', 'শৈত্য'],
  disaster: ['বন্যা', 'ভূমিকম্প', 'অগ্নিকাণ্ড', 'আগুন', 'ধস', 'flood', 'earthquake', 'fire', 'landslide', 'ঘূর্ণিঝড়', 'ঘূর্ণিঝড়', 'cyclone', 'নিহত', 'drowning'],
  cricket: ['ক্রিকেট', 'cricket', 'টেস্ট', 'সেঞ্চুরি', 'উইকেট'],
  sports: ['ফুটবল', 'football', 'অলিম্পিক', 'match', 'খেলা'],
  politics: ['নির্বাচন', 'সংসদ', 'রাজনীতি', 'election', 'parliament', 'ভোট', 'আওয়ামী', 'বিএনপি'],
  history: [],
  factcheck: ['গুজব', 'ভুয়া', 'ভুয়া', 'মিথ্যা দাবি', 'ফ্যাক্ট চেক', 'সত্যতা যাচাই', 'ফ্যাক্টচেক'],
  metro: ['মেট্রো', 'রাজধানী'],
  dhaka: ['ঢাকা', 'মিরপুর', 'কাশিমপুর', 'বুড়িগঙ্গা', 'বুড়িগঙ্গা', 'Dhaka', 'রাজধানী'],
  chattogram: ['চট্টগ্রাম', 'কর্ণফুলী', 'কর্ণফুলী', 'কাপ্তাই', 'Chattogram', 'চট্টগ্রাম'],
  sylhet: ['সিলেট', 'Sylhet'],
  rajshahi: ['রাজশাহী', 'Rajshahi'],
  khulna: ['খুলনা', 'Khulna'],
  rangpur: ['রংপুর', 'Rangpur'],
  barishal: ['বরিশাল', 'Barishal'],
  mymensingh: ['ময়মনসিংহ', 'ময়মনসিংহ', 'Mymensingh'],
  cumilla: ['কুমিল্লা', 'Cumilla'],
  narayanganj: ['নারায়ণগঞ্জ', 'নারায়ণগঞ্জ'],
  gaibandha: ['গাইবান্ধা', 'সুন্দরগঞ্জ'],
  dinajpur: ['দিনাজপুর'],
  bogura: ['বগুড়া', 'বগুড়া'],
  jashore: ['যশোর'],
  tangail: ['টাঙ্গাইল'],
  coxsbazar: ['কক্সবাজার', 'কক্সবাজার', 'টেকনাফ'],
  rangamati: ['রাঙ্গামাটি', 'রাঙামাটি'],
};

const CATEGORY_FALLBACK = {
  history: 'history',
  economy: 'economy',
  factcheck: 'factcheck',
  sports: 'sports',
  entertainment: 'entertainment',
  tech: 'technology',
  politics: 'politics',
  international: 'world',
  opinion: 'opinion',
  national: 'bangladesh',
  latest: 'bangladesh',
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Bengali is agglutinative: substring search misfires ('বাস' inside 'বাসা',
// 'হাম' inside 'হামলা'). A keyword counts as a standalone word, optionally
// followed by inflectional case suffixes (ে/র/কে/দের/গুলো/টি) so inflected
// forms like নারায়ণগঞ্জে, নারায়ণগঞ্জের, ঢাকার still match — but derivational
// endings (বাসা, হামলা) do not.
const WORD_CHAR = '[\\u0980-\\u09FFA-Za-z0-9]';
const BN_SUFFIX = '(?:ের|দের|গুলো|গুলি|সহ|কে|টি|টা|ে|র|য়)?';
const wordHit = (hay, kw) => {
  const tail = /[A-Za-z]/.test(kw) ? '(?:s)?' : BN_SUFFIX;
  return new RegExp(`(?<!${WORD_CHAR})${escapeRegExp(kw)}${tail}(?!${WORD_CHAR})`).test(hay);
};

const hasTags = (fm) => {
  const block = fm.match(/^tags:\s*\n((?:\s+-.*\n?)*)/m);
  if (block && [...block[1].matchAll(/-\s*(\S+)/g)].length) return true;
  const inline = fm.match(/^tags:\s*\[(.*)\]/m);
  if (inline && inline[1].trim()) return true;
  return false;
};

const frontmatterOf = (text) => {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  return m ? { fm: m[1], body: m[2] } : null;
};

const categoryOf = (fm) => (fm.match(/^category:\s*["']?([^"'\n]+)["']?/m)?.[1] ?? '').trim();

function suggestTags(slug, text, category) {
  const hay = text.slice(0, 6000);
  const out = [];
  // history anchors: filename signal (history_author wrote tags:[] before the fix)
  if (slug.startsWith('history-')) out.push('history');
  for (const [tag, kws] of Object.entries(SIGNALS)) {
    if (!kws.length) continue;
    if (out.includes(tag)) continue;
    if (kws.some((kw) => kw && wordHit(hay, kw))) out.push(tag);
  }
  if (!out.length && CATEGORY_FALLBACK[category]) out.push(CATEGORY_FALLBACK[category]);
  return out.slice(0, 4);
}

function setTags(fm, tags) {
  const block = `tags:\n${tags.map((t) => `  - ${t}`).join('\n')}`;
  if (/^tags:\s*\[.*\]/m.test(fm)) return fm.replace(/^tags:\s*\[.*\]/m, block);
  if (/^tags:\s*\n(?:\s+-.*\n?)*/m.test(fm)) return fm.replace(/^tags:\s*\n(?:\s+-.*\n?)*/m, block + '\n');
  if (/^tags:\s*$/m.test(fm)) return fm.replace(/^tags:\s*$/m, block);
  // no tags key at all — insert after category line
  return fm.replace(/^category:.*$/m, (m) => `${m}\n${block}`);
}

let scanned = 0, tagless = 0, written = 0;
const report = [];
for (const file of readdirSync(NEWS_DIR).filter((f) => f.endsWith('.md'))) {
  const full = join(NEWS_DIR, file);
  const text = readFileSync(full, 'utf8');
  const parsed = frontmatterOf(text);
  if (!parsed) { report.push(`${file}: NO-FRONTMATTER (skipped)`); continue; }
  scanned++;
  if (hasTags(parsed.fm)) continue;
  tagless++;
  const slug = file.replace(/\.md$/, '');
  const tags = suggestTags(slug, `${parsed.fm}\n${parsed.body}`, categoryOf(parsed.fm));
  report.push(`${file}: [${tags.join(', ') || 'NONE'}]`);
  if (APPLY && tags.length) {
    const next = `---\n${setTags(parsed.fm, tags)}\n---\n${parsed.body}`;
    writeFileSync(full, next);
    written++;
  }
}

console.log(`scanned=${scanned} tagless=${tagless} ${APPLY ? `written=${written}` : '(dry-run, nothing written)'}`);
console.log(report.join('\n'));
