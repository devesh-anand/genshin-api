import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
   CACHE_CONTROL,
   VARIANT_QUALITY,
   VARIANT_WIDTHS,
   findCollisions,
   isOriginalKey,
   isVariantKey,
   planVariants,
   renderVariants,
   variantKey,
} from './variants.mjs';

const at = (iso) => new Date(iso);

describe('variant keys', () => {
   it('derives variant keys from the original key', () => {
      assert.equal(variantKey('nahida/icon.png', 96), 'nahida/icon.w96.webp');
      assert.equal(variantKey('weapons/a-b/icon.JPG', 48), 'weapons/a-b/icon.w48.webp');
      assert.equal(variantKey('albedo/icon-big.png.png.png', 256), 'albedo/icon-big.png.png.w256.webp');
   });

   it('tells originals from variants', () => {
      assert.ok(isOriginalKey('nahida/card.png'));
      assert.ok(isOriginalKey('x/art.webp'));
      assert.ok(isVariantKey('nahida/card.w640.webp'));
      assert.ok(!isOriginalKey('nahida/card.w640.webp'));
      assert.ok(!isOriginalKey('notes/readme.txt'));
   });

   it('variant keys are never an original key (so uploads cannot overwrite originals)', () => {
      for (const key of ['a/icon.png', 'a/b.c/icon.jpeg', 'albedo/icon-big.png.png.png', 'x/art.webp']) {
         for (const w of VARIANT_WIDTHS) {
            const v = variantKey(key, w);
            assert.notEqual(v, key);
            assert.ok(isVariantKey(v) && !isOriginalKey(v), v);
         }
      }
   });

   it('never marks variants immutable (originals can be replaced under the same key)', () => {
      assert.ok(!CACHE_CONTROL.includes('immutable'));
   });
});

describe('planVariants', () => {
   const allVariants = (key, when) => VARIANT_WIDTHS.map((w) => ({ Key: variantKey(key, w), LastModified: at(when) }));

   it('plans every width for an original with no variants', () => {
      const plan = planVariants([{ Key: 'a/icon.png', LastModified: at('2026-01-01') }]);
      assert.deepEqual(plan, [{ key: 'a/icon.png', widths: VARIANT_WIDTHS }]);
   });

   it('skips originals whose variants are complete and newer', () => {
      const objects = [{ Key: 'a/icon.png', LastModified: at('2026-01-01') }, ...allVariants('a/icon.png', '2026-01-02')];
      assert.deepEqual(planVariants(objects), []);
   });

   it('fills in only the missing widths', () => {
      const objects = [
         { Key: 'a/icon.png', LastModified: at('2026-01-01') },
         ...allVariants('a/icon.png', '2026-01-02').filter((o) => !o.Key.includes('.w96.')),
      ];
      assert.deepEqual(planVariants(objects), [{ key: 'a/icon.png', widths: [96] }]);
   });

   it('redoes all widths when the original was re-uploaded after its variants', () => {
      const objects = [{ Key: 'a/icon.png', LastModified: at('2026-03-01') }, ...allVariants('a/icon.png', '2026-01-02')];
      assert.deepEqual(planVariants(objects), [{ key: 'a/icon.png', widths: VARIANT_WIDTHS }]);
   });

   it('skips originals whose variant keys would collide, and reports them', () => {
      const objects = [
         { Key: 'x/icon.png', LastModified: at('2026-01-01') },
         { Key: 'x/icon.webp', LastModified: at('2026-01-01') },
         { Key: 'y/art.png', LastModified: at('2026-01-01') },
         { Key: 'y/art.PNG', LastModified: at('2026-01-01') },
         { Key: 'z/ok.png', LastModified: at('2026-01-01') },
      ];
      assert.deepEqual(findCollisions(objects), [
         ['x/icon.png', 'x/icon.webp'],
         ['y/art.png', 'y/art.PNG'],
      ]);
      assert.deepEqual(planVariants(objects).map((p) => p.key), ['z/ok.png']);
      assert.deepEqual(planVariants(objects, { force: true }).map((p) => p.key), ['z/ok.png']);
   });

   it('regenerates everything with force, and never treats variants as originals', () => {
      const objects = [{ Key: 'a/icon.png', LastModified: at('2026-01-01') }, ...allVariants('a/icon.png', '2026-01-02')];
      assert.deepEqual(planVariants(objects, { force: true }), [{ key: 'a/icon.png', widths: VARIANT_WIDTHS }]);
   });
});

describe('renderVariants', () => {
   it('renders WebP at the requested widths without upscaling', async () => {
      const png = await sharp({
         create: { width: 300, height: 150, channels: 4, background: { r: 200, g: 50, b: 50, alpha: 1 } },
      })
         .png()
         .toBuffer();

      const out = await renderVariants(png, [48, 256, 1920]);
      assert.deepEqual(out.map((v) => v.width), [48, 256, 1920]);

      const meta = await Promise.all(out.map((v) => sharp(v.buffer).metadata()));
      assert.ok(meta.every((m) => m.format === 'webp'));
      assert.deepEqual(meta.map((m) => [m.width, m.height]), [
         [48, 24],
         [256, 128],
         [300, 150], // 1920 requested, original is only 300 wide
      ]);
   });

   // A flat 100px icon with hard edges, like the talent and constellation icons.
   const flatIcon = () =>
      sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
         .composite([
            {
               input: Buffer.from(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
                     '<path d="M50 5 L95 50 L50 95 L5 50 Z" fill="#fff"/><circle cx="50" cy="50" r="18" fill="#000"/></svg>',
               ),
            },
         ])
         .png()
         .toBuffer();

   it('serves a near-full-size request at full size instead of blurring it', async () => {
      const [v96] = await renderVariants(await flatIcon(), [96]);
      const m = await sharp(v96.buffer).metadata();
      assert.equal(v96.width, 96); // still named w96
      assert.deepEqual([m.width, m.height], [100, 100]);
   });

   it('keeps the smaller of lossy and lossless for small images', async () => {
      const icon = await flatIcon();
      const [v48] = await renderVariants(icon, [48]);
      const lossy = await sharp(icon).resize({ width: 48 }).webp({ quality: VARIANT_QUALITY }).toBuffer();
      const lossless = await sharp(icon).resize({ width: 48 }).webp({ lossless: true }).toBuffer();
      assert.equal(v48.buffer.length, Math.min(lossy.length, lossless.length));
   });

   it('rejects a truncated original instead of uploading broken variants', async () => {
      const png = await sharp({
         create: { width: 400, height: 400, channels: 3, background: { r: 10, g: 120, b: 200 } },
      })
         .png({ compressionLevel: 0 })
         .toBuffer();
      await assert.rejects(renderVariants(png.subarray(0, Math.floor(png.length / 2)), [48]));
   });
});
