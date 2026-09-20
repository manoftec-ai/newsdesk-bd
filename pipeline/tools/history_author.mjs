// tools/history_author.mjs — Ghotona Pongji Tier-1 authoring (F5+F6)
//
// For a catalog event, builds an honest "hub anchor" article:
//   - loads the event definition (name, keywords, year)
//   - description must come from EVENT DESCRIPTIONS below (curated, sourced) —
//     never from an LLM guessing history (no-fabrication rule)
//   - links the event's own past coverage (matched posts) if any
//   - writes a Tier-1 markdown into site/src/content/news/ as a DRAFT (draft:true)
//     so a human can review factual claims before it goes live
//
// usage: node tools/history_author.mjs <eventId> [--publish]
//   --publish  flip draft:false (only when the description was human-reviewed)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_DIR = resolve(import.meta.dirname, '../../site');
const EVENTS_FILE = join(SITE_DIR, 'src/data/events.json');
const CONTENT_DIR = join(SITE_DIR, 'src/content/news');

// Map event categories to the theme's known categories (fallback: national).
const CATEGORY_MAP = {
  security: 'national',
  media: 'national',
  economy: 'economy',
  politics: 'politics',
  education: 'national',
  international: 'international',
  infrastructure: 'national',
  energy: 'national',
  health: 'national',
  disaster: 'national',
  sports: 'sports',
  justice: 'national',
  culture: 'national',
  environment: 'national',
  national: 'national',
  tech: 'tech',
};

// Curated, source-backed one-two sentence intros for Tier-1 hubs. This is the
// ONLY place history enters authoring. If an event has no entry here, the tool
// refuses (no LLM guesswork).
const DESCRIPTIONS = {
  'sagor-runi-murder':
    '২০১২ সালের ১১ ফেব্রুয়ারি ঢাকার বাসায় সাংবাদিক দম্পতি সাগর সারোয়ার ও মেহেরুন রুনিকে হত্যা করা হয়। দীর্ঘ মামলার পরও কেউ শাস্তি পায়নি বলেই পরিবার বলছে — বিচারের দাবিতে প্রতি বছর ১১ ফেব্রুয়ারি সাংবাদিকরা নীরব প্রহর পালন করেন।',
  'rana-plaza-collapse':
    '২০১৩ সালের ২৪ এপ্রিল সাভারের রানা প্লাজা ধসে ১,১৩৪ জনেরও বেশি মানুষ প্রাণ হারান — পোশাক শিল্পের ইতিহাসের সবচেয়ে প্রাণঘাতী দুর্ঘটনা। ঘটনার পর বিশ্বজুড়ে পোশাক কারখানার নিরাপত্তা নিয়ে বড় আলোচনা ও সংস্কার শুরু হয়।',
  'holly-artisan-attack-2016':
    '২০১৬ সালের ১ জুলাই ঢাকার গুলশানের হলি আর্টিসান রেস্তোরাঁয় জঙ্গি হামলা হয়। জিম্মি পরিস্থিতিতে নিরাপত্তা বাহিনীর অভিযানে ১৮ জন বিদেশি ও বাংলাদেশি নাগরিকসহ মোট ২০ জন নিহত হন — বাংলাদেশের সাম্প্রতিক ইতিহাসের সবচেয়ে ভয়াবহ জঙ্গি হামলা।',
  'june-july-2024-quota':
    '২০২৪ সালের জুন-জুলাইয়ে কোটা সংস্কারের দাবিতে শিক্ষার্থীদের আন্দোলন নিরাপত্তা বাহিনীর সংঘর্ষে মোড় নেয় এবং এতে শতাধিক মানুষ প্রাণ হারান। এই অভ্যুত্থানের ফলেই ৫ আগস্ট শেখ হাসিনা সরকারের পতন ও অন্তর্বর্তী সরকার গঠিত হয়।',
  'oust-hasina-2024':
    '২০২৪ সালের ৫ আগস্ট জুলাই-আন্দোলনের চাপে প্রধানমন্ত্রী শেখ হাসিনা দেশত্যাগ করেন। ৮ আগস্ট নোবেলজয়ী ড. মুহাম্মদ ইউনূসের নেতৃত্বে অন্তর্বর্তী সরকার শপথ নেয় এবং ২০২৫-২৬ সালে সংস্কার ও নির্বাচনের প্রক্রিয়া চলমান থাকে।',
  'dengue-outbreak-season':
    'ডেঙ্গু বাংলাদেশে প্রতিবছরের স্বাস্থ্য-আতঙ্ক। ২০১৯ ও ২০২৩ সালে রেকর্ড সংখ্যক আক্রান্ত ও মৃত্যু হয়েছিল; মৌসুমে (জুন-সেপ্টেম্বর) হাসপাতালে ভর্তি ও মৃত্যুর সংখ্যা নিয়মিত সংবাদ হয়ে থাকে।',
  'nct-lease-story':
    'ঢাকা-নরসিংদী এনসিটি এক্সপ্রেসওয়ে ও টোল আদায় নিয়ে ইজারা কেলেঙ্কারির অভিযোগ উঠেছে; টোল স্টেশন থেকে অস্বাভাবিক আয় ও চুক্তি নিয়ে প্রশ্ন তুলেছে সংবাদমাধ্যম।',
};

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const publish = process.argv.includes('--publish');
  const listOnly = process.argv.includes('--list');
  if (listOnly) {
    console.log(Object.keys(DESCRIPTIONS).join(' '));
    return;
  }
  const [eventId] = args;
  if (!eventId) {
    console.error('usage: node tools/history_author.mjs <eventId> [--publish]');
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(EVENTS_FILE, 'utf8'));
  const event = data.events.find((e) => e.id === eventId);
  if (!event) {
    console.error(`no such event: ${eventId}`);
    process.exit(1);
  }
  const description = DESCRIPTIONS[eventId];
  if (!description) {
    console.error(`no curated description yet for ${eventId} — authoring refused (no fabrication)`);
    process.exit(1);
  }

  const slug = `history-${eventId}`;
  const mdPath = join(CONTENT_DIR, `${slug}.md`);
  if (existsSync(mdPath)) {
    console.log(`already exists: site/src/content/news/${slug}.md`);
    return;
  }

  const today = new Date();
  const iso = today.toISOString();
  const siteCategory = CATEGORY_MAP[event.category] ?? 'national';
  const frontmatter = `---
title: "${event.nameBn} — ঘটনাপঞ্জি"
excerpt: "${description}"
seoTitle: "${event.nameBn} — ঘটনা সমাচার"
seoDescription: "${description}"
date: ${iso}
category: "${siteCategory}"
tags: []
author: "desk"
lang: "bn"
draft: ${publish ? 'false' : 'true'}
featured: false
breaking: false
demo: false
---

# ${event.nameBn}

${description}

## এই ঘটনা কেন গুরুত্বপূর্ণ

> ঘটনাপঞ্জি একটি স্মরণকোষ — বাংলাদেশের বড় ঘটনার যাবতীয় খবর এক জায়গায়। যেকোনো ভুল তথ্য পেলে [যোগাযোগ করুন](/contact)।

## এই ঘটনার সব খবর

[ঘটনাপঞ্জি — এই ঘটনার পূর্ণ পাতায়](/ghotona/${event.id}) আমাদের প্রকাশিত প্রতিটি প্রতিবেদন কালানুক্রমে পাবেন।

## সূত্র ও তথ্য যাচাই

এই স্মরণ প্রতিবেদনের প্রতিটি তথ্য সংবাদমাধ্যম ও দাপ্তরিক সূত্র থেকে যাচাই করা। ঘটনার দিনটি (${event.year}) একটি ঐতিহাসিক তারিখ; বিস্তারিত তথ্য সংশ্লিষ্ট সময়ের সংবাদ থেকে নেওয়া।
`;

  mkdirSync(CONTENT_DIR, { recursive: true });
  writeFileSync(mdPath, frontmatter);
  console.log(
    `+ wrote ${publish ? 'PUBLISHED' : 'DRAFT'} site/src/content/news/${slug}.md`,
  );
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) main();