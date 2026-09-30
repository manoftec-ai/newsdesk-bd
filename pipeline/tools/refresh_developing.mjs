#!/usr/bin/env node
// tools/refresh_developing.mjs — developing lane: watch → enrich → upgrade.
//
// WHY (2026-09-30): promote_developing.mjs puts a first sighting on the site
// immediately, on one source. That is only honest if the desk then goes looking
// for a second one, and this is that desk. The user's rule for a published
// first-sighting:
//
//   0-2h   do not touch it. Fresh events are still moving; a rewrite now would
//          publish a half-formed story and then rewrite it again.
//   2-8h   if another outlet reports it, add what that outlet actually says,
//          attributed, and upgrade the badge once the cluster's own verdict
//          earns it. If nothing new arrives, keep watching — no edit at all.
//   >8h    stop. Whatever it says is what it says; it is left as it is.
//
// Two rules make this safe rather than clever:
//   * Every addition is attributed text from the new outlet's own report. No
//     synthesis, no invented facts, nothing the source did not say.
//   * Nothing is written without --write, every rewrite must still pass the
//     site preflight, and a story with an unresolved conflict is never upgraded
//     — it is left alone for a human.
//
// The watch is idempotent: an outlet already listed in `sources` is not new, so
// a story this tool has touched is not touched again next cycle. That is also
// what keeps deploys at zero on quiet cycles — the Vercel guard skips a deploy
// when site/ is byte-identical to what is live.
//
// usage: node tools/refresh_developing.mjs [--write] [--limit=N] [--quiet-hours=2] [--recycle-hours=6]
import { readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { openDb, DB_PATH } from '../lib/db.mjs';
import { loadTrust } from '../lib/verify.mjs';
import { validatePublicArticle } from './site_preflight.mjs';

const SITE_DIR = resolve(import.meta.dirname, '../../site/src/content/news');

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const WRITE = process.argv.includes('--write');
const QUIET_HOURS = Number(arg('quiet-hours', '2')) || 2;
const RECYCLE_HOURS = Number(arg('recycle-hours', '6')) || 6;
const LIMIT = Number(arg('limit', '20')) || 20;
const MAX_NOTES_PER_RUN = 3;
const QUIET_MS = QUIET_HOURS * 3_600_000;
const RECYCLE_MS = RECYCLE_HOURS * 3_600_000;

// --- pure logic (exported for tests) ---------------------------------------

// Which part of the watch clock an article is in. A publishedAt in the future
// is not watchable (clock skew), so it is treated as closed rather than as
// "brand new".
export function phaseOf(ageMs, { quietMs = QUIET_MS, recycleMs = RECYCLE_MS } = {}) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'frozen';
  if (ageMs < quietMs) return 'quiet';
  if (ageMs < quietMs + recycleMs) return 'recycle';
  return 'frozen';
}

// New = an outlet this article does not already credit. A repeat URL is not new
// (idempotence); a repeat outlet with a different URL is a genuinely new report,
// so it counts. Untrusted outlets never count: the first sighting lane only
// admits `top` sources, and promoting a stranger's blog to a second source would
// be exactly the failure the badge exists to prevent.
export function freshReports(members, { knownUrls = [], trusted = null, publishedAtMs = 0 } = {}) {
  const seen = new Set(knownUrls);
  const out = [];
  for (const m of members) {
    if (!m?.url || seen.has(m.url)) continue;
    if (m.added_at && publishedAtMs && new Date(m.added_at).getTime() <= publishedAtMs) continue;
    if (trusted && !trusted.has(m.source_id)) continue;
    seen.add(m.url);
    out.push(m);
  }
  return out;
}

// One decision, no side effects. `verdict` is the cluster's own row from the
// verdicts table — the same evaluation the normal publish path uses, so the
// upgrade bar is not lower here than anywhere else.
export function decideAction({ phase, fresh = [], verdict = null, conflicts = 0 }) {
  if (phase === 'quiet') return { action: 'hold', reason: 'QUIET_WINDOW' };
  if (phase === 'frozen') return { action: 'freeze', reason: 'WINDOW_CLOSED' };
  if (conflicts > 0) return { action: 'hold', reason: 'CONFLICT_HOLD', conflicts };
  if (!fresh.length) return { action: 'hold', reason: 'RECYCLE_WAITING' };
  const earned = verdict && verdict.status === 'passed'
    && (verdict.badge === 'confirmed' || verdict.badge === 'verified');
  return earned
    ? { action: 'upgrade', reason: `VERDICT_${verdict.badge.toUpperCase()}`, fresh }
    : { action: 'annotate', reason: 'NEW_SOURCE_NOT_YET_CORROBORATED', fresh };
}

const esc = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// `«Headline» — Outlet`, the same shape the tracked-story watcher uses: the
// outlet's own words, with the outlet named.
export function noteFor({ headline, outlet, url, at, label = 'যাচাই আপডেট' }) {
  const link = url ? ` ([উৎস](${url}))` : '';
  return {
    date: at,
    note: `নতুন সূত্র জানিয়েছে: «${String(headline ?? '').trim()}» — ${outlet}${link}`,
    label,
    // kept alongside so applyRefresh can render the body line from the same
    // object instead of re-deriving it
    headline: String(headline ?? '').trim(),
    outlet,
    url,
  };
}

// End offset of the YAML block that starts at `start`: every following line
// that is blank or indented deeper than the key it belongs to.
function blockEnd(fm, start) {
  const rest = fm.slice(start);
  const lines = rest.split('\n');
  let used = 0;
  for (const line of lines) {
    if (line.trim() === '') { used += line.length + 1; continue; }
    if (line.search(/\S/) > 0) { used += line.length + 1; continue; }
    break;
  }
  return start + used;
}

// Append items to a block-style YAML list under `key`, preserving the rest of
// the document byte for byte (comments and formatting included). `indent` is
// the key's own indentation, so nested lists (verification.evidence,
// verification.upgrade) are extended in place instead of being duplicated at
// the top level.
function appendListItems(fm, key, lines, { indent = '', parent = null } = {}) {
  const head = new RegExp(`^${indent}${key}:[ \\t]*(.*)$`, 'm');
  const m = head.exec(fm);
  if (!m) {
    // New key. A nested key has to land inside its parent's block — appending
    // it at the end of the document would put it outside that mapping and the
    // frontmatter would not parse.
    const pad = ' '.repeat(indent.length);
    const block = lines.map((l) => (indent ? pad + l : l));
    const anchor = parent
      ? new RegExp(`^${parent}:[ \\t]*$`, 'm').exec(fm)
      : null;
    if (anchor) {
      const at = blockEnd(fm, anchor.index + anchor[0].length);
      const tail = fm.slice(at).replace(/^\n/, '');
      return `${fm.slice(0, at)}${indent}${key}:\n${block.join('\n')}\n${tail}`;
    }
    return `${fm.replace(/\n*$/, '')}\n${indent}${key}:\n${block.join('\n')}\n`;
  }
  const rest = fm.slice(m.index + m[0].length);
  const restLines = rest.split('\n');
  // The list body is everything indented deeper than its key (blanks included).
  let end = 0;
  while (end < restLines.length) {
    const line = restLines[end];
    if (line.trim() === '') { end += 1; continue; }
    if (/^\s/.test(line) && line.search(/\S/) > indent.length) { end += 1; continue; }
    break;
  }
  const bodyLines = restLines.slice(0, end);
  // frontMatter writes an empty list as a lone `[]` line; drop it or the new
  // items would sit next to it and the document would not parse.
  const kept = bodyLines.filter((l) => l.trim() !== '[]');
  const rebuilt = [
    ...kept,
    ...(kept.length && kept[kept.length - 1].trim() === '' ? [] : ['']),
    ...lines,
    '',
    ...restLines.slice(end),
  ].join('\n');
  return `${fm.slice(0, m.index + m[0].length)}\n${rebuilt}`;
}

function setScalar(fm, key, raw, { after } = {}) {
  const re = new RegExp(`^(\\s*)${key}:[ \\t].*$`, 'm');
  const m = re.exec(fm);
  if (m) return fm.replace(re, (line, indent) => `${indent}${key}: ${raw}`);
  const anchor = after && new RegExp(`^${after}:.*$`, 'm').exec(fm);
  if (!anchor) return `${fm.replace(/\n*$/, '')}\n${key}: ${raw}\n`;
  const at = anchor.index + anchor[0].length;
  return `${fm.slice(0, at)}\n${key}: ${raw}${fm.slice(at)}`;
}

// Rewrite an article in place: keep the original publish moment, record the
// update, credit the new outlet, and (only when the verdict earned it) lift the
// badge. Returns the new markdown; throws if the result is not still a valid
// publishable article.
export function applyRefresh(content, { at, notes = [], upgrade = null, slug = 'story' } = {}) {
  const parts = splitFrontmatter(content);
  if (!parts) throw new Error('frontmatter not found');
  let { fm, body } = parts;

  const freshOutlets = notes.map((n) => n.outlet);
  for (const n of notes) {
    fm = appendListItems(fm, 'sources', [`  - name: "${esc(n.outlet)}"`, `    url: "${esc(n.url)}"`]);
  }
  fm = appendListItems(fm, 'updates', notes.flatMap((n) => [
    `  - date: "${esc(n.date)}"`,
    `    note: "${esc(n.note)}"`,
    `    label: "${esc(n.label)}"`,
  ]));

  if (upgrade) {
    fm = setScalar(fm, 'badge', `"${esc(upgrade.badge)}"`);
    fm = setScalar(fm, 'uncorroborated', 'false');
    fm = appendListItems(fm, 'evidence', freshOutlets.flatMap((o) => [
      `    - type: "paper"`,
      `      label: "corroboration (${o})"`,
    ]), { indent: '  ', parent: 'verification' });
    fm = appendListItems(fm, 'upgrade', [
      `    at: "${esc(at)}"`,
      `    from: "${esc(upgrade.from)}"`,
      `    to: "${esc(upgrade.badge)}"`,
      `    added: "${esc(freshOutlets.join(', '))}"`,
    ], { indent: '  ', parent: 'verification' });
    fm = setScalar(fm, 'developing', 'false', { after: 'publishedAt' });
  }
  // publishedAt is deliberately never touched: it is the watch clock's zero,
  // and moving it would restart the window on every update.
  fm = setScalar(fm, 'updated', at, { after: 'publishedAt' });

  const para = notes.length
    ? `\n\n**হালনাগাদ:** ${notes.map((n) => `«${n.headline}» — ${n.outlet}${n.url ? ` ([উৎস](${n.url}))` : ''}`).join('; ')}।`
    : '';
  const badgeNote = upgrade
    ? `\n\n**যাচাই:** নতুন স্বাধীন সূত্র যুক্ত হওয়ায় এই প্রতিবেদনটি এখন «${upgrade.badge === 'verified' ? 'যাচাইকৃত' : 'নিশ্চিত'}» হিসেবে চিহ্নিত।`
    : '';
  const next = `---\n${fm.trimEnd()}\n---\n\n${body.trimEnd()}${para}${badgeNote}\n`;
  const check = validatePublicArticle(next, { slug, now: new Date(at) });
  if (!check.pass) {
    const detail = check.errors?.map((e) => e.message).filter(Boolean).join(' | ') ?? '';
    throw new Error(`preflight rejected the refresh: ${check.failureCodes.join(',')} ${detail}`.trim());
  }
  return next;
}

// --- driver ----------------------------------------------------------------

const OUTLET_NAMES = { prothomalo: 'প্রথম আলো', kalerkantho: 'কালের কথা', jugantor: 'যুগান্তর', thedailystar: 'The Daily Star', dhakatribune: 'ঢাকা ট্রিবিউন', bbcbangla: 'বিবিসি বাংলা', ittefaq: 'ইত্তেফাক', bsnews: 'বিএস নিউজ', somoytv: 'সময়টিভি', cnn: 'সিএনএন', UNB: 'ইউএনবি', agency: 'সংবাদদপ্তর' };
const outletName = (id) => OUTLET_NAMES[id] ?? id;

export function splitFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return null;
  return { fm: m[1], body: content.slice(m[0].length) };
}

// Same discipline as finalize_stories' atomicWrite: a refresh that dies
// mid-write must not leave a half-written article on the site.
function atomicWrite(filePath, content) {
  const tmp = join(dirname(filePath), `.${filePath.split('/').pop()}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(tmp, content, { encoding: 'utf8', flag: 'wx' });
    renameSync(tmp, filePath);
  } catch (error) {
    try { unlinkSync(tmp); } catch { /* already gone */ }
    throw error;
  }
}

export function refreshDeveloping({
  siteDir = SITE_DIR,
  dbPath = DB_PATH,
  db: injectedDb = null,
  now = new Date().toISOString(),
  quietMs = QUIET_MS,
  recycleMs = RECYCLE_MS,
  limit = LIMIT,
  write = WRITE,
} = {}) {
  const nowMs = new Date(now).getTime();
  const trust = loadTrust();
  const trusted = new Set(Object.entries(trust.sources ?? {})
    .filter(([, rep]) => rep === 'top' || rep === 'official' || rep === 'agency')
    .map(([id]) => id));
  const db = injectedDb ?? openDb(dbPath);
  const report = { at: now, scanned: 0, held: [], upgraded: [], annotated: [], skipped: [] };
  try {
    const files = existsSync(siteDir)
      ? readdirSync(siteDir).filter((f) => f.endsWith('.md')).map((f) => join(siteDir, f))
      : [];
    for (const file of files) {
      if (report.held.length + report.upgraded.length + report.annotated.length >= limit) break;
      const content = readFileSync(file, 'utf8');
      const parts = splitFrontmatter(content);
      if (!parts) continue;
      let front;
      try { front = parseYaml(parts.fm) ?? {}; } catch { continue; }
      if (front.developing !== true || !front.publishedAt) continue;
      report.scanned += 1;
      const slug = front.publication?.slug ?? file.split('/').pop().slice(0, -3);
      const ageMs = nowMs - new Date(front.publishedAt).getTime();
      const phase = phaseOf(ageMs, { quietMs, recycleMs });
      if (phase !== 'quiet' && phase !== 'recycle') {
        report.skipped.push({ slug, reason: 'WINDOW_CLOSED', ageHours: +(ageMs / 3_600_000).toFixed(1) });
        continue;
      }
      const clusterId = Number(front.verification?.clusterId ?? front.publication?.clusterId);
      if (!Number.isInteger(clusterId) || clusterId < 1) {
        report.skipped.push({ slug, reason: 'NO_CLUSTER_ID' });
        continue;
      }
      const members = db.prepare(`
        SELECT cm.source_id, cm.added_at, r.url, r.title, r.published_at
        FROM cluster_members cm JOIN raw_items r ON r.id = cm.item_id
        WHERE cm.cluster_id = ? ORDER BY cm.added_at
      `).all(clusterId);
      const verdict = db.prepare('SELECT tier, score, badge, status FROM verdicts WHERE cluster_id = ?').get(clusterId) ?? null;
      const conflicts = Number(db.prepare(
        "SELECT COUNT(*) AS n FROM conflicts WHERE cluster_id = ? AND (resolution IS NULL OR resolution = 'unresolved')",
      ).get(clusterId)?.n ?? 0)
        + Number(db.prepare(
          "SELECT COUNT(*) AS n FROM claim_evidence ce JOIN claims c ON c.id = ce.claim_id WHERE c.cluster_id = ? AND ce.relation = 'contradicts'",
        ).get(clusterId)?.n ?? 0);

      const fresh = freshReports(members, {
        knownUrls: (front.sources ?? []).map((s) => s?.url).filter(Boolean),
        trusted,
        publishedAtMs: new Date(front.publishedAt).getTime(),
      });
      const decision = decideAction({ phase, fresh, verdict, conflicts });
      if (decision.action !== 'upgrade' && decision.action !== 'annotate') {
        report.held.push({ slug, phase, reason: decision.reason, ageHours: +(ageMs / 3_600_000).toFixed(1), freshOutlets: fresh.length });
        continue;
      }

      const notes = fresh.slice(0, MAX_NOTES_PER_RUN).map((f) => noteFor({
        headline: f.title, outlet: outletName(f.source_id), url: f.url, at: now,
      }));
      const upgrade = decision.action === 'upgrade'
        ? { badge: verdict.badge, from: front.verification?.badge ?? 'single' }
        : null;
      const next = applyRefresh(content, { at: now, notes, upgrade, slug });
      if (write) atomicWrite(file, next);
      const entry = {
        slug, phase, ageHours: +(ageMs / 3_600_000).toFixed(1),
        outlets: notes.map((n) => n.outlet), badge: upgrade?.badge ?? front.verification?.badge ?? 'partial',
      };
      (upgrade ? report.upgraded : report.annotated).push(entry);
    }
  } finally {
    // A caller-supplied db belongs to the caller.
    if (!injectedDb) db.close();
  }
  return report;
}

export function main() {
  const report = refreshDeveloping({});
  console.log(`developing refresh: ${WRITE ? 'WRITE' : 'DRY RUN'} — watching ${report.scanned} developing article(s)`);
  for (const h of report.held) console.log(`  hold    ${h.slug} [${h.phase} ${h.ageHours}h] ${h.reason}${h.freshOutlets ? ` fresh=${h.freshOutlets}` : ''}`);
  for (const a of report.annotated) console.log(`  +note   ${a.slug} [${a.ageHours}h] ${a.outlets.join(', ')}`);
  for (const u of report.upgraded) console.log(`  +verify ${u.slug} [${u.ageHours}h] -> ${u.badge} via ${u.outlets.join(', ')}`);
  for (const s of report.skipped) console.log(`  skip    ${s.slug} ${s.reason}`);
  console.log(`annotated=${report.annotated.length} upgraded=${report.upgraded.length} held=${report.held.length}`);
  if (!WRITE) console.log('DRY RUN - add --write to persist.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
