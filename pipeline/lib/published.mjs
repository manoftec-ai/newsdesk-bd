// lib/published.mjs — guard against duplicate stories already published on the site.
// A re-clustered event can produce a NEW brief with the SAME normalized headline as an
// article already on the site (observed: the NCP fuel-protest story was auto-published
// as politics-273/277/278/282 and the Saifuddin Asian-Games story as sports-255/257/258).
// These helpers compare a candidate headline against what is already live so briefs,
// picks and finalization all skip repeats. Only exact normalized-title matches within a
// recency window count as duplicates, so recurring daily headlines on different days
// still pass.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DUP_WINDOW_MS = 3 * 86400e3; // treat as dup only within 72h recency

// Normalize a title for comparison: lowercase, drop punctuation/whitespace, keep letters
// and digits (Unicode-aware, Bengali-safe). Exact normalized equality = same story.
export function normTitle(t) {
  return String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// Scan the site news dir into Map<normTitle, ISOdate>. Missing/unreadable dir -> empty.
export function loadPublishedTitles(siteDir) {
  const map = new Map();
  let files = [];
  try {
    files = readdirSync(siteDir).filter((f) => f.endsWith('.md'));
  } catch {
    return map;
  }
  for (const f of files) {
    try {
      const txt = readFileSync(join(siteDir, f), 'utf8');
      const t = txt.match(/^title:\s*"?([^"\n]+)/m)?.[1];
      const d = txt.match(/^date:\s*([^\n]+)/m)?.[1]?.trim() ?? '';
      if (!t) continue;
      const key = normTitle(t);
      if (!map.has(key) || (d && !map.get(key))) map.set(key, d);
    } catch {
      // unreadable article file -> ignore
    }
  }
  return map;
}

// True when a candidate (headline, event date) duplicates an already-published title.
// If the existing article's date is unparseable we err on the side of "duplicate".
export function isTitleDuplicate(headline, briefDate, published, { windowMs = DUP_WINDOW_MS } = {}) {
  const existingDate = published.get(normTitle(headline));
  if (existingDate === undefined) return false;
  const brief = briefDate ? new Date(briefDate).getTime() : Date.now();
  const existing = existingDate ? new Date(existingDate).getTime() : NaN;
  if (!Number.isFinite(existing)) return true;
  return Math.abs(brief - existing) <= windowMs;
}