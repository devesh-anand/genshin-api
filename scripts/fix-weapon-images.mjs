/**
 * Adds high-quality weapon images from the Genshin wiki to each weapon JSON.
 *
 * Adds to img:
 *   wish  → Weapon_{Name}_Wish.png  (transparent background, 512×1024)
 *   full  → Weapon_{Name}_3D.png    (full 3D render, ~600×900, highest quality)
 *
 * Usage:
 *   node scripts/fix-weapon-images.mjs                    # all weapons
 *   node scripts/fix-weapon-images.mjs staff-of-homa      # one weapon
 */

import S3 from 'aws-sdk/clients/s3.js';
import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { USER_AGENT } from './lib/source.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data/weapons');
const BUCKET = 'genshin-images';
const WIKI_API = 'https://genshin-impact.fandom.com/api.php';
const R2_PUBLIC = 'https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev';

const s3 = new S3({
   endpoint: `https://${process.env.R2_ID}.r2.cloudflarestorage.com/`,
   accessKeyId: process.env.AWS_ID,
   secretAccessKey: process.env.AWS_KEY,
   signatureVersion: 'v4',
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function wikiUrl(fileName) {
   try {
      const r = await fetch(
         `${WIKI_API}?action=query&titles=${encodeURIComponent('File:' + fileName)}&prop=imageinfo&iiprop=url&format=json`,
         { headers: { 'User-Agent': USER_AGENT } }
      );
      const d = await r.json();
      const page = Object.values(d.query.pages)[0];
      return page.imageinfo?.[0]?.url ?? null;
   } catch { return null; }
}

async function download(url) {
   const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
   if (!r.ok) throw new Error(`HTTP ${r.status}`);
   return Buffer.from(await r.arrayBuffer());
}

async function tryUpload(url, r2Key) {
   if (!url) return false;
   try {
      const buf = await download(url);
      await s3.putObject({ Bucket: BUCKET, Key: r2Key, ContentType: 'image/png', Body: buf }).promise();
      return true;
   } catch { return false; }
}

const targetSlug = process.argv[2] ?? null;
const allFiles = await fs.readdir(DATA_DIR);
const slugs = allFiles
   .map(f => f.replace('.json', ''))
   .filter(s => !targetSlug || s === targetSlug);

let ok = 0, miss = 0;

for (const slug of slugs) {
   const filePath = path.join(DATA_DIR, `${slug}.json`);
   const weapon = JSON.parse(await fs.readFile(filePath, 'utf-8'));
   const wikiName = `Weapon_${weapon.name.replace(/ /g, '_')}`;

   process.stdout.write(`→ ${slug.padEnd(45)}`);

   const [wishUrl, fullUrl] = await Promise.all([
      wikiUrl(`${wikiName}_Wish.png`),
      wikiUrl(`${wikiName}_3D.png`),
   ]);

   const wishOk = await tryUpload(wishUrl, `weapons/${slug}/wish.png`);
   const fullOk = await tryUpload(fullUrl, `weapons/${slug}/full.png`);

   if (wishOk) weapon.img.wish = `${R2_PUBLIC}/weapons/${slug}/wish.png`;
   if (fullOk) weapon.img.full = `${R2_PUBLIC}/weapons/${slug}/full.png`;

   await fs.writeFile(filePath, JSON.stringify(weapon, null, 2));

   process.stdout.write(` wish:${wishOk ? '✓' : '✗'} full:${fullOk ? '✓' : '✗'}\n`);
   wishOk || fullOk ? ok++ : miss++;

   await sleep(350);
}

console.log(`\nDone. ${ok} updated, ${miss} had no wiki images.`);
