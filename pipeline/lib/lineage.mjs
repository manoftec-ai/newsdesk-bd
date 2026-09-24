// lib/lineage.mjs — SOURCE INDEPENDENCE (evidence lineage, additive-only).
//
// The verification problem this solves: "5 websites report X" is NOT the same
// as "5 independent confirmations of X" if three of them repackage Reuters and
// one is the official statement. We count INDEPENDENT EVIDENCE GROUPS instead of
// distinct URLs.
//
// Lineage metadata is EXTERNAL (config/lineage.yaml via config.mjs or a JSON
// block in trust.json). When a source has no lineage entry it is treated as its
// own independent group (safe default — no over-optimism).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default: every source = its own group. Configured lineage overrides.
export function loadLineage(overrides) {
  let base = {};
  try {
    const trust = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'trust.json'), 'utf8'));
    base = trust.lineage ?? {};
  } catch {
    base = {};
  }
  return { ...base, ...(overrides ?? {}) };
}

// The group a source belongs to. Lowest non-null of ownership_group →
// wire_origin → syndication_group → source_id. ownership/wire dominate because
// two outlets sharing one wire are not independent evidence.
export function groupKey(sourceId, lineage = {}) {
  const l = lineage[sourceId];
  if (!l) return sourceId;
  return (
    (l.ownership_group && `ownership:${l.ownership_group}`) ||
    (l.wire_origin && `wire:${l.wire_origin}`) ||
    (l.syndication_group && `syndicated:${l.syndication_group}`) ||
    sourceId
  );
}

export function isOfficialSource(sourceId, lineage = {}) {
  const l = lineage[sourceId];
  return Boolean(l && (l.source_type === 'official' || l.source_type === 'agency'));
}

// Group a list of evidence rows by independent group. Returns
// { groups: Map<groupKey, evidence[]>, independentCount, officialCount }.
export function groupEvidence(evidence = [], lineage = {}) {
  const groups = new Map();
  let officialCount = 0;
  for (const e of evidence) {
    const key = groupKey(e.source_id, lineage);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
    if (isOfficialSource(e.source_id, lineage)) officialCount++;
  }
  return { groups, independentCount: groups.size, officialCount };
}