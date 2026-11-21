import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { opaqueBorder, removeWhiteBackground } from './unmatte.mjs';

// 20×20 white image with a 1px black outline square (5..14) whose inside is also white —
// like a character with white clothing drawn in line art.
async function outlinedWhite() {
   const W = 20, px = Buffer.alloc(W * W * 3, 255);
   for (let i = 5; i <= 14; i++) {
      for (const [x, y] of [[i, 5], [i, 14], [5, i], [14, i]]) px.fill(0, (y * W + x) * 3, (y * W + x) * 3 + 3);
   }
   return sharp(px, { raw: { width: W, height: W, channels: 3 } }).png().toBuffer();
}
const alphaAt = (r, x, y) => r.data[(y * r.width + x) * 4 + 3];

describe('removeWhiteBackground', () => {
   it('clears the white connected to the border, keeps white inside the line art', async () => {
      const r = await removeWhiteBackground(await outlinedWhite());
      assert.equal(alphaAt(r, 0, 0), 0);
      assert.equal(alphaAt(r, 2, 10), 0);
      assert.equal(alphaAt(r, 5, 5), 255);   // outline
      assert.equal(alphaAt(r, 10, 10), 255); // white "clothing" inside
      assert.ok(r.background > 0.5 && r.background < 0.9);
   });

   it('turns a light fringe pixel into partial transparency, not a white halo', async () => {
      const W = 6, px = Buffer.alloc(W * W * 3, 255);
      px.fill(128, (2 * W + 2) * 3, (2 * W + 2) * 3 + 3); // one mid-grey pixel touching the background
      const r = await removeWhiteBackground(await sharp(px, { raw: { width: W, height: W, channels: 3 } }).png().toBuffer());
      const a = alphaAt(r, 2, 2);
      assert.ok(a > 100 && a < 140, `alpha ${a}`);
      assert.ok(r.data[(2 * W + 2) * 4] < 10, 'colour un-mixed from white towards black');
   });
});

describe('opaqueBorder', () => {
   it('is ~1 for a flattened image and 0 for a transparent one', async () => {
      assert.equal(await opaqueBorder(await outlinedWhite()), 1);
      const clear = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
      assert.equal(await opaqueBorder(clear), 0);
   });
});
