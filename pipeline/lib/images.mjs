// lib/images.mjs — article thumbnails.
//
// Strategy (user 2026-09-19: "mix it... different case different action"):
//   1. Try a FREE-LICENSE contextual photo (Openverse API, commercial + modification
//      licenses only). Credit the creator + add our brand mark.
//   2. If nothing suitable is found, generate a BRANDED CARD (category colour +
//      Bengali headline + our brand) — 100% original, never misleading.
// Every output is WebP. We NEVER scrape Google Images or remove watermarks from
// third-party photos (copyright risk); instead we brand + credit legal sources.

const OPENVERSE = "https://api.openverse.org/v1/images/";
const UA = "newsdesk-bd/1.0 (+https://newsdesk-bd.vercel.app)";

export const BRAND = "নিউজডেস্ক বিডি";

// category -> generic illustrative search query (kept short: Openverse AND-matches)
const CATEGORY_QUERY = {
  national: "dhaka city",
  politics: "parliament building",
  economy: "business market",
  international: "world globe",
  sports: "cricket stadium",
  entertainment: "cinema film",
  tech: "technology computer",
  opinion: "newspaper",
  latest: "newspaper",
};
// High-signal keywords found in the TITLE (ordered = priority). More reliable than
// the auto-inferred tags, which can be noisy.
const KEYWORD_QUERY = [
  [/ডেঙ্গু|হাসপাতাল|স্বাস্থ্য|কিডনি|ভাইরাস|চিকিৎসা|রোগী|মৃত্যু/, "hospital"],
  [/ক্রিকেট|টি-?২০|ওয়ানডে|বোলার|ব্যাট|সেঞ্চুরি|ম্যাচ/, "cricket stadium"],
  [/নির্বাচন|সংসদ|মন্ত্রী|ভোট|রাজনীতি|দলীয়/, "parliament building"],
  [/মেট্রো/, "metro train"],
  [/মহাসড়ক|সড়ক|সেতু|রেল|ট্রেন|সড়কপথ/, "highway road"],
  [/বৃষ্টি|বন্যা|ঝড়|আবহাওয়া|তাপমাত্রা/, "monsoon rain"],
  [/বিদ্যালয়|শিক্ষা|স্কুল|কলেজ|শিক্ষার্থী|পরীক্ষা/, "school classroom"],
  [/গ্যাস|বিদ্যুৎ|অর্থনীতি|বাজার|ব্যাংক|টাকা|বাজেট|রপ্তানি|আমদানি|মুদ্রাস্ফীতি/, "business market"],
  [/মধ্যপ্রাচ্য|ইরান|ইসরায়েল|গাজা|জাতিসংঘ|আন্তর্জাতিক|যুদ্ধ|পররাষ্ট্র/, "world globe"],
  [/অভিনেতা|অভিনেত্রী|চলচ্চিত্র|সিনেমা|নাটক|সংগীত|শিল্পী/, "cinema film"],
  [/প্রযুক্তি|মোবাইল|ইন্টারনেট|কৃত্রিম বুদ্ধিমত্তা|কম্পিউটার/, "technology computer"],
];
const CATEGORY_COLOR = {
  national: "#c0392b",
  politics: "#7b241c",
  economy: "#148f77",
  international: "#2e86c1",
  sports: "#1e8449",
  entertainment: "#7d3c98",
  tech: "#117a8b",
  opinion: "#b9770e",
  latest: "#5d6d7e",
};

function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export function buildQuery(category, tags = [], title = "") {
  for (const [re, q] of KEYWORD_QUERY) if (re.test(title)) return q;
  return CATEGORY_QUERY[category] ?? "bangladesh";
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---- Openverse search -------------------------------------------------------
export async function searchOpenverse(query, perPage = 10) {
  const url =
    `${OPENVERSE}?q=${encodeURIComponent(query)}` +
    `&license_type=commercial,modification&mature=false&page_size=${perPage}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url,
      width: r.width ?? 0,
      height: r.height ?? 0,
      license: r.license ?? "",
      licenseUrl: r.license_url ?? "",
      creator: r.creator ?? "Openverse",
      creatorUrl: r.creator_url ?? "",
      landing: r.foreign_landing_url ?? "",
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function downloadBuffer(url, { maxBytes = 10 * 1024 * 1024 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) throw new Error(`not an image (${type})`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len && len > maxBytes) throw new Error("too large");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error("too large");
    return buf;
  } finally {
    clearTimeout(t);
  }
}

// ---- rendering (sharp loaded lazily so dry-run works without it) -----------
async function getSharp() {
  const mod = await import("sharp");
  return mod.default ?? mod;
}

function brandBadgeSvg(brand) {
  const text = escapeXml(brand);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675">
  <g>
    <rect x="936" y="607" width="240" height="44" rx="10" fill="rgba(0,0,0,0.55)"/>
    <text x="1056" y="636" text-anchor="middle" font-family="Noto Sans Bengali, sans-serif"
      font-size="22" font-weight="600" fill="#ffffff">${text}</text>
  </g>
</svg>`;
}

function wrapTitle(title, maxChars = 26, maxLines = 4) {
  const words = String(title).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length <= maxChars) {
      line = (line + " " + w).trim();
    } else {
      if (line) lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.slice(0, maxLines);
}

function cardSvg({ title, category, brand }) {
  const color = CATEGORY_COLOR[category] ?? "#5d6d7e";
  const lines = wrapTitle(title);
  const tspans = lines
    .map((l, i) => `<tspan x="80" dy="${i === 0 ? 0 : 64}">${escapeXml(l)}</tspan>`)
    .join("");
  const brandY = 360 + lines.length * 64 + 60;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}"/>
      <stop offset="1" stop-color="#1a1a1a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#g)"/>
  <rect x="48" y="44" width="10" height="72" rx="5" fill="#ffffff" opacity="0.85"/>
  <text x="80" y="300" font-family="Noto Serif Bengali, Noto Sans Bengali, serif"
    font-size="54" font-weight="700" fill="#ffffff">${tspans}</text>
  <text x="80" y="${brandY}" font-family="Noto Sans Bengali, sans-serif"
    font-size="26" font-weight="600" fill="#ffffff" opacity="0.92">${escapeXml(brand)}</text>
</svg>`;
}

export async function renderPhotoFromBuffer(imageBuffer, { brand = BRAND } = {}) {
  const sharp = await getSharp();
  const base = await sharp(imageBuffer)
    .rotate()
    .resize(1200, 675, { fit: "cover", position: "attention" })
    .toBuffer();
  return sharp(base)
    .composite([{ input: Buffer.from(brandBadgeSvg(brand)), top: 0, left: 0 }])
    .webp({ quality: 80 })
    .toBuffer();
}

export async function renderBrandCard({ title, category, brand = BRAND }) {
  const sharp = await getSharp();
  return sharp(Buffer.from(cardSvg({ title, category, brand })))
    .resize(1200, 675)
    .webp({ quality: 82 })
    .toBuffer();
}

// ---- orchestration ----------------------------------------------------------
// Returns { webp, mode, alt, credit } — webp is a Buffer, or null on dry-run.
export async function chooseThumbnail({ slug, title, category, tags = [], dryRun = false, mode = "mix" }) {
  const seed = hashSeed(slug || title || "x");
  const query = buildQuery(category, tags, title);
  const results = mode === "card" ? [] : await searchOpenverse(query, 10);
  const landscape = results.filter(
    (r) => r.width >= 1000 && r.height >= 600 && r.width > r.height,
  );
  const pick = landscape.length ? landscape[seed % Math.min(landscape.length, 5)] : null;

  if (dryRun) {
    return {
      webp: null,
      mode: pick ? "photo" : mode === "photo" ? "none" : "card",
      query,
      pick: pick ? { title: pick.title, creator: pick.creator, license: pick.license, url: pick.url } : null,
    };
  }

  if (mode === "photo" && !pick) {
    return { webp: null, mode: "none", alt: "", credit: "" };
  }

  if (pick) {
    try {
      const img = await downloadBuffer(pick.url);
      const webp = await renderPhotoFromBuffer(img);
      return {
        webp,
        mode: "photo",
        alt: `${title} — ছবি: ${pick.creator}${pick.license ? ` (${pick.license.toUpperCase()})` : ""}`,
        credit: pick.landing || pick.creatorUrl || "",
      };
    } catch {
      // fall through to branded card
    }
  }
  const webp = await renderBrandCard({ title, category });
  return { webp, mode: "card", alt: `${title} — ${BRAND}`, credit: "" };
}
