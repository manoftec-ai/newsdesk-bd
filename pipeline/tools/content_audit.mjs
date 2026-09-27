#!/usr/bin/env node
// Audit every published article for the defect classes found in national-532.
//
// 2026-09-27. The user reported national-532 as "rubbish" and could not tell
// what was wrong with it. Measuring instead of guessing turned up seven distinct
// classes, none of which any existing gate covered:
//
//   BODY_OFF_HEADLINE  the body is about different stories than the headline.
//                      national-532's headline was the DMP gang list while its
//                      body ran to four unrelated stories. Nothing checked this:
//                      the coherence guard compares members to EACH OTHER, and
//                      both members were the same story, so it passed happily
//                      while the lead text underneath was a different digest.
//   DATELINE_IN_TITLE  an outlet's on-site dateline used as the headline, e.g.
//                      "পত্রিকা (২৫শে সেপ্টেম্বর): '…'" - the dateline is not the
//                      story, and the single quotes make it look quoted.
//   MOJIBAKE          corrupted Bengali conjuncts, e.g. "র্স্মাট" for "স্মার্ট",
//                      where a stray ra+virama is glued onto the real letters.
//   MIXED_LANGUAGE    a Bengali key point or paragraph with raw English, or one
//                      starting mid-word ("ের দ্বিতীয় প্রধান খবর— …").
//   SELF_CORROBORATION the same outlet listed twice as two sources, so the panel
//                      says "<outlet> এছাড়া একই তথ্য প্রকাশ করেছে" - an outlet
//                      cannot corroborate itself.
//   OFF_TOPIC_TAGS    tags with nothing to do with the story (cricket on a
//                      story about criminal gangs).
//   NON_BENGALI_TITLE a headline with no Bengali at all, on a Bengali site.
//
//   node tools/content_audit.mjs [--json] [--limit=N]
//
// Findings are reported, never auto-repaired: repairing prose silently is how a
// story ends up saying something its source did not. The caller decides.

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const HERE = import.meta.dirname;
const SITE = resolve(HERE, '../../site/src/content/news');

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const asJson = process.argv.includes('--json');
const limit = Number(arg('limit', '0')) || Infinity;

const BENGALI = /[ঀ-৿]/u;
const LATIN_WORD = /\b[A-Za-z]{3,}\b/u;

function tokens(s) {
  return new Set(
    String(s ?? '')
      .toLowerCase()
      .replace(/[^\u0980-\u09FF\s]/gu, ' ')
      .split(/\s+/u)
      .filter((w) => w.length > 2),
  );
}

/** "পত্রিকা (২৫শে সেপ্টেম্বর):" / "ঢাকা, ২৫ সেপ্টেম্বর:" — an outlet dateline. */
const DATELINE = /^[ঀ-৿\s]{0,24}\(\s*[ঀ-৿\d]{1,14}\s*\)\s*[:–—]/u;

// A paragraph that opens on a combining mark or a virama was cut mid-word by
// the feed. Anchoring on those code points rather than on "does not start with a
// letter" matters: a first version flagged 150 articles, because paragraphs
// legitimately start with a digit, a quote or an acronym.
const MIDWORD_START = /^[ঁঃ]|^[া-্]/u;

// Structurally impossible Bengali. These two are the only mojibake signals that
// can be trusted without a dictionary.
//
// The obvious candidate - a ra followed by a virama, "র্" - is USELESS: it
// occurs in 396 of 401 articles, because that is how কর্ম, কর্মজগৎ and every
// other conjunct starting with r is written. An earlier version of this audit
// flagged 397 articles as mojibake on that pattern alone, which is how a noisy
// audit teaches people to ignore it.
//
// A genuine corruption like national-532's "র্স্মাট" (for "স্মার্ট") inserts a
// spurious ra+virama in front of a valid conjunct, and detecting THAT needs a
// conjunct dictionary. So: report the two signals that are provably wrong, and
// do not pretend to catch the rest.
// Outlet names, read from the source config rather than hardcoded, so the
// dateline check cannot drift when an outlet is renamed.
const OUTLET_NAMES = new Set(
  (() => {
    try {
      const yaml = readFileSync(resolve(HERE, '../config/sources.yaml'), 'utf8');
      const names = new Set();
      for (const m of yaml.matchAll(/^\s*nameBn:\s*(.+)$/gmu)) names.add(m[1].trim().replace(/^"|"$/g, ''));
      return names;
    } catch {
      return new Set();
    }
  })(),
);
const BENGALI_OUTLET_PREFIX = /^[ঀ-৿]/u;

const DOTTED_RA = /[ৰৱ]/u; // U+09F0 / U+09F1 - never in Bengali news prose
const DOUBLE_VIRAMA = /্্/u;

function frontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/u);
  return m ? m[1] : '';
}
function field(fm, name) {
  const m = fm.match(new RegExp(`^${name}:\\s*"?([^"\\n]*)"?\\s*$`, 'mu'));
  return m ? m[1].trim() : '';
}
function listField(fm, name) {
  const m = fm.match(new RegExp(`^${name}:\\s*\\n((?:\\s+-[^\\n]*\\n)+)`, 'mu'));
  if (!m) return [];
  return [...m[1].matchAll(/-\s*"?([^"\n]*)"?\s*$/gmu)].map((x) => x[1].trim()).filter(Boolean);
}
function blockAfter(fm, name) {
  const i = fm.indexOf(`\n${name}:`);
  if (i < 0) return '';
  const rest = fm.slice(i + 1);
  const end = rest.search(/\n[a-zA-Z]+:/u);
  return end < 0 ? rest : rest.slice(0, end);
}

function audit(slug, raw) {
  const fm = frontmatter(raw);
  const body = raw.replace(/^---\n[\s\S]*?\n---/u, '').trim();
  const title = field(fm, 'title');
  const excerpt = field(fm, 'excerpt');
  const tags = listField(fm, 'tags');
  const srcBlock = blockAfter(fm, 'sources');
  const sources = [...srcBlock.matchAll(/name:\s*"([^"\n]*)"/gu)].map((m) => m[1].trim());
  const out = [];

  // 1. body about the headline
  const H = tokens(title);
  const B = tokens(`${body} ${excerpt}`);
  if (H.size && B.size) {
    let hit = 0;
    for (const w of H) if (B.has(w)) hit++;
    const coverage = hit / H.size;
    if (coverage < 0.18) {
      out.push({ code: 'BODY_OFF_HEADLINE', detail: `body shares ${Math.round(coverage * 100)}% of headline vocabulary` });
    }
  }

  // 2. dateline used as the headline.
  //    The prefix must be a real OUTLET name followed by a date. A first version
  //    matched any "something (1234):" and flagged 20 articles, all of them
  //    history explainers whose titles are legitimately "অ্যাপোলো ১১ (১৯৬৯): …".
  const datelinePrefix = title.match(/^([^:()]{2,40})\s*\(\s*[^)]*\)\s*:/u);
  if (datelinePrefix && OUTLET_NAMES.has(datelinePrefix[1].trim())) {
    out.push({ code: 'DATELINE_IN_TITLE', detail: datelinePrefix[0].trim() });
  }
  if (/^['“”]/u.test(title)) {
    out.push({ code: 'QUOTED_TITLE', detail: title.slice(0, 60) });
  }

  // 3. mojibake - only structurally impossible sequences
  if (DOTTED_RA.test(body) || DOTTED_RA.test(excerpt)) {
    out.push({ code: 'MOJIBAKE', detail: 'dotted ra (U+09F0/U+09F1) in prose' });
  } else if (DOUBLE_VIRAMA.test(body)) {
    out.push({ code: 'MOJIBAKE', detail: 'double virama, which Bengali cannot contain' });
  }

  // 4. mixed language / mid-word opener
  const paras = body.split(/\n\s*\n/u).map((p) => p.trim()).filter(Boolean);
  for (const p of paras) {
    const prose = p.replace(/\]\([^)]*\)/gu, '').replace(/https?:\/\/\S+/gu, '');
    if (LATIN_WORD.test(prose) && BENGALI.test(prose)) {
      const latin = (prose.match(/[A-Za-z]{3,}/gu) ?? []).length;
      if (latin >= 2) { out.push({ code: 'MIXED_LANGUAGE', detail: prose.slice(0, 60) }); break; }
    }
  }
  for (const p of paras) {
    if (p.length > 25 && MIDWORD_START.test(p) && BENGALI.test(p)) {
      out.push({ code: 'MIDWORD_OPENER', detail: p.slice(0, 60) });
      break;
    }
  }

  // 5. source quality. The real defect behind the earlier self-corroboration
  //    label is that a /video/ url was counted as an independent source, so a
  //    panel said "প্রথম আলো এছাড়া একই তথ্য প্রকাশ করেছে" when the only other
  //    "source" was a prothomalo video. A non-article url is not corroboration.
  const srcUrls = [...srcBlock.matchAll(/url:\s*"([^"\n]*)"/gu)].map((m) => m[1]);
  const nonArticle = srcUrls.filter((u) => /\/(video|photo|live|multimedia|webcam)\//i.test(u));
  if (nonArticle.length) {
    out.push({ code: 'NON_ARTICLE_SOURCE', severity: `${nonArticle.length}/${srcUrls.length}`, detail: `${nonArticle.length} of ${srcUrls.length} sources are video/photo urls: ${nonArticle[0].slice(0, 52)}` });
  }
  if (new Set(sources).size === 1 && sources.length > 1) {
    out.push({ code: 'SELF_CORROBORATION', severity: String(sources.length), detail: sources.join(', ') });
  }

  // 6. tags with no connection to the story
  if (tags.length >= 5) {
    const T = tokens(`${title} ${excerpt} ${body.slice(0, 600)}`);
    const loose = tags.filter((t) => {
      const parts = t.toLowerCase().split('-');
      return !parts.some((p) => p.length > 2 && T.has(p));
    });
    if (loose.length >= 3) {
      out.push({ code: 'OFF_TOPIC_TAGS', detail: loose.join(', ') });
    }
  }

  // 7. no Bengali in the headline
  if (title && !BENGALI.test(title)) {
    out.push({ code: 'NON_BENGALI_TITLE', detail: title.slice(0, 60) });
  }

  return out;
}

const files = readdirSync(SITE).filter((f) => f.endsWith('.md'));
const findings = [];
for (const f of files) {
  const slug = f.replace(/\.md$/, '');
  const issues = audit(slug, readFileSync(join(SITE, f), 'utf8'));
  if (issues.length) findings.push({ slug, issues });
}

if (asJson) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  const byCode = new Map();
  for (const f of findings) for (const i of f.issues) byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1);
  console.log(`  articles scanned : ${files.length}`);
  console.log(`  articles flagged : ${findings.length}`);
  console.log('  by defect:');
  for (const [code, n] of [...byCode].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}  ${code}`);
  }
  console.log('');
  for (const f of findings.slice(0, limit)) {
    console.log(`  ${f.slug}`);
    for (const i of f.issues) console.log(`      ${i.code}  ${i.detail}`);
  }
}

const CODES = new Set([
  'BODY_OFF_HEADLINE', 'DATELINE_IN_TITLE', 'MOJIBAKE', 'MIXED_LANGUAGE',
  'MIDWORD_OPENER', 'SELF_CORROBORATION', 'OFF_TOPIC_TAGS', 'NON_BENGALI_TITLE',
  'NON_ARTICLE_SOURCE', 'QUOTED_TITLE',
]);
for (const f of findings) {
  for (const i of f.issues) {
    if (!CODES.has(i.code)) {
      console.error(`  unknown defect code: ${i.code}`);
      process.exit(2);
    }
  }
}
process.exitCode = 0;
