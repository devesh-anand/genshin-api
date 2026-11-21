/**
 * Populates data/weapons/{slug}.json for all weapons.
 * Downloads icons to R2 under weapons/{slug}/icon.png and icon-awaken.png.
 *
 * Usage:
 *   node scripts/populate-weapons.mjs                 # all weapons
 *   node scripts/populate-weapons.mjs staff-of-homa   # one weapon by slug
 */

import S3 from 'aws-sdk/clients/s3.js';
import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanText } from './lib/text.mjs';
import { isWeaponSkin } from './lib/discover.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data/weapons');
const BUCKET = 'genshin-images';
const ENKA = 'https://enka.network/ui';
const YATTA = 'https://gi.yatta.moe/api/v2/en/weapon';
const R2_PUBLIC = 'https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev';

const s3 = new S3({
   endpoint: `https://${process.env.R2_ID}.r2.cloudflarestorage.com/`,
   accessKeyId: process.env.AWS_ID,
   secretAccessKey: process.env.AWS_KEY,
   signatureVersion: 'v4',
});

const TYPE_MAP = {
   WEAPON_SWORD_ONE_HAND: 'Sword',
   WEAPON_CLAYMORE:       'Claymore',
   WEAPON_POLE:           'Polearm',
   WEAPON_CATALYST:       'Catalyst',
   WEAPON_BOW:            'Bow',
};

const STAT_MAP = {
   FIGHT_PROP_CRITICAL_HURT:     'CRIT DMG',
   FIGHT_PROP_CRITICAL:          'CRIT Rate',
   FIGHT_PROP_ATTACK_PERCENT:    'ATK%',
   FIGHT_PROP_HP_PERCENT:        'HP%',
   FIGHT_PROP_DEFENSE_PERCENT:   'DEF%',
   FIGHT_PROP_ELEMENT_MASTERY:   'Elemental Mastery',
   FIGHT_PROP_CHARGE_EFFICIENCY: 'Energy Recharge',
   FIGHT_PROP_PHYSICAL_ADD_HURT: 'Physical DMG Bonus',
   FIGHT_PROP_ATTACK:            'ATK',
   FIGHT_PROP_HP:                'HP',
   FIGHT_PROP_DEFENSE:           'DEF',
   NONE:                         null,
   None:                         null,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function slugify(name) {
   return name.toLowerCase().replace(/['''""]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function download(url) {
   const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 genshin-api/1.0' } });
   if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
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

// ── Fetch full weapon list ───────────────────────────────────────────────────
const listRes = await fetch(YATTA);
const listJson = await listRes.json();
const allWeapons = Object.values(listJson.data.items).filter(w => !isWeaponSkin(w.id));

const targetSlug = process.argv[2] || null;

// Existing slugs — skip unless targeting one specific weapon
const existing = new Set((await fs.readdir(DATA_DIR)).map(f => f.replace('.json', '')));

const toProcess = allWeapons.filter(w => {
   const slug = slugify(w.name);
   if (targetSlug) return slug === targetSlug;
   return !existing.has(slug);
});

if (toProcess.length === 0) {
   console.log('Nothing to process. All weapons already exist.');
   process.exit(0);
}

console.log(`Processing ${toProcess.length} weapons…\n`);

for (const weapon of toProcess) {
   const slug = slugify(weapon.name);
   process.stdout.write(`→ ${slug.padEnd(35)}`);

   // Fetch full detail
   let detail;
   try {
      const res = await fetch(`${YATTA}/${weapon.id}`);
      detail = (await res.json()).data;
   } catch (e) {
      console.log(` SKIP (fetch error: ${e.message})`);
      await sleep(300);
      continue;
   }

   // Parse passive
   const affixEntry = detail.affix ? Object.values(detail.affix)[0] : null;
   const passiveName = affixEntry?.name ?? null;
   const passiveUpgrades = affixEntry?.upgrade
      ? Object.values(affixEntry.upgrade).map(cleanText)
      : null;

   // Parse base stats
   const props = detail.upgrade?.prop ?? [];
   const baseAtkProp = props.find(p => p.propType === 'FIGHT_PROP_BASE_ATTACK');
   const baseAtk = baseAtkProp ? Math.round(baseAtkProp.initValue * 10) / 10 : null;
   const subStatProp = props.find(p => p.propType !== 'FIGHT_PROP_BASE_ATTACK');
   const subStatKey = subStatProp?.propType ?? detail.specialProp ?? 'NONE';

   // Images
   const iconKey  = `weapons/${slug}/icon.png`;
   const awakenKey = `weapons/${slug}/icon-awaken.png`;
   const iconOk   = await tryUpload(`${ENKA}/${detail.icon}.png`, iconKey);
   const awakenOk = await tryUpload(`${ENKA}/${detail.icon}_Awaken.png`, awakenKey);
   process.stdout.write(` icon:${iconOk?'✓':'✗'} awaken:${awakenOk?'✓':'✗'}`);

   const json = {
      id: detail.id,
      name: detail.name,
      description: cleanText(detail.description),
      rarity: detail.rank,
      type: TYPE_MAP[detail.type] ?? detail.type,
      type_key: detail.type,
      sub_stat: STAT_MAP[subStatKey] ?? null,
      sub_stat_key: subStatKey,
      base_atk: baseAtk,
      passive_name: passiveName,
      passive_desc: passiveUpgrades?.[0] ?? null,
      passive_upgrades: passiveUpgrades,
      img: {
         icon:        iconOk  ? `${R2_PUBLIC}/weapons/${slug}/icon.png`        : null,
         'icon-awaken': awakenOk ? `${R2_PUBLIC}/weapons/${slug}/icon-awaken.png` : null,
      },
   };

   await fs.writeFile(path.join(DATA_DIR, `${slug}.json`), JSON.stringify(json, null, 2));
   process.stdout.write(' ✓\n');
   await sleep(300);
}

console.log('\nDone.');
