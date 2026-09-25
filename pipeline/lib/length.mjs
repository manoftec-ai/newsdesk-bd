// lib/length.mjs — target word count based on source material.
// Pure function, no circular dependencies.

export function targetWords(brief) {
  const members = brief.members ?? [];
  const totalSourceWords = members.reduce((sum, m) => sum + (m.wordCount ?? 0), 0);
  // Fallback for old briefs without wordCount (pre-proportional) or very thin gnews titles-only pools
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