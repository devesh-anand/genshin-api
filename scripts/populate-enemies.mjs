/**
 * Populates enemy data from gi.yatta.moe.
 *
 * Includes: ELEMENTAL, HILICHURL, ABYSS, FATUI, AUTOMATRON, HUMAN, BEAST, BOSS
 * Excludes: FISH, CRITTER, ANIMAL, AVIARY (non-combat)
 *
 * Usage:
 *   node scripts/populate-enemies.mjs              # all missing
 *   node scripts/populate-enemies.mjs dendro-slime # one enemy
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
const DATA_DIR = path.join(__dirname, '../data/enemies');
const BUCKET = 'genshin-images';
const R2_PUBLIC = 'https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev';
const YATTA = 'https://gi.yatta.moe';

const s3 = new S3({
   endpoint: `https://${process.env.R2_ID}.r2.cloudflarestorage.com/`,
   accessKeyId: process.env.AWS_ID,
   secretAccessKey: process.env.AWS_KEY,
   signatureVersion: 'v4',
});

const SKIP_TYPES = new Set(['FISH', 'CRITTER', 'ANIMAL', 'AVIARY']);

const TYPE_DISPLAY = {
   ELEMENTAL:   'Elemental Lifeform',
   HILICHURL:   'Hilichurl',
   ABYSS:       'Abyss',
   FATUI:       'Fatui',
   AUTOMATRON:  'Automatron',
   HUMAN:       'Human Faction',
   BEAST:       'Beast',
   BOSS:        'Boss',
};

// Mora ID — exclude from drops
const MORA_ID = 202;

function slugify(name) {
   return name
      .toLowerCase()
      .replace(/['''""(),]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url) {
   const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
   if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
   return res.json();
}

async function downloadBuffer(url) {
   const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
   if (!res.ok) throw new Error(`HTTP ${res.status}`);
   return Buffer.from(await res.arrayBuffer());
}

async function uploadToR2(key, buffer) {
   await s3.putObject({ Bucket: BUCKET, Key: key, ContentType: 'image/png', Body: buffer }).promise();
   return `${R2_PUBLIC}/${key}`;
}

async function processEnemy(listEntry, existing) {
   const slug = slugify(listEntry.route || listEntry.name);
   if (existing.has(slug)) return null;

   process.stdout.write(`\n→ ${slug.padEnd(52)}`);

   let detail;
   try {
      const res = await fetchJSON(`${YATTA}/api/v2/en/monster/${listEntry.id}`);
      detail = res.data;
   } catch (e) {
      process.stdout.write(` FETCH_ERROR: ${e.message}`);
      return null;
   }

   // Collect drops: union of all entries' rewards, excluding Mora
   const dropMap = new Map(); // id → name
   for (const entry of Object.values(detail.entries || {})) {
      for (const [id, item] of Object.entries(entry.reward || {})) {
         if (Number(id) !== MORA_ID) {
            dropMap.set(Number(id), item.name);
         }
      }
   }
   // Deduplicate and filter to only slugs that exist as material files
   const matFiles = await fs.readdir(path.join(__dirname, '../data/materials')).catch(() => []);
   const validMats = new Set(matFiles.map(f => f.replace('.json', '')));
   const drops = [...new Set([...dropMap.values()].map(slugify))].filter(s => validMats.has(s));

   // Upload icon
   let img = `${R2_PUBLIC}/enemies/${slug}/icon.png`;
   try {
      const iconUrl = `${YATTA}/assets/UI/monster/${listEntry.icon}.png`;
      const buf = await downloadBuffer(iconUrl);
      img = await uploadToR2(`enemies/${slug}/icon.png`, buf);
      process.stdout.write('.');
   } catch {
      process.stdout.write('✗');
   }

   const enemyJSON = {
      id: listEntry.id,
      name: detail.name || listEntry.name,
      description: cleanText(detail.description),
      type: TYPE_DISPLAY[listEntry.type] || listEntry.type,
      drops,
      img,
   };

   await fs.writeFile(path.join(DATA_DIR, `${slug}.json`), JSON.stringify(enemyJSON, null, 2));
   process.stdout.write(' ✓');
   return slug;
}

async function main() {
   await fs.mkdir(DATA_DIR, { recursive: true });

   const existing = new Set(
      (await fs.readdir(DATA_DIR)).map((f) => f.replace('.json', ''))
   );
   console.log(`Existing enemies: ${existing.size}`);

   const listRes = await fetchJSON(`${YATTA}/api/v2/en/monster`);
   const allMonsters = Object.values(listRes.data?.items || {});
   console.log(`yatta.moe total monsters: ${allMonsters.length}`);

   const relevant = allMonsters.filter((m) => !SKIP_TYPES.has(m.type));
   console.log(`Combat monsters: ${relevant.length}`);

   const targetSlug = process.argv[2] ?? null;

   let processed = 0;
   for (const monster of relevant) {
      const slug = slugify(monster.route || monster.name);
      if (targetSlug && slug !== targetSlug) continue;
      if (!targetSlug && existing.has(slug)) continue;

      try {
         const result = await processEnemy(monster, existing);
         if (result) processed++;
      } catch (e) {
         console.error(`\n  ERROR: ${slug}: ${e.message}`);
      }
      await sleep(300);
   }

   console.log(`\n\nDone. ${processed} enemies written.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
