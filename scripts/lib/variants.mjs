// Resized WebP copies ("variants") of the original images in R2.
//
// For every original `{path}.png` (or .jpg/.jpeg/.webp) we store one WebP per
// width in VARIANT_WIDTHS next to it:
//
//   nahida/icon.png  →  nahida/icon.w48.webp, nahida/icon.w96.webp, … nahida/icon.w1920.webp
//
// Every original gets every width (never upscaled — a 256px icon's w1920 is
// just the 256px image as WebP), so a frontend image loader can build any
// variant URL from the original URL alone. Keep VARIANT_WIDTHS in sync with
// the frontend loader. See docs/data-pipeline.md → "Image variants".

import sharp from 'sharp';

export const VARIANT_WIDTHS = [48, 96, 256, 640, 1080, 1920];
export const VARIANT_QUALITY = 75;

// Not `immutable`: an original can be re-uploaded under the same key, and its
// variants are then regenerated under the same keys too. One day of caching
// (about how long Cloudflare keeps the originals), then revalidation by ETag.
// To show a replaced image sooner, bump the `?v=` on its URL in data/ — the
// frontend loader carries the query string over to the variant URL.
export const CACHE_CONTROL = 'public, max-age=86400';

const VARIANT_RE = /\.w\d+\.webp$/;
const ORIGINAL_RE = /\.(png|jpe?g|webp)$/i;

export function isVariantKey(key) {
   return VARIANT_RE.test(key);
}

export function isOriginalKey(key) {
   return ORIGINAL_RE.test(key) && !isVariantKey(key);
}

/** `nahida/icon.png`, 96 → `nahida/icon.w96.webp` */
export function variantKey(key, width) {
   return key.replace(ORIGINAL_RE, `.w${width}.webp`);
}

/** `nahida/icon.png` → `nahida/icon` — the part every variant key of this original shares. */
function variantBase(key) {
   return key.replace(ORIGINAL_RE, '');
}

/**
 * Originals whose variant keys would collide with another original's
 * (e.g. `x.png` and `x.webp`, or `x.png` and `x.PNG` — all map to `x.w96.webp`).
 * Which one's variants survive would depend on processing order, so these are
 * never processed; rename one of them in the bucket instead.
 *
 * @param {{ Key: string }[]} objects  bucket listing
 * @returns {string[][]}  groups of colliding original keys
 */
export function findCollisions(objects) {
   const byBase = new Map();
   for (const { Key } of objects) {
      if (!isOriginalKey(Key)) continue;
      const base = variantBase(Key);
      byBase.set(base, [...(byBase.get(base) ?? []), Key]);
   }
   return [...byBase.values()].filter((keys) => keys.length > 1);
}

/**
 * Decide which originals need variants.
 *
 * @param {{ Key: string, LastModified: Date }[]} objects  bucket listing (originals + variants)
 * @param {{ force?: boolean, widths?: number[] }} [opts]
 * @returns {{ key: string, widths: number[] }[]}  originals to (re)generate, with the widths to write
 *
 * A variant is up to date when it exists and is not older than its original.
 * If an original was re-uploaded after its variants, all its widths are redone.
 * Originals that collide with another (see findCollisions) are always skipped.
 */
export function planVariants(objects, { force = false, widths = VARIANT_WIDTHS } = {}) {
   const modified = new Map(objects.map((o) => [o.Key, new Date(o.LastModified).getTime()]));
   const colliding = new Set(findCollisions(objects).flat());
   const plan = [];
   for (const { Key } of objects) {
      if (!isOriginalKey(Key) || colliding.has(Key)) continue;
      const original = modified.get(Key);
      const stale = widths.filter((w) => {
         if (force) return true;
         const v = modified.get(variantKey(Key, w));
         return v === undefined || v < original;
      });
      if (stale.length > 0) plan.push({ key: Key, widths: stale });
   }
   return plan;
}

/**
 * Render WebP variants of one image.
 * @param {Buffer} buffer  original image bytes (PNG, JPEG or WebP — detected from content)
 * @param {number[]} widths
 * @returns {Promise<{ width: number, buffer: Buffer }[]>}
 * Rejects on a truncated or corrupt original (sharp's default `failOn: 'warning'`),
 * so a broken image is reported as a failure instead of uploaded as broken variants.
 */
export async function renderVariants(buffer, widths = VARIANT_WIDTHS) {
   const source = sharp(buffer);
   return Promise.all(
      widths.map(async (width) => ({
         width,
         buffer: await source
            .clone()
            .resize({ width, withoutEnlargement: true })
            .webp({ quality: VARIANT_QUALITY })
            .toBuffer(),
      })),
   );
}
