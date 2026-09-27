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

/**
 * The outlet an evidence entry came from, if it names one.
 *
 * 2026-09-27. The user asked to be able to click through to the exact source
 * from inside প্রমাণ দেখুন. The panel could not do that because the evidence
 * entries carry no url - they are `type` + `label`, and the label is
 * "reputable paper corroboration (jugantor)". The article's `sources` list does
 * carry the url, keyed by the same outlet id, so the link is recovered by
 * matching the id out of the label rather than by rewriting 383 articles.
 *
 * Returns the outlet id, or null when the label does not name one - in which
 * case the entry still renders, just without a link. Inventing a link target
 * would be worse than showing plain text.
 */
export function evidenceOutletId(label) {
  const raw = String(label ?? "").trim();
  if (!raw) return null;
  // "(jugantor)" — the form the verifier writes
  const paren = raw.match(/\(([a-z0-9][a-z0-9-]{1,40})\)\s*$/i);
  if (paren) return paren[1].toLowerCase();
  // "jugantor.com" or a bare id
  const dom = raw.match(/\b([a-z0-9][a-z0-9-]{1,40})\.(?:com|net|org|bd)\b/i);
  if (dom) return dom[1].toLowerCase();
  return null;
}

/**
 * Pair each evidence entry with the article source it names, so the panel can
 * link to the exact page. Entries with no matching source are kept and rendered
 * without a link rather than dropped - an unlinked proof is still proof.
 *
 * Matching is by outlet id, tried two ways. The evidence labels use ids
 * ("reputable paper corroboration (jugantor)") but the article's `sources` are
 * written with the outlet's BANGLA name ("বাংলা ট্রিবিউন"), so a name comparison
 * finds nothing. Measured on the live corpus, name-only matching linked 33 of 88
 * entries (38%). Matching the id against the source URL's host as well reaches
 * the rest, because the host is unambiguous: banglatribune.com,
 * ittefaq.com.bd, prothomalo.com. That needs no id<->name mapping table, which
 * would drift the moment an outlet is renamed.
 */
export function evidenceWithUrls(evidence, sources) {
  const list = Array.isArray(evidence) ? evidence : [];
  const srcs = Array.isArray(sources) ? sources : [];

  const find = (id) => {
    if (!id) return null;
    const byId = srcs.find((s) => String(s?.id ?? s?.name ?? "").trim().toLowerCase() === id);
    if (byId) return byId;
    // the id appears in the host: "banglatribune" in banglatribune.com
    return (
      srcs.find((s) => {
        const url = String(s?.url ?? "");
        if (!url) return false;
        try {
          return new URL(url).hostname.toLowerCase().includes(id);
        } catch {
          return url.toLowerCase().includes(id);
        }
      }) ?? null
    );
  };

  return list.map((e) => {
    const id = evidenceOutletId(e?.label);
    const match = find(id);
    const url = e?.url ?? match?.url ?? null;
    return { ...e, outletId: id, url, outletName: match?.name ?? id ?? null };
  });
}

export default evidenceLabelBn;

/**
 * What the sources can actually prove, stated honestly.
 *
 * 2026-09-27. national-121 has TWO source entries, both প্রথম আলো, and a badge
 * of "partial"/একক - yet its panel said "প্রথম আলো-এ একই তথ্য প্রকাশ করেছে"
 * ("prothomalo also published the same information"). The source was
 * corroborating itself, because the panel counted source ENTRIES rather than
 * distinct outlets. Measured across the corpus: 18 articles had a single
 * distinct outlet listed more than once, and 18 counted a /video/ or /photo/
 * url as an independent source, so "2 প্রমাণ" could be one outlet's article and
 * its own video.
 *
 * A video url is not a report. A repeated outlet is not a second witness. So
 * this returns the distinct article outlets only, and the panel says how many
 * there really are instead of implying corroboration that did not happen.
 */
export function corroborationSummary(sources) {
  const list = Array.isArray(sources) ? sources : [];
  const articles = list.filter((s) => {
    const url = String(s?.url ?? "");
    if (!url) return false;
    return !/\/(video|photo|live|multimedia|webcam)\//i.test(url);
  });
  const byOutlet = new Map();
  for (const s of articles) {
    const key = String(s?.name ?? s?.id ?? '').trim().toLowerCase();
    if (!key) continue;
    if (!byOutlet.has(key)) byOutlet.set(key, s);
  }
  return {
    outlets: [...byOutlet.values()],
    count: byOutlet.size,
    // one outlet cannot corroborate itself, however many of its articles are listed
    corroborated: byOutlet.size >= 2,
    droppedNonArticles: list.length - articles.length,
  };
}
