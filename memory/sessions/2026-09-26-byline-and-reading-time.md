# 2026-09-26 — byline + reading time (D108)

## What the user said
> "go with your recommendation"

That referred to the D107 byline recommendation — attribute to the source
outlet — not to the other two open items (median 193 vs 269 words, 113 Google
News wrapper URLs). Both of those remain open.

## Byline — shipped
All 377 articles had `author: "desk"` and **no visible byline at all**.

Chosen form, because these are aggregated from named outlets rather than written
by us:
- a reporter name would be **false**
- a bare outlet name would wrongly imply that outlet published the page here
- so it is an explicit sourcing credit, which is what Bangladeshi papers use
  when reprinting

```
সূত্র: প্রথম আলো
সূত্র: প্রথম আলো ও ডেইলি অবজার্ভার
সূত্র: কালের কণ্ঠ ও অন্যান্য 3টি মাধ্যম
```

370/377 get a credit. The 7 with no source get none rather than a fabricated one.
Front matter `author` stays `"desk"` — the pipeline writes it. JSON-LD still
names যাচাইডেস্ক ডেস্ক as publisher, which is the truthful claim.

## Reading time — shipped broken three times
This is the part worth remembering.

| Attempt | Why it failed |
|---|---|
| `entry.data.body` | does not exist in Astro 7 |
| `entry.body` | does not exist in Astro 7 |
| `readFileSync(new URL(…, import.meta.url))` | `import.meta.url` is not the source path during a build |
| `import.meta.glob("../content/news/*.md")` | wrong depth — from `src/pages/article/` that is `src/pages/content`, which does not exist |

**Every one failed the same silent way**: the lookup returned nothing and
`Math.max(1, …)` turned that into a clean-looking "1 মিনিট পাঠ". I reported the
first three as fixed. The bug was never subtle — the reporting was.

**No unit test would have caught any of them.** The only check that works is
reading the value back out of the built HTML.

## What actually broke the cycle
Stop guessing, make the code self-verifying. Emit the resolved path and the
count onto the element:

```
data-reading-source="/vercel/path0/src/content/news/national-82.md"
data-reading-words="283"
```

The first candidate root hit immediately, exactly as designed. Then verify live
and remove the attributes.

## Verified live at 150 wpm
| Article | Words | Rendered |
|---|---|---|
| national-82 | 283 | 2 মিনিট পাঠ |
| national-84 | 265 | 2 মিনিট পাঠ |
| national-315 | 280 | 2 মিনিট পাঠ |
| national-542 | 43 | 1 মিনিট পাঠ |
| national-551 | 190 | 1 মিনিট পাঠ |

Byline renders, English labels 0, homepage 200, sitemap 377.

## The general lesson
When a value can be silently absent and a default will mask it, **assert on
rendered output, not on source** — and if you cannot assert yet, make the code
report its own inputs so the page tells you which branch ran. Three deploys
went out on a fix I had verified only by reading my own diff.
