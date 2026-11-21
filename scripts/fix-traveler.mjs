/**
 * Fixes all images for aether-{element} / lumine-{element} traveler variants.
 *
 * Run this after populate-characters.mjs adds new traveler element variants.
 *
 * What gets fixed:
 *   card             → wiki Traveler_Male/Female_Card.png (shared per gender)
 *   portrait         → wiki Traveler_(Male|Female)_Portrait.png (transparent cutout, shared per gender;
 *                      the per-element game art below is painted on a coloured background)
 *   constellation    → wiki Character_Aether/Lumine_Game_{Element}.png (914×1645, element-specific;
 *                      no separate constellation BG exists)
 *   constellation-N  → wiki "Constellation {UnlockName}.png" (element-specific, ~20KB each)
 *   talent icons     → yatta 10000005/7-{element} → Enka (element-specific)
 *
 * Usage:
 *   node scripts/fix-traveler.mjs              # all aether-* and lumine-* variants
 *   node scripts/fix-traveler.mjs aether-cryo  # one variant
 */

import S3 from 'aws-sdk/clients/s3.js';
import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data/characters');

const s3 = new S3({
   endpoint: `https://${process.env.R2_ID}.r2.cloudflarestorage.com/`,
   accessKeyId: process.env.AWS_ID,
   secretAccessKey: process.env.AWS_KEY,
   signatureVersion: 'v4',
});

const BUCKET = 'genshin-images';
const WIKI_API = 'https://genshin-impact.fandom.com/api.php';
const ENKA = 'https://enka.network/ui';
const YATTA = 'https://gi.yatta.moe';

const ELEMENTS = ['anemo', 'cryo', 'dendro', 'electro', 'geo', 'hydro', 'pyro'];
const ELEMENT_WIKI = { anemo:'Anemo', cryo:'Cryo', dendro:'Dendro', electro:'Electro', geo:'Geo', hydro:'Hydro', pyro:'Pyro' };
// yatta uses boy ID 10000005, girl ID 10000007
const YATTA_BASE = { aether: '10000005', lumine: '10000007' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function downloadBuffer(url) {
   const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120 genshin-api/1.0' } });
   if (!r.ok) throw new Error(`HTTP ${r.status}`);
   return Buffer.from(await r.arrayBuffer());
}

async function upload(key, buf) {
   await s3.putObject({ Bucket: BUCKET, Key: key, ContentType: 'image/png', Body: buf }).promise();
}

async function wikiUrl(fileName) {
   try {
      const r = await fetch(
         `${WIKI_API}?action=query&titles=${encodeURIComponent('File:' + fileName)}&prop=imageinfo&iiprop=url&format=json`,
         { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120' } }
      );
      const d = await r.json();
      const page = Object.values(d.query.pages)[0];
      return page.imageinfo?.[0]?.url || null;
   } catch { return null; }
}

async function tryUpload(candidates, r2Key) {
   for (const url of candidates) {
      if (!url) continue;
      try { await upload(r2Key, await downloadBuffer(url)); return true; } catch { /* try next */ }
   }
   return false;
}

// ── Determine which slugs to process ────────────────────────────────────────
const targetSlug = process.argv[2] || null;
const allFiles = await fs.readdir(DATA_DIR);
const slugs = allFiles
   .map(f => f.replace('.json', ''))
   .filter(s => s.startsWith('aether-') || s.startsWith('lumine-'))
   .filter(s => !targetSlug || s === targetSlug);

// ── Pre-fetch shared per-gender images (card) ────────────────────────────────
console.log('Fetching shared card images…');
const cardUrl = {
   aether: await wikiUrl('Traveler_Male_Card.png'),
   lumine: await wikiUrl('Traveler_Female_Card.png'),
};
console.log(`  aether card: ${cardUrl.aether ? 'found' : 'miss'}   lumine card: ${cardUrl.lumine ? 'found' : 'miss'}`);
const portraitUrl = {
   aether: await wikiUrl('Traveler_(Male)_Portrait.png'),
   lumine: await wikiUrl('Traveler_(Female)_Portrait.png'),
};

// ── Process each variant ─────────────────────────────────────────────────────
for (const slug of slugs) {
   const [gender, element] = slug.split('-');  // e.g. 'aether', 'cryo'
   const elName = ELEMENT_WIKI[element];
   const yattaId = `${YATTA_BASE[gender]}-${element}`;

   process.stdout.write(`\n→ ${slug.padEnd(20)}`);

   const charData = JSON.parse(await fs.readFile(path.join(DATA_DIR, `${slug}.json`), 'utf-8'));

   // 1. Card (shared per gender)
   const cardOk = await tryUpload([cardUrl[gender]], `${slug}/card.png`);
   process.stdout.write(cardOk ? ' card✓' : ' card✗');

   // 2. Portrait (shared transparent cutout) + constellation overview (element-specific game art)
   const portraitOk = await tryUpload([portraitUrl[gender]], `${slug}/portrait.png`);
   const gameArtUrl = await wikiUrl(`Character_${gender === 'aether' ? 'Aether' : 'Lumine'}_Game_${elName}.png`);
   const artOk = await tryUpload([gameArtUrl], `${slug}/constellation.png`);
   process.stdout.write(`${portraitOk ? ' portrait✓' : ' portrait✗'}${artOk ? ' constellation✓' : ' constellation✗'}`);

   // 3. Talent + constellation-level icons (element-specific, from yatta → Enka)
   let iconOk = 0, iconFail = 0;
   try {
      const res = await fetch(`${YATTA}/api/v2/en/avatar/${yattaId}`, { headers: { 'User-Agent': 'genshin-api/1.0' } });
      const d = (await res.json()).data;
      const talents = Array.isArray(d.talent) ? d.talent : Object.values(d.talent || {});
      const consts  = Array.isArray(d.constellation) ? d.constellation : Object.values(d.constellation || {});

      const iconMap = [
         [talents[0]?.icon, `${slug}/talent-1.png`],
         [talents[1]?.icon, `${slug}/talent-skill.png`],
         [talents[2]?.icon, `${slug}/talent-burst.png`],
         [talents[3]?.icon, `${slug}/talent-passive-1.png`],
         [talents[4]?.icon, `${slug}/talent-passive-2.png`],
         [talents[5]?.icon, `${slug}/talent-passive-0.png`],
         ...consts.map((c, i) => [c.icon, `${slug}/constellation-${i + 1}.png`]),
      ];

      for (const [icon, key] of iconMap) {
         if (!icon) { iconFail++; continue; }
         const ok = await tryUpload([`${ENKA}/${icon}.png`], key);
         ok ? iconOk++ : iconFail++;
      }
   } catch { iconFail += 12; }
   process.stdout.write(` icons:${iconOk}✓${iconFail ? iconFail + '✗' : ''}`);

   // 4. Constellation level icons upgraded to wiki quality (element-specific names from JSON)
   let constOk = 0, constFail = 0;
   for (let i = 0; i < charData.constellations.length; i++) {
      const name = charData.constellations[i].name;
      const url = await wikiUrl(`Constellation ${name}.png`);
      const ok = await tryUpload([url], `${slug}/constellation-${i + 1}.png`);
      ok ? constOk++ : constFail++;
      await sleep(300);
   }
   process.stdout.write(` wiki-consts:${constOk}✓${constFail ? constFail + '✗' : ''}`);

   await sleep(500);
}

console.log('\n\nDone.');
