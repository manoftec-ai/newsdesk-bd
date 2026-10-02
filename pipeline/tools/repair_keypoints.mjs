#!/usr/bin/env node
// tools/repair_keypoints.mjs — rebuild the "এক নজরে" box from the article's OWN body.
//
// 2026-10-02. The user reported that the box "sometimes gives an incomplete
// sentence" and does not really focus the news. Measured over the last 100
// articles: of ~500 bullets, 245 carried no terminal punctuation and 192 of
// those ended on a dangling token — a half-finished clause, not a point.
// Cause: bullets were cut from body sentences by asBullet(), whose connective
// list was too short, and nothing downstream checked the result.
//
// The generator fix cannot reach articles that are already published, so this
// repairs the live corpus. For each article the bullets are re-derived from
// that article's own body:
//   - only a complete sentence can become a bullet (bulletIsComplete)
//   - a bullet that merely restates the headline is dropped (no focus added)
//   - a bullet that duplicates the opening paragraph is dropped
//   - if nothing qualifies, the box is REMOVED. No box is honest; a broken one
//     is not.
//
// Safety: the edit must not introduce any NEW preflight failure. A plain
// "must pass" gate would block the whole legacy corpus, because hundreds of
// articles predate the current gate. Those are not ours to change silently
// here, so the rule is that the failure set must not grow.
//
// Text-only: no sharp, no network, so it runs on this phone.
//
// usage: node tools/repair_keypoints.mjs [--write] [--limit=N] [--report=path]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml, parseDocument, stringify as stringifyYaml } from 'yaml';
import { asBullet, bulletIsComplete, sentences } from '../lib/compose.mjs';
import { validatePublicArticle } from './site_preflight.mjs';

const SITE = resolve(import.meta.dirname, '../../site/src/content/news');
const arg = (n, d = null) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const WRITE = process.argv.includes('--write');
const LIMIT = Number(arg('limit', '0')) || 0;
const REPORT = arg('report');

const countComments = (s) => String(s).split('\n').filter((l) => /^\s*#/u.test(l)).length;

/**
 * The rewrite is only allowed if it is invisible apart from keyPoints: it must
 * parse, keep every other key with an identical value, and preserve the
 * front-matter comments verbatim.
 */
function preservesEverything(before, after) {
  try {
    const a = parseYaml(before) ?? {};
    const b = parseYaml(after) ?? {};
    const keys = (o) => Object.keys(o).filter((k) => k !== 'keyPoints').sort();
    if (keys(a).join('|') !== keys(b).join('|')) return false;
    for (const k of keys(a)) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
    }
    if (countComments(before) !== countComments(after)) return false;
    return true;
  } catch { return false; }
}

/** Every front-matter key except keyPoints must survive the rewrite. */
function sameKeysExceptKeyPoints(before, after) {
  try {
    const a = parseYaml(before) ?? {};
    const b = parseYaml(after) ?? {};
    const keys = (o) => Object.keys(o).filter((k) => k !== 'keyPoints').sort();
    if (keys(a).join('|') !== keys(b).join('|')) return false;
    for (const k of keys(a)) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
    }
    return true;
  } catch { return false; }
}

const parses = (s) => { try { parseYaml(s); return true; } catch { return false; } };

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// Openers that carry no news value on their own.
const NOISE = /^(এই|সেই|এদিকে|অন্যদিকে|গতকাল|আজ|এবার|গতবার|এরপর|আগেই|ইতিমধ্যে)\b/u;

function overlap(a, b) {
  const tok = (s) => new Set(
    String(s).toLowerCase().replace(/[^ঀ-৿\s]/gu, ' ').split(/\s+/u).filter((w) => w.length > 2),
  );
  const A = tok(a); const B = tok(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / A.size;
}

/**
 * True when a bullet is a strict PREFIX of a longer body sentence, i.e. the feed
 * truncated it mid-word ("...যাত্রা শ", "...প্রয়োজ"). The full sentence is still
 * in the body, so the honest fix is to drop the bullet rather than publish half
 * of it. Exported because the defect check and the corpus test need it too.
 */
export function isTruncatedBullet(bullet, sourceSents) {
  const b = String(bullet ?? '').trim();
  return (sourceSents ?? []).some(
    (s) => s.length > b.length + 2 && s.startsWith(b.slice(0, Math.max(12, b.length - 6))),
  );
}

/** Focus points for one article, derived only from its own body. */
export function rebuildKeyPoints(title, body, existing = []) {
  const plain = String(body ?? '')
    .replace(/^#+\s*.*$/gmu, '')
    .replace(/\*\*/g, '')
    .replace(/^>\s?/gmu, '');
  // What the reader has ALREADY read first is the opening sentence. Comparing
  // against 400 characters instead swallowed short articles whole and left
  // them with no box at all.
  const sourceSents = sentences(plain);
  const opening = sourceSents[0] ?? '';
  const truncated = (bullet) => isTruncatedBullet(bullet, sourceSents);
  const seen = new Set(existing.map((x) => String(x).trim()));
  const out = [];
  for (const s of sourceSents) {
    if (out.length >= 3) break;
    const bullet = asBullet(s);
    if (!bullet || !bulletIsComplete(bullet)) continue;
    if (seen.has(bullet)) continue;
    if (overlap(bullet, title) >= 0.6) continue;      // only restates the headline
    if (overlap(bullet, opening) >= 0.75) continue;   // already the opening paragraph
    if (truncated(bullet)) continue;                      // feed cut this mid-word
    if (NOISE.test(bullet) && bullet.split(/\s+/u).length < 9) continue;
    seen.add(bullet);
    out.push(bullet);
  }
  return out;
}

function renderKeyPoints(points) {
  if (!points.length) return '';
  return `keyPoints:\n${points.map((p) => `  - "${esc(p)}"`).join('\n')}`;
}

/**
 * Replace the keyPoints block in a front-matter string.
 *
 * The removal pattern consumes the key line plus EVERY following indented line,
 * not just "  - " items. Two shapes in the corpus break a naive pattern:
 *   - a bullet whose text wraps onto a continuation line
 *     ("  - ৬৩টি জেলায় ... (সকাল ১১টার দিকে\n    শুরু)")
 *   - keyPoints being the LAST key, so the final item has no trailing newline
 * Either one leaves a dangling fragment behind, which is invalid YAML and fails
 * the entire site build — which is exactly what happened on the first attempt.
 */
/**
 * Replace keyPoints in a front-matter string, byte-preserving wherever possible.
 *
 * A scanner GUESSES how far the keyPoints block runs; verification then DECIDES
 * whether that guess was right. Nothing here trusts a single mechanism, because
 * this corpus contains three shapes that break the obvious approach: bullets
 * wrapped onto a continuation line, a bullet whose quoted scalar spans a blank
 * line, and keyPoints written as a flow "[]".
 *
 * Verification is deliberately strict, because the failure mode is SILENT:
 * a block end guessed too early left an orphaned fragment that produced invalid
 * yaml and failed the entire site build, and one cut too late silently deleted
 * the front-matter comments that 291 of these files carry.
 */
export function setKeyPoints(fmText, points) {
  const block = points.length ? renderKeyPoints(points) : '';
  const text = String(fmText).replace(/\n+$/u, '');
  const guesses = [];

  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^keyPoints\s*:/u.test(l));
  if (at >= 0) {
    const rest = lines[at].slice(lines[at].indexOf(':') + 1).trim();
    // A flow value ("[]", "{}") occupies exactly one line. An EMPTY inline
    // value does not: "keyPoints:" followed by indented items is a BLOCK, and
    // treating it as single-line orphaned those items - which reparsed as
    // different data (it silently changed "draft" on economy-263) and was the
    // reason 40 articles could not be repaired at all.
    const nextIndented = at + 1 < lines.length
      && lines[at + 1].trim() !== '' && /^\s/u.test(lines[at + 1]);
    if (/^\[\]\s*$|^\{\}\s*$/u.test(rest) || (rest === '' && !nextIndented)) {
      guesses.push(lines.slice(0, at).concat(lines.slice(at + 1)).join('\n'));
    } else {
      guesses.push(lines.slice(0, at).join('\n'));                       // no block at all
      // Block form: the block runs through every following line that is blank
      // or INDENTED, and stops at the next top-level key. Guessing this wrong is
      // safe because verification rejects a bad guess - what is not safe is
      // guessing too short and leaving orphaned items behind.
      let stop = at + 1;
      while (stop < lines.length) {
        const l = lines[stop];
        if (l.trim() === '' || /^\s/u.test(l)) { stop += 1; continue; }
        break;
      }
      guesses.push(lines.slice(0, at).concat(lines.slice(stop)).join('\n'));
    }
  }

  for (const guess of guesses) {
    const joined = [guess.replace(/\n+$/u, ''), block].filter((x) => x !== '').join('\n');
    if (preservesEverything(text, joined)) return joined;
  }

  // No scanner guess survived. For a file with no front-matter comments a
  // re-serialise is harmless, so fall back to it; otherwise leave the file be.
  if (countComments(text) === 0) {
    const obj = parseYaml(text);
    if (obj && typeof obj === 'object') {
      if (points.length) obj.keyPoints = points; else delete obj.keyPoints;
      const out = stringifyYaml(obj).replace(/\n+$/u, '');
      if (preservesEverything(text, out)) return out;
    }
  }
  return text;
}

export function repairOne(content, { slug }) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  let front;
  try { front = parseYaml(m[1]) ?? {}; } catch { return null; }
  const body = content.slice(m[0].length);
  const existing = Array.isArray(front.keyPoints) ? front.keyPoints.map(String) : [];
  const before = existing.filter((p) => !bulletIsComplete(p)).length;
  const points = rebuildKeyPoints(front.title ?? '', body, existing);
  // SCOPE. Only an article whose CURRENT box is defective is touched. A
  // healthy box is left exactly as the desk wrote it: re-deriving every
  // article would swap good bullets for the picker's guesses, which is a
  // different (and worse) change than the one the user asked for.
  const bodySents = sentences(String(body).replace(/^#+\s*.*$/gmu, '').replace(/\*\*/g, ''));
  const allComplete = existing.length > 0
    && existing.every((p) => bulletIsComplete(p) && !isTruncatedBullet(p, bodySents));
  if (allComplete) return { changed: false, before, after: existing.length };
  // An article with no box at all is not broken — the box is optional, and
  // inventing one for 94 articles that never had one is scope creep, not a fix.
  if (!existing.length) return { changed: false, before, after: 0 };
  const nextFm = setKeyPoints(m[1], points);
  const next = `---\n${nextFm}\n---\n${body}`;

  // The edited document must still parse, and must not fail anything it did
  // not already fail before this edit.
  try { parseYaml(next.match(/^---\n([\s\S]*?)\n---\n/)[1]); }
  catch { return { changed: false, before, after: existing.length, blocked: 'frontmatter would not parse' }; }
  const wasFailing = new Set(validatePublicArticle(content, { slug, now: new Date() }).failureCodes);
  const added = validatePublicArticle(next, { slug, now: new Date() }).failureCodes
    .filter((c) => !wasFailing.has(c));
  if (added.length) return { changed: false, before, after: existing.length, blocked: `new failures: ${added.join(',')}` };
  if (!points.every((p) => bulletIsComplete(p))) return { changed: false, before, after: existing.length, blocked: 'incomplete bullet' };

  if (nextFm === m[1]) {
    // setKeyPoints refused every candidate extent, so nothing was rewritten.
    // Reporting "changed" here claimed work that never landed: the tool wrote
    // the original bytes back and the article stayed broken.
    return { changed: false, before, after: existing.length, blocked: 'KEYPOINT_BLOCK_UNREWRITABLE' };
  }
  return { changed: true, before, after: points.length, points, content: next };
}

export function repairAll({ siteDir = SITE, write = WRITE, limit = LIMIT } = {}) {
  const files = existsSync(siteDir) ? readdirSync(siteDir).filter((f) => f.endsWith('.md')).sort() : [];
  const summary = {
    scanned: 0, changed: 0, boxRemoved: 0, boxRepaired: 0, unchanged: 0,
    blocked: [], writes: [],
  };
  for (const f of files) {
    if (limit && summary.changed >= limit) break;
    const full = join(siteDir, f);
    const content = readFileSync(full, 'utf8');
    const slug = f.slice(0, -3);
    const res = repairOne(content, { slug });
    if (!res) continue;
    summary.scanned++;
    if (res.blocked) { summary.blocked.push({ slug, codes: res.blocked }); continue; }
    if (!res.changed) { summary.unchanged++; continue; }
    summary.changed++;
    if (res.after === 0) summary.boxRemoved++;
    else if (res.before > 0) summary.boxRepaired++;
    if (write && res.content) { writeFileSync(full, res.content, 'utf8'); summary.writes.push(slug); }
  }
  return summary;
}

function main() {
  const s = repairAll({});
  console.log(
    `repair_keypoints: scanned=${s.scanned} changed=${s.changed} `
    + `(bullets fixed=${s.boxRepaired}, box removed=${s.boxRemoved}) unchanged=${s.unchanged} blocked=${s.blocked.length}`,
  );
  if (s.blocked.length) {
    console.log('blocked (left untouched):');
    for (const b of s.blocked.slice(0, 10)) console.log(`  ${b.slug}: ${b.codes}`);
  }
  if (WRITE) console.log(`written: ${s.writes.length} file(s)`);
  else console.log('DRY RUN - add --write to apply');
  if (REPORT) writeFileSync(REPORT, `${JSON.stringify(s, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
