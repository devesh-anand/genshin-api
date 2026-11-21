/**
 * Populates material data from gi.yatta.moe.
 *
 * Categories included:
 *   common-drop       → characterandWeaponEnhancementMaterial (slime drops, hilichurl masks, etc.)
 *   boss-drop         → characterLevelUpMaterial rank 1-4 (world boss drops)
 *   weekly-boss-drop  → characterLevelUpMaterial rank 5 (weekly boss drops)
 *   talent-book       → characterTalentMaterial
 *   ascension-gem     → characterAscensionMaterial
 *   weapon-material   → weaponAscensionMaterial
 *   field-material    → material (elemental flowers, etc. used for ascension)
 *   local-specialty   → localSpecialty* types
 *   exp-material      → characterEXPMaterial / weaponEnhancementMaterial (Hero's Wit, Mystic Enhancement Ore, ...)
 *   weapon-billet     → 'material' items named '... Billet' (weapon forging inputs, dropped by bosses)
 *
 * source, region, exp, family/tier/craft are filled in afterwards by enrich-materials.mjs.
 *
 * Usage:
 *   node scripts/populate-materials.mjs              # all missing
 *   node scripts/populate-materials.mjs slime-condensate  # one material
 */

import S3 from 'aws-sdk/clients/s3.js';
import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanText } from './lib/text.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data/materials');
const BUCKET = 'genshin-images';
const R2_PUBLIC = 'https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev';
const YATTA = 'https://gi.yatta.moe';

const s3 = new S3({
   endpoint: `https://${process.env.R2_ID}.r2.cloudflarestorage.com/`,
   accessKeyId: process.env.AWS_ID,
   secretAccessKey: process.env.AWS_KEY,
   signatureVersion: 'v4',
});

// yatta type → our category
const TYPE_CATEGORY = {
   characterandWeaponEnhancementMaterial: 'common-drop',
   characterTalentMaterial:               'talent-book',
   characterAscensionMaterial:            'ascension-gem',
   weaponAscensionMaterial:               'weapon-material',
   characterEXPMaterial:                  'exp-material',
   weaponEnhancementMaterial:             'exp-material',
   // 'material' type skipped: yatta doesn't populate requiredBy for these,
   // mixing useful field items (Mist Flower Corolla) with furniture crafting noise.
   // local specialties — matched by prefix
};

function isLocalSpecialty(type) {
   return type.startsWith('localSpecialty');
}

function getCategory(type, rank, name = '') {
   if (isLocalSpecialty(type)) return 'local-specialty';
   if (type === 'material' && / Billet$/.test(name)) return 'weapon-billet';
   if (type === 'characterLevelUpMaterial') {
      return rank >= 5 ? 'weekly-boss-drop' : 'boss-drop';
   }
   return TYPE_CATEGORY[type] ?? null;
}

function slugify(name) {
   return name
      .toLowerCase()
      .replace(/['''""()]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url) {
   const res = await fetch(url, {
      headers: { 'User-Agent': 'genshin-api/1.0' },
   });
   if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
   return res.json();
}

async function downloadBuffer(url) {
   const res = await fetch(url, { headers: { 'User-Agent': 'genshin-api/1.0' } });
   if (!res.ok) throw new Error(`HTTP ${res.status}`);
   return Buffer.from(await res.arrayBuffer());
}

async function uploadToR2(key, buffer) {
   await s3.putObject({ Bucket: BUCKET, Key: key, ContentType: 'image/png', Body: buffer }).promise();
   return `${R2_PUBLIC}/${key}`;
}

async function processMaterial(item, existing) {
   const slug = slugify(item.name || item.route);
   const category = getCategory(item.type, item.rank, item.name);
   if (!category) return null;
   if (existing.has(slug)) return null;

   process.stdout.write(`\n→ ${slug.padEnd(48)}`);

   let detail;
   try {
      const res = await fetchJSON(`${YATTA}/api/v2/en/material/${item.id}`);
      detail = res.data;
   } catch (e) {
      process.stdout.write(` FETCH_ERROR: ${e.message}`);
      return null;
   }

   // droppedBy → slugified monster names
   const dropped_by = (detail.additions?.droppedBy || [])
      .map((m) => slugify(m.name))
      .filter(Boolean);

   // requiredBy → character and weapon slugs
   const used_by = {
      characters: (detail.additions?.requiredBy?.avatar || []).map((a) => slugify(a.name)),
      weapons:    (detail.additions?.requiredBy?.weapon || []).map((w) => slugify(w.name)),
   };

   // Upload icon
   let img = `${R2_PUBLIC}/materials/${slug}/icon.png`;
   try {
      const iconUrl = `${YATTA}/assets/UI/${item.icon}.png`;
      const buf = await downloadBuffer(iconUrl);
      img = await uploadToR2(`materials/${slug}/icon.png`, buf);
      process.stdout.write('.');
   } catch {
      process.stdout.write('✗');
   }

   const matJSON = {
      id: item.id,
      name: detail.name || item.name,
      description: cleanText(detail.description),
      rarity: item.rank,
      category,
      dropped_by,
      used_by,
      img,
   };

   await fs.writeFile(path.join(DATA_DIR, `${slug}.json`), JSON.stringify(matJSON, null, 2));
   process.stdout.write(' ✓');
   return slug;
}

async function main() {
   await fs.mkdir(DATA_DIR, { recursive: true });

   const existing = new Set(
      (await fs.readdir(DATA_DIR)).map((f) => f.replace('.json', ''))
   );
   console.log(`Existing materials: ${existing.size}`);

   const listRes = await fetchJSON(`${YATTA}/api/v2/en/material`);
   const allItems = Object.values(listRes.data?.items || {});
   console.log(`yatta.moe total items: ${allItems.length}`);

   // Filter to relevant categories
   const relevant = allItems.filter((item) => getCategory(item.type, item.rank, item.name) !== null);
   console.log(`Relevant materials: ${relevant.length}`);

   const targetSlug = process.argv[2] ?? null;

   let processed = 0;
   for (const item of relevant) {
      const slug = slugify(item.name || item.route);
      if (targetSlug && slug !== targetSlug) continue;
      if (!targetSlug && existing.has(slug)) continue;

      try {
         const result = await processMaterial(item, existing);
         if (result) processed++;
      } catch (e) {
         console.error(`\n  ERROR: ${slugify(item.name)}: ${e.message}`);
      }
      await sleep(300);
   }

   console.log(`\n\nDone. ${processed} materials written.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
