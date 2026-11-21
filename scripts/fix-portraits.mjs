/**
 * Makes every character portrait a transparent cutout.
 *
 * The wiki stores many newer `{Name}_Portrait` files flattened onto white, and a few characters
 * got the wrong art entirely. This script:
 *   - travelers: uses the wiki's shared cutouts `Traveler_(Male|Female)_Portrait.png` (the
 *     per-element `Character_*_Game_*` art fix-traveler.mjs used is painted on a coloured
 *     background, and the Cryo one is a tutorial graphic);
 *   - PORTRAIT_FILES: characters whose portrait isn't their `{slug}/portrait.png` (it pointed at
 *     the card art, which carries the game's logo) — re-fetched from the wiki;
 *   - everyone else: if the current portrait is flattened (opaque border), removes the white
 *     background (scripts/lib/unmatte.mjs).
 * Portraits that are already transparent are left alone, so it's safe to re-run (sync.mjs runs it
 * after characters).
 *
 * With --write it uploads `{slug}/portrait.png` (WebP, ≤ 2560px), regenerates its resized
 * variants, keeps the replaced original at `_backup/portraits/{slug}.png.bak` (once), and points
 * data/ at the new file with a `?v=` cache-buster (Cloudflare caches images ~24h).
 *
 * Usage:
 *   node scripts/fix-portraits.mjs                       # dry run, all characters
 *   node scripts/fix-portraits.mjs --preview <dir>       # dry run + before/after PNGs to look at
 *   node scripts/fix-portraits.mjs --write [slug]        # upload + update data/
 */
import S3 from 'aws-sdk/clients/s3.js';
import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { BUCKET, PUBLIC_URL } from './lib/r2.mjs';
import { opaqueBorder, removeWhiteBackground } from './lib/unmatte.mjs';
import { CACHE_CONTROL, renderVariants, variantKey } from './lib/variants.mjs';
import { USER_AGENT } from './lib/source.mjs';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data/characters');
const WIKI_API = 'https://genshin-impact.fandom.com/api.php';

/** Wiki portrait files for characters whose stored portrait is the wrong art. */
const PORTRAIT_FILES = {
   ayato: 'Kamisato_Ayato_Portrait.png',
   collei: 'Collei_Portrait.png',
};
const TRAVELER_PORTRAIT = { aether: 'Traveler_(Male)_Portrait.png', lumine: 'Traveler_(Female)_Portrait.png' };
const MAX_SIDE = 2560;
/** A flattened portrait whose background fill covers less than this is probably not on white. */
const MIN_BACKGROUND = 0.15;

const { values: opts, positionals } = parseArgs({
   allowPositionals: true,
   options: { write: { type: 'boolean', default: false }, preview: { type: 'string' } },
});
const only = positionals[0] ?? null;

const s3 = opts.write ? (() => {
   for (const name of ['R2_ID', 'AWS_ID', 'AWS_KEY']) {
      if (!process.env[name]) { console.error(`Missing ${name} in .env`); process.exit(1); }
   }
   return new S3({
      endpoint: `https://${process.env.R2_ID}.r2.cloudflarestorage.com/`,
      accessKeyId: process.env.AWS_ID, secretAccessKey: process.env.AWS_KEY, signatureVersion: 'v4',
   });
})() : null;

async function download(url) {
   const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
   if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
   if (!/^image\//.test(r.headers.get('content-type') ?? '')) throw new Error(`not an image: ${url}`);
   return Buffer.from(await r.arrayBuffer());
}

async function wikiFile(name) {
   const r = await fetch(`${WIKI_API}?action=query&titles=${encodeURIComponent('File:' + name)}&prop=imageinfo&iiprop=url&format=json`,
      { headers: { 'User-Agent': USER_AGENT } });
   const page = Object.values((await r.json()).query.pages)[0];
   const url = page.imageinfo?.[0]?.url;
   if (!url) throw new Error(`wiki file not found: ${name}`);
   return url;
}

const exists = async (key) => s3.headObject({ Bucket: BUCKET, Key: key }).promise().then(() => true, () => false);

/** `…/portrait.png` → `…/portrait.png?v=2`; `?v=2` → `?v=3` */
function bumped(slug, current) {
   const v = Number(/[?&]v=(\d+)/.exec(current ?? '')?.[1] ?? 1);
   return `${PUBLIC_URL}/${slug}/portrait.png?v=${v + 1}`;
}

async function plan(slug, c) {
   const traveler = /^(aether|lumine)-/.exec(slug)?.[1];
   if (traveler) return { why: 'traveler cutout', url: await wikiFile(TRAVELER_PORTRAIT[traveler]) };
   if (PORTRAIT_FILES[slug]) return { why: 'wrong art', url: await wikiFile(PORTRAIT_FILES[slug]) };
   const standard = c.img?.portrait?.includes(`/${slug}/portrait.png`);
   return { why: standard ? 'flattened' : 'moved to the standard key', url: c.img?.portrait };
}

const files = (await fs.readdir(DATA_DIR)).filter((f) => f.endsWith('.json')).sort();
if (opts.preview) await fs.mkdir(opts.preview, { recursive: true });
let changed = 0;
const problems = [];

for (const f of files) {
   const slug = f.slice(0, -5);
   if (only && slug !== only) continue;
   const file = path.join(DATA_DIR, f);
   const c = JSON.parse(await fs.readFile(file, 'utf8'));
   if (!c.img?.portrait) continue;

   try {
      // Done already? The stored portrait is ours and transparent.
      const current = c.img.portrait.includes(`/${slug}/portrait.png`) ? await download(c.img.portrait) : null;
      if (current && (await opaqueBorder(current)) < 0.2) continue;

      const { why, url } = await plan(slug, c);
      let src = url === c.img.portrait && current ? current : await download(url);
      let note = why;
      if ((await opaqueBorder(src)) >= 0.2) {
         const { data, width, height, background } = await removeWhiteBackground(src);
         if (background < MIN_BACKGROUND) { problems.push(`${slug}: background isn't flat white (${(background * 100).toFixed(0)}% cleared)`); continue; }
         src = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
         note += `, background removed (${(background * 100).toFixed(0)}%)`;
      }
      const out = await sharp(src)
         .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
         .webp({ quality: 90, alphaQuality: 100 }).toBuffer();
      console.log(`${slug.padEnd(22)} ${note} → ${(out.length / 1024).toFixed(0)} KB`);

      if (opts.preview) {
         const thumb = await sharp(out).resize({ height: 480 }).flatten({ background: '#141826' }).png().toBuffer();
         await fs.writeFile(path.join(opts.preview, `${slug}.png`), thumb);
      }
      if (!opts.write) { changed++; continue; }

      const key = `${slug}/portrait.png`;
      const backup = `_backup/portraits/${slug}.png.bak`;
      if ((await exists(key)) && !(await exists(backup))) {
         await s3.copyObject({ Bucket: BUCKET, Key: backup, CopySource: `${BUCKET}/${key}` }).promise();
      }
      await s3.putObject({ Bucket: BUCKET, Key: key, Body: out, ContentType: 'image/webp', CacheControl: CACHE_CONTROL }).promise();
      for (const v of await renderVariants(out)) {
         await s3.putObject({ Bucket: BUCKET, Key: variantKey(key, v.width), Body: v.buffer, ContentType: 'image/webp', CacheControl: CACHE_CONTROL }).promise();
      }
      c.img.portrait = bumped(slug, c.img.portrait.includes(`/${slug}/portrait.png`) ? c.img.portrait : null);
      await fs.writeFile(file, JSON.stringify(c, null, 2));
      changed++;
   } catch (e) {
      problems.push(`${slug}: ${e.message}`);
   }
}

console.log(`\n${opts.write ? 'Fixed' : 'Would fix'} ${changed} portrait(s).${opts.write ? '' : ' Dry run — pass --write to upload.'}`);
if (problems.length) { console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`); process.exit(1); }
