// lib/reverify.mjs — CORRECTIONS + AUTOMATIC RE-VERIFICATION ENGINE (P0).
//
// Fully automatic, no human touch. Re-checks every published story against the
// LIVE claims/verdict state and, when evidence has changed for the worse, appends
// a dated CORRECTION to the story frontmatter (corrected:true, updated, a note,
// and an "updates[]" history entry). Never edits the body or headline — strictly
// additive frontmatter metadata.
//
// Triggers (deterministic — each maps to a real, observable deterioration):
//   R1 verdict no longer passed            (verify gate now blocks this cluster)
//   R2 badge downgraded                    (confirmed→partial etc., vs published)
//   R3 a claim turned CONFLICTING          (unresolved contradiction in evidence)
//   R4 headline now overclaims             (strongest claim conflict / no support)
import { readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { setKey, appendUpdates } from '../tools/tracked_watcher.mjs';

export const BADGE_RANK = { suspect: 0, partial: 1, verified: 2, confirmed: 3 };

export function loadFrontmatter(mdPath) {
  const text = readFileSync(mdPath, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) throw new Error(`no frontmatter: ${mdPath}`);
  const body = text.slice(m[0].length).replace(/^\r?\n/, '');
  return { fm: m[1], body, front: parseYaml(m[1]) };
}

// Compare published verification badge vs current verdict badge rank.
export function badgeDropped(publishedBadge, currentBadge) {
  if (!publishedBadge || !currentBadge) return false;
  const pb = BADGE_RANK[publishedBadge];
  const cb = BADGE_RANK[currentBadge];
  if (pb === undefined || cb === undefined) return false;
  return cb < pb;
}

// Detect all reversal reasons for one story from its live state.
export function detectCorrections({ front = {}, verdict = null, claims = [], headlineStatus = null, members = [] }) {
  const notes = [];
  if (!verdict) return notes;

  // R1 — publish gate now blocks this cluster
  if (verdict.status !== 'passed') notes.push('যাচাই-অবস্থা আর পাস নয় — নতুন সূত্র-ভিত্তিতে সংবাদটি এখন নিশ্চিত নয়।');

  // R2 — badge downgraded vs what we published
  const publishedBadge = front?.verification?.badge ?? null;
  if (badgeDropped(publishedBadge, verdict.badge)) {
    notes.push(`যাচাই ব্যাজ কমেছে (${publishedBadge} → ${verdict.badge}) — নতুন প্রমাণে আস্থার মাত্রা দুর্বল হয়েছে।`);
  }

  // R3 — an unresolved contradiction surfaced in this cluster's claims
  const conflicts = (claims ?? []).filter(
    (c) => c && (c.status === 'CONFLICTING' || (c.contradiction_count || 0) > 0),
  );
  for (const c of conflicts.slice(0, 2)) {
    notes.push(`সূত্রে দ্বন্দ্ব ধরা পড়েছে («${String(c.claim_text ?? '').slice(0, 60)}») — দ্বন্দ্ব সমাধান না হওয়া পর্যন্ত বিষয়টি নিশ্চিত বলে গণ্য নয়।`);
  }

  // R4 — headline now overclaims the strongest claim
  if (headlineStatus === 'overclaim') {
    notes.push('শিরোনাম দাবির চেয়ে বেশি প্রতিশ্রুতি দিচ্ছে — শিরোনামটি সংশোধন হওয়া উচিত।');
  }

  return [...new Set(notes)];
}

// Write a correction into story frontmatter (additive). Idempotent: a note that
// already exists in the updates[] history is never appended twice. Validates the
// edited frontmatter with a real YAML parse before writing.
export function applyCorrection({ mdPath, notes, isoDate = null, label = 'সংশোধন' }) {
  const now = isoDate ?? new Date().toISOString();
  const { fm, body, front } = loadFrontmatter(mdPath);
  const existing = new Set((front.updates ?? []).map((u) => String(u.note ?? '')));
  const fresh = notes.filter((n) => !existing.has(n) && !String(front.correctionNote ?? '').includes(n));
  if (!fresh.length) return { changed: false, notes: 0 }; // nothing new to correct

  let out = fm;
  out = setKey(out, 'corrected', 'true', 'date');
  out = setKey(out, 'updated', now, 'date');
  const note = fresh[0];
  out = setKey(out, 'correctionNote', JSON.stringify(note), 'date');
  out = appendUpdates(out, [{ date: now, note, label }]);
  let changed = out !== fm;

  const check = parseYaml(out);
  if (String(check.corrected) !== 'true') throw new Error(`corrected write failed for ${mdPath}`);
  if (fresh.length && !(check.updates ?? []).some((u) => u.note === fresh[0]))
    throw new Error(`updates write failed for ${mdPath}`);
  if (!String(check.correctionNote ?? '').includes(fresh[0] ?? ''))
    throw new Error(`correctionNote write failed for ${mdPath}`);

  if (!changed && out === fm) return { changed: false, notes: 0 };
  writeFileSync(mdPath, `---\n${out}\n---\n\n${body}`);
  return { changed: true, notes: fresh.length, note: fresh[0] ?? null };
}

export function storyFileExists(mdPath) { return existsSync(mdPath); }
export { join };