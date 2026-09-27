// Image alt text must describe the picture, not carry a photo credit.
//
// 2026-09-27. The thumbnail branding step writes alt as
// "Headline — ছবি: প্রথম আলো" or "... (BY-SA)", and every card rendered that
// string straight into the img alt. It is invisible while an image loads and
// becomes the visible line under the picture the moment it does not, which is
// how a credit ended up reading as a caption. The user does not want a photo
// credit under the image.
//
// Stripped here at render time rather than by rewriting every article: the
// attribution stays in the article front matter, where it belongs, and no
// 383-file diff is needed to stop it being displayed.

const CREDIT = /\s*[—–\-:।|]?\s*ছবি\s*[:：].*$/u;
const TRAILING_LICENCE = /\s*[-–—]?\s*\(BY(?:-[A-Z]{2,3})?\)\s*$/u;

/** "Headline — ছবি: প্রথম আলো" -> "Headline" */
export function cleanAlt(alt) {
  let out = String(alt ?? '').trim();
  if (!out) return '';
  out = out.replace(CREDIT, '');
  out = out.replace(TRAILING_LICENCE, '');
  return out.replace(/[\s—–\-:।|,]+$/u, '').trim();
}
