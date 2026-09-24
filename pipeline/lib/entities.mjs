// lib/entities.mjs — lightweight Bengali news entity/number extraction for HYBRID clustering.
// No ML, no dictionaries beyond Bengali numerals + number-words. Builds "strong tokens":
//   - normalized NUMBERS (Bengali & Latin digits, single-digit Bengali number words,
//     হাজার/লাখ/কোটি multipliers) -> "N<value>"
//   - rare lexical tokens (high IDF, len>=3, not stopwords) held back from buildVectors' df
// Strong-token agreement is the second independent signal that lets same-event items with
// DIFFERENT wording merge (e.g. "হামের উপসর্গে আরও ১১ শিশুর মৃত্যু" vs "...হামে সর্বোচ্চ ১১"),
// while keeping high-idf vocabulary from gluing unrelated news together.

const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
const BN_WORDS = {
  এক: 1, দুই: 2, তিন: 3, চার: 4, পাঁচ: 5, ছয়: 6, ছয়: 6, সাত: 7, আট: 8, নয়: 9, ন: 0,
  দশ: 10, এগারো: 11, বারো: 12, তেরো: 13, চৌদ্দ: 14, পনেরো: 15, ষোলো: 16, সতেরো: 17, আঠারো: 18, উনিশ: 19,
  বিশ: 20, ত্রিশ: 30, চল্লিশ: 40, পঞ্চাশ: 50, ষাট: 60, সত্তর: 70, আশি: 80, নব্বই: 90,
  একশ: 100, একশো: 100, দুইশ: 200, দুইশো: 200, তিনশ: 300, চারশ: 400, পাঁচশ: 500, ছয়শ: 600, সাতশ: 700, আটশ: 800, নয়শ: 900, হাজার: 1000, লাখ: 100000, লাখো: 100000, কোটি: 10000000,
};

// A solid blocklist of tokens with near-zero discriminative power in news titles.
export const STOPWORDS = new Set([
  'একটি', 'একজন', 'এবং', 'করা', 'করার', 'করেন', 'জন্য', 'বলে', 'বলেন', 'এই', 'ওই', 'সেই',
  'তিনি', 'তাদের', 'আছে', 'ছিল', 'হবে', 'হয়েছে', 'হয়', 'না', 'কোনো', 'যা', 'যে', 'করে',
  'পর', 'আজ', 'গত', 'নতুন', 'আরও', 'আরো', 'এখন', 'দেশের', 'বাংলাদেশের', 'ঢাকায়', 'ঢাকার',
  'বাংলাদেশে', 'রাজধানীতে', 'রাজধানীর', 'জাতীয়', 'প্রধানমন্ত্রীর', 'প্রধানমন্ত্রী',
  'সরকারের', 'সরকার', 'বিষয়ে', 'সংশ্লিষ্ট', 'কর্তৃপক্ষ', 'একথা', 'আলোচনা', 'নিয়ে', 'মধ্যে',
  'থেকে', 'কাছে', 'জন্যর', 'বিষয়টি', 'জানা', 'গেছে', 'দিনের', 'দিনে', 'ঘণ্টায়', 'দুই',
  'তিন', 'যাওয়া', 'কম', 'বেশি', 'সম্পর্কে', 'চেয়ে', 'সবচেয়ে', 'সর্বোচ্চ', 'পরে', 'ভিতরে',
]);

// True when the string is entirely ASCII or Bengali digits.
export function isDigitRun(t) {
  return /^[0-9০-৯]+$/.test(t);
}

// Convert a digit-run (Latin or Bengali) to a canonical number token.
export function normNumberStr(t) {
  const latin = String(t)
    .split('')
    .map((c) => BN_DIGITS[c] ?? c)
    .join('');
  if (!/^[0-9]+$/.test(latin)) return null;
  // strip insignificant leading zeros
  return 'N' + (BigInt(latin).toString()).slice(0, 12);
}

// Leading number present at the START of a token: a digit-run or a Bengali
// number-word prefix (Bengali writes ছয়জন/আটশো concatenated). Returns the
// numeric value + the remaining text, or null.
const WORD_KEYS = Object.keys(BN_WORDS).sort((a, b) => b.length - a.length);
export function leadingNumber(t) {
  const dr = t.match(/^[0-9০-৯]+/);
  if (dr) return { value: BigInt(dr[0].replace(/[০-৯]/g, (c) => BN_DIGITS[c])), rest: t.slice(dr[0].length) };
  for (const k of WORD_KEYS) if (t.startsWith(k)) return { value: BigInt(BN_WORDS[k]), rest: t.slice(k.length) };
  return null;
}

// Expand a token sequence into numeric tokens handling words + হাজার/লাখ/কোটি multipliers.
export function numberTokensOf(tokens) {
  const out = [];
  let buf = null; // pending numeric accumulator (BigInt)
  const flush = () => { if (buf != null) out.push('N' + buf.toString().slice(0, 12)); buf = null; };
  for (const t of tokens) {
    if (isDigitRun(t)) {
      buf = (buf ?? 0n) * 10n + BigInt(t.replace(/[০-৯]/g, (c) => BN_DIGITS[c]));
    } else {
      const lead = leadingNumber(t);
      if (lead) {
        const v = lead.value;
        if (v >= 1000n) buf = (buf ?? 1n) * v;               // হাজার/লাখ/কোটি multiplier
        else buf = (buf ?? 0n) + v;                            // additive
      } else {
        flush();
      }
    }
  }
  flush();
  return out;
}

// are two bare >=3-digit number tokens within edit distance 1? ("১৮৬৮" vs "১৮৬৬")
export function digitClose(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (!a.startsWith('N') || !b.startsWith('N')) return false;
  const x = a.slice(1), y = b.slice(1);
  if (x.length < 3 || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) d++;
  return d <= 1;
}

// High-IDF lexical strong tokens for a batch (idf computed over the batch doc set).
export function strongLexical(tokens, df, N) {
  const set = new Set();
  for (const t of new Set(tokens)) {
    if (t.length < 3 || t.startsWith('N') || isDigitRun(t) || STOPWORDS.has(t)) continue;
    if (/^[A-Za-z0-9]+$/.test(t)) continue; // pure-ASCII = outlet names/"com"/URL leftovers; stays in cosine vectors, not a strong signal
    const idf = Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1;
    if (idf >= Math.log((N + 1) / 2) + 1) set.add(t); // appears in <= half the batch
  }
  return set;
}

// Strong-token set for one item: numbers + rare lexical (paired with batch idf).
export function strongTokenSet({ title = '', body = '', df, N }) {
  const tokens = String(`${title} ${title} ${body}`).trim().split(/[^\p{L}\p{M}\p{N}]+/gu).filter(Boolean);
  return new Set([...numberTokensOf(tokens), ...strongLexical(tokens, df, N)]);
}

// Strong-token Jaccard with digit-close tolerance. Returns 0..1.
export function strongOverlap(a, b) {
  const A = [...a], B = [...b];
  if (!A.length || !B.length) return 0;
  let inter = 0;
  const used = new Set();
  for (const x of A) {
    for (let j = 0; j < B.length; j++) {
      if (used.has(j)) continue;
      if (digitClose(x, B[j])) { inter++; used.add(j); break; }
    }
  }
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}

// Count shared (digit-close-tolerant) tokens between two strong sets.
function sharedCount(a, b) {
  const A = [...a], B = [...b];
  const used = new Set();
  let inter = 0;
  for (const x of A) {
    for (let j = 0; j < B.length; j++) {
      if (used.has(j)) continue;
      if (digitClose(x, B[j])) { inter++; used.add(j); break; }
    }
  }
  return inter;
}

// Is a 3+ digit bare number in A close (<=1 digit edit) to one in B?
function anyCloseLargeDigit(a, b) {
  const B = [...b];
  for (const x of a) {
    if (!/^N\d{3,}$/.test(x)) continue;
    for (const y of B) if (digitClose(x, y)) return true;
  }
  return false;
}

// HYBRID strong agreement (P0-9). Merge if:
//   (1) >=2 strong tokens are shared, OR
//   (2) a distinguishing 3+ digit figure matches within edit distance 1 AND
//       coverage of the smaller strong set is >= floor (default 0.4).
// Rules (1)+(2) keep small strong sets from over-merging: a lone shared mundane
// number (e.g. "১১" in two different death stories) is NOT enough — it needs
// either a second agreement or a large close figure (1868 vs 1866 = same daily
// hospital bulletin, the classic Bangladesh health-news framing gap).
export function strongAgree(a, b, floor = 0.3) {
  if (!a.size || !b.size) return false;
  const inter = sharedCount(a, b);
  if (inter >= 2) return true;
  const smaller = Math.min(a.size, b.size);
  if (smaller === 0) return false;
  const coverage = inter / smaller;
  return anyCloseLargeDigit(a, b) && coverage >= floor;
}