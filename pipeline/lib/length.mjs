// lib/length.mjs — target word count based on source material.
// Pure function, no circular dependencies.

export function targetWords(brief) {
  const members = brief.members ?? [];
  const hasWordCounts = members.some((m) => m?.wordCount !== undefined && m?.wordCount !== null);
  // Legacy briefs may not carry wordCount; retain the original source-count bands.
  if (!hasWordCounts) {
    if (members.length <= 2) return { min: 100, max: 180, tier: 'short' };
    if (members.length === 3) return { min: 200, max: 350, tier: 'normal' };
    return { min: 400, max: 550, tier: 'complex' };
  }
  const totalSourceWords = members.reduce((sum, m) => sum + (m.wordCount ?? 0), 0);
  // Fallback for very thin gnews titles-only pools
  if (totalSourceWords < 80) {
    return { min: 100, max: 180, tier: 'short' };
  }
  const target = Math.round(totalSourceWords * 0.28); // ~28% of total source material
  const rawMin = Math.max(180, Math.round(target * 0.8));
  const rawMax = Math.min(800, Math.round(target * 1.3));
  const min = Math.min(rawMin, rawMax);
  const max = Math.max(rawMin, rawMax);
  // Ensure max is at least min + 40 for thin pools where 28% clamps hard
  const finalMax = max < min + 40 ? min + 40 : max;
  const tier = target < 250 ? 'short' : target < 500 ? 'normal' : 'develop';
  return { min, max: finalMax, tier };
}