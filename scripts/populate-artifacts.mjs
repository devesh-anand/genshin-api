/**
 * Populates data/artifacts/{slug}.json for all artifact sets.
 * Downloads piece icons to R2 under artifacts/{slug}/{piece}.png.
 *
 * Piece keys: flower, plume, sands, goblet, circlet
 *
 * Usage:
 *   node scripts/populate-artifacts.mjs                       # all sets
 *   node scripts/populate-artifacts.mjs pale-flame            # one set by slug
 */

import S3 from 'aws-sdk/clients/s3.js';
import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanText } from './lib/text.mjs';
import { USER_AGENT } from './lib/source.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data/artifacts');
const BUCKET = 'genshin-images';
const ENKA = 'https://enka.network/ui';
const YATTA_BASE = 'https://gi.yatta.moe/api/v2/en/reliquary';
const R2_PUBLIC = 'https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev';

const s3 = new S3({
   endpoint: `https://${process.env.R2_ID}.r2.cloudflarestorage.com/`,
   accessKeyId: process.env.AWS_ID,
   secretAccessKey: process.env.AWS_KEY,
   signatureVersion: 'v4',
});

// Maps yatta slot key → friendly key used in our JSON
const SLOT_MAP = {
   EQUIP_BRACER:  'flower',
   EQUIP_NECKLACE: 'plume',
   EQUIP_SHOES:   'sands',
   EQUIP_RING:    'goblet',
   EQUIP_DRESS:   'circlet',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function slugify(name) {
   return name.toLowerCase().replace(/['''""]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function download(url) {
   const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
   if (!r.ok) throw new Error(`HTTP ${r.status}`);
   return Buffer.from(await r.arrayBuffer());
}

async function upload(key, buf) {
   await s3.putObject({ Bucket: BUCKET, Key: key, ContentType: 'image/png', Body: buf }).promise();
}

async function tryUpload(url, key) {
   try {
      const buf = await download(url);
      await upload(key, buf);
      return true;
   } catch { return false; }
}

// ── Fetch full artifact list ─────────────────────────────────────────────────
const listRes = await fetch(YATTA_BASE, { headers: { 'User-Agent': USER_AGENT } });
const listJson = await listRes.json();
const allSets = Object.values(listJson.data.items);

const targetSlug = process.argv[2] || null;

const existing = new Set((await fs.readdir(DATA_DIR)).map(f => f.replace('.json', '')));

const toProcess = allSets.filter(s => {
   const slug = slugify(s.name);
   if (targetSlug) return slug === targetSlug;
   return !existing.has(slug);
});

if (toProcess.length === 0) {
   console.log('Nothing to process. All artifact sets already exist.');
   process.exit(0);
}

console.log(`Processing ${toProcess.length} artifact sets…\n`);

for (const set of toProcess) {
   const slug = slugify(set.name);
   process.stdout.write(`→ ${slug.padEnd(40)}`);

   // Fetch full detail
   let detail;
   try {
      const res = await fetch(`${YATTA_BASE}/${set.id}`, { headers: { 'User-Agent': USER_AGENT } });
      detail = (await res.json()).data;
   } catch (e) {
      console.log(` SKIP (${e.message})`);
      await sleep(300);
      continue;
   }

   // Parse set bonuses: levelList [2,4] → 2pc and 4pc bonuses from affixList
   const affixValues = Object.values(detail.affixList || {});
   const bonuses = {};
   const levels = detail.levelList ?? [];
   levels.forEach((lvl, i) => { bonuses[`${lvl}pc`] = affixValues[i] != null ? cleanText(affixValues[i]) : null; });

   // Parse pieces
   const pieces = {};
   const imgUrls = {};
   for (const [slotKey, piece] of Object.entries(detail.suit || {})) {
      const friendlyKey = SLOT_MAP[slotKey];
      if (!friendlyKey) continue;
      const r2Key = `artifacts/${slug}/${friendlyKey}.png`;
      const ok = await tryUpload(`${ENKA}/${piece.icon}.png`, r2Key);
      pieces[friendlyKey] = {
         name: piece.name,
         description: cleanText(piece.description),
         img: ok ? `${R2_PUBLIC}/${r2Key}` : null,
      };
      if (ok) imgUrls[friendlyKey] = `${R2_PUBLIC}/${r2Key}`;
      process.stdout.write('.');
   }

   // Max rarity from levelList length (sets with only 2-pc have levelList [2])
   const maxRarity = levels.includes(4) ? 5 : 4;

   const json = {
      id: detail.id,
      name: detail.name,
      rarity: maxRarity,
      bonus: bonuses,
      pieces,
   };

   await fs.writeFile(path.join(DATA_DIR, `${slug}.json`), JSON.stringify(json, null, 2));
   process.stdout.write(' ✓\n');
   await sleep(400);
}

console.log('\nDone.');
