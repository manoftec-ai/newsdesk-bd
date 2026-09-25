// lib/length.mjs — target word count based on source material.
// Pure function, no circular dependencies.

export function targetWords(brief) {
  const totalSourceWords = (brief.members ?? []).reduce((sum, m) => sum + (m.wordCount ?? 0), 0);
  const target = Math.round(totalSourceWords * 0.28); // ~28% of total source material
  const min = Math.max(180, Math.round(target * 0.8));
  const max = Math.min(800, Math.round(target * 1.3));
  const tier = target < 250 ? 'short' : target < 500 ? 'normal' : 'develop';
  return { min, max, tier };
}