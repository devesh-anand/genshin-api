/**
 * Removes a flat white background from character art (used for portraits that the wiki
 * stores flattened, without transparency).
 *
 * How: flood-fill the near-white pixels connected to the image border (the background; official
 * art has line work around the character, so the fill stops there and white hair or clothing
 * inside the character is untouched), then "colour to alpha" against white over that region plus
 * a 1px fringe, so anti-aliased edges and soft glows fade out instead of leaving a white halo.
 */
import sharp from 'sharp';

/** How far from white (0–255, by the darkest channel) a pixel may be and still count as background. */
export const DEFAULT_THRESHOLD = 24;

/**
 * Share of border pixels that are (nearly) opaque. Art with a transparent background scores
 * low (only the character touches the edge); a flattened image scores ~1.
 * @param {Buffer} buf - any image sharp can read
 * @returns {Promise<number>} 0–1
 */
export async function opaqueBorder(buf) {
   const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
   const { width: W, height: H } = info;
   const a = (x, y) => data[(y * W + x) * 4 + 3];
   let opaque = 0, n = 0;
   for (let x = 0; x < W; x++) { n += 2; opaque += (a(x, 0) > 200) + (a(x, H - 1) > 200); }
   for (let y = 0; y < H; y++) { n += 2; opaque += (a(0, y) > 200) + (a(W - 1, y) > 200); }
   return opaque / n;
}

/**
 * @param {Buffer} buf - image on a white background (any existing alpha is flattened over white first)
 * @param {{ threshold?: number }} [opts]
 * @returns {Promise<{ data: Buffer, width: number, height: number, background: number }>}
 *   raw RGBA pixels, and the share of the image that became background
 */
export async function removeWhiteBackground(buf, { threshold = DEFAULT_THRESHOLD } = {}) {
   const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
   const { width: W, height: H } = info;
   const N = W * H;

   for (let i = 0; i < N; i++) {
      const a = data[i * 4 + 3] / 255;
      if (a < 1) for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(data[i * 4 + k] * a + 255 * (1 - a));
      data[i * 4 + 3] = 255;
   }

   const dist = (i) => 255 - Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
   const bg = new Uint8Array(N);
   const stack = new Int32Array(N);
   let sp = 0;
   const push = (i) => { if (!bg[i] && dist(i) <= threshold) { bg[i] = 1; stack[sp++] = i; } };
   for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
   for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
   while (sp) {
      const i = stack[--sp];
      const x = i % W;
      if (x > 0) push(i - 1);
      if (x < W - 1) push(i + 1);
      if (i >= W) push(i - W);
      if (i < N - W) push(i + W);
   }

   const region = bg.slice();
   for (let i = 0; i < N; i++) {
      if (bg[i]) continue;
      const x = i % W;
      if ((x > 0 && bg[i - 1]) || (x < W - 1 && bg[i + 1]) || (i >= W && bg[i - W]) || (i < N - W && bg[i + W])) region[i] = 1;
   }

   let background = 0;
   for (let i = 0; i < N; i++) {
      if (!region[i]) continue;
      const p = i * 4;
      const alpha = (255 - Math.min(data[p], data[p + 1], data[p + 2])) / 255;
      if (alpha < 0.1) background++;
      if (alpha === 0) { data[p + 3] = 0; continue; }
      for (let k = 0; k < 3; k++) data[p + k] = Math.max(0, Math.min(255, Math.round(255 - (255 - data[p + k]) / alpha)));
      data[p + 3] = Math.round(alpha * 255);
   }
   return { data, width: W, height: H, background: background / N };
}
