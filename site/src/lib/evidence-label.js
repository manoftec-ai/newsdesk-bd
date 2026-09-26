// Reader-facing text for verification evidence labels.
//
// 2026-09-26: 617 of the labels rendered on article pages were the raw generated
// string "reputable paper corroboration (bdnews24)" — English, machine-made, on a
// Bengali news site. The pipeline writes these into article front matter, so the
// fix has to render-time translate them; rewriting 377 articles would be undone
// by the next bot run.
//
// Labels that are genuine citations of English-language sources (the curated
// history archive: "Wikipedia — Rana Plaza collapse", "NASA — Sputnik 1") are left
// exactly as written. A citation should name its source in the source's own
// language.

const SOURCE_NAMES = {
  "daily-observer": "ডেইলি অবজার্ভার",
  "daily-star": "দ্য ডেইলি স্টার",
  "prothomalo": "প্রথম আলো",
  "bdnews24": "বিডি নিউজ২৪",
  "bd24live": "বিডি২৪লাইভ",
  "jugantor": "যুগান্তর",
  "dainikbangla": "দৈনিক বাংলা",
  "kalerkantho": "কালের কণ্ঠ",
  "banglatribune": "বাংলাদ্রিবিউন",
  "bangl Tribune": "বাংলাদ্রিবিউন",
  ittefaq: "ইত্তেফাক",
  "the-daily-star": "দ্য ডেইলি স্টার",
  "dhakatribune": "ঢাকা ট্রিবিউন",
  "dhaka-tribune": "ঢাকা ট্রিবিউন",
  unb: "ইউএনবি",
  "unb-news": "ইউএনবি",
  bss: "বাংলাদেশ সংবাদ সংস্থা",
  "bbs-news": "বাংলাদেশ সংবাদ সংস্থা",
  "channeli": "চ্যানেল আই",
  "somoy-news": "সময় নিউজ",
  "the-independent": "দ্য ইন্ডিপেন্ডেন্ট",
  "new-age": "নিউ এজ",
  "dhakatribune-com": "ঢাকা ট্রিবিউন",
  "ghola": "গোলা",
  "abc": "এবিসি",
};

/** Best-effort Bengali name for a source id, falling back to the id itself. */
export function sourceNameBn(sourceId) {
  if (!sourceId) return null;
  const raw = String(sourceId).trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (SOURCE_NAMES[key]) return SOURCE_NAMES[key];
  const squashed = key.replace(/[^a-z0-9]/g, "");
  if (SOURCE_NAMES[squashed]) return SOURCE_NAMES[squashed];
  for (const [k, v] of Object.entries(SOURCE_NAMES)) {
    if (k.replace(/[^a-z0-9]/g, "") === squashed) return v;
  }
  // Already Bengali, or unknown — show as-is rather than inventing a name.
  return /[\u0980-\u09FF]/.test(raw) ? raw : raw.replace(/[-_]/g, " ");
}

const GENERIC_PATTERNS = [
  {
    // "reputable paper corroboration (daily-observer)"
    re: /^reputable paper corroboration\s*(?:\(([^)]*)\))?$/i,
    bn: (m) => {
      const src = m[1] ? sourceNameBn(m[1]) : null;
      return src ? `${src}-এ একই তথ্য প্রকাশ করেছে` : "একাধিক নির্ভরযোগ্য সংবাদপত্রে একই তথ্য";
    },
  },
  {
    re: /^(?:official|government|agency) source(?:\s*\(([^)]*)\))?$/i,
    bn: (m) => {
      const src = m[1] ? sourceNameBn(m[1]) : null;
      return src ? `সরকারি সূত্র — ${src}` : "সরকারি সূত্রে তথ্য নিশ্চিত";
    },
  },
  {
    re: /^wire service(?:\s*\(([^)]*)\))?$/i,
    bn: (m) => (m[1] ? `ওয়্যার সার্ভিস — ${sourceNameBn(m[1])}` : "ওয়্যার সার্ভিস থেকে প্রাপ্ত"),
  },
  {
    re: /^(?:local|regional) (?:paper|outlet|media)(?:\s*\(([^)]*)\))?$/i,
    bn: (m) => (m[1] ? `স্থানীয় সংবাদপত্র — ${sourceNameBn(m[1])}` : "স্থানীয় সংবাদপত্রে প্রকাশিত"),
  },
  { re: /^single source$/i, bn: () => "একক সূত্রে প্রকাশিত" },
  { re: /^cross[- ]checked$/i, bn: () => "একাধিক সূত্রে যাচাই করা হয়েছে" },
  { re: /^primary source$/i, bn: () => "প্রাথমিক সূত্র" },
];

// A real citation, or our own machine text? Anything with a source name and a
// title reads as a citation and must be left alone.
const LOOKS_LIKE_CITATION = /—|\s-\s|·/;

/**
 * Bengali, reader-facing text for one evidence label.
 * Falls back to the original string so nothing is ever silently dropped.
 */
export function evidenceLabelBn(label) {
  const raw = String(label ?? "").trim();
  if (!raw) return "";
  if (/[\u0980-\u09FF]/.test(raw)) return raw; // already Bengali
  for (const { re, bn } of GENERIC_PATTERNS) {
    const m = raw.match(re);
    if (m) return bn(m);
  }
  // "Wikipedia — Rana Plaza collapse" / "NASA — Sputnik 1": a genuine citation
  // of an English source. Keep the source's own name, drop nothing.
  if (LOOKS_LIKE_CITATION.test(raw)) return raw;
  // A lone English fragment we do not recognise: keep it rather than hide it,
  // because hiding evidence is worse than showing an odd label.
  return raw;
}

export default evidenceLabelBn;
