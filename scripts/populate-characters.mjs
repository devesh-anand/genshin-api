/**
 * Populates missing Genshin Impact characters by:
 * 1. Fetching character data from gi.yatta.moe API
 * 2. Downloading images from Enka Network / yatta CDN
 * 3. Uploading images to Cloudflare R2
 * 4. Writing JSON files to data/characters/
 *
 * Usage:
 *   node scripts/populate-characters.mjs            # process all missing
 *   node scripts/populate-characters.mjs nahida      # process one character
 */

import S3 from 'aws-sdk/clients/s3.js';
import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const s3 = new S3({
   endpoint: `https://${process.env.R2_ID}.r2.cloudflarestorage.com/`,
   accessKeyId: process.env.AWS_ID,
   secretAccessKey: process.env.AWS_KEY,
   signatureVersion: 'v4',
});

const BUCKET = 'genshin-images';
const PUBLIC_URL = 'https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev';
const DATA_DIR = path.join(__dirname, '../data/characters');
const YATTA = 'https://gi.yatta.moe';
const ENKA = 'https://enka.network/ui';
const WIKI_API = 'https://genshin-impact.fandom.com/api.php';

// yatta.moe element → our vision name
const ELEMENT_MAP = {
   Fire: 'Pyro',
   Ice: 'Cryo',
   Water: 'Hydro',
   Wind: 'Anemo',
   Rock: 'Geo',
   Electric: 'Electro',
   Grass: 'Dendro',
};

// yatta.moe weaponType → { display, key }
const WEAPON_MAP = {
   WEAPON_SWORD_ONE_HAND: { display: 'Sword', key: 'SWORD' },
   WEAPON_CATALYST: { display: 'Catalyst', key: 'CATALYST' },
   WEAPON_CLAYMORE: { display: 'Claymore', key: 'CLAYMORE' },
   WEAPON_BOW: { display: 'Bow', key: 'BOW' },
   WEAPON_POLE: { display: 'Polearm', key: 'POLEARM' },
};

// Characters with shortened filenames in our existing data
const SLUG_OVERRIDES = {
   'kamisato-ayaka': 'ayaka',
   'kamisato-ayato': 'ayato',
   'kujou-sara': 'sara',
   'yae-miko': 'yae',
   'kuki-shinobu': 'kuki',
   'arataki-itto': 'itto',
   'sangonomiya-kokomi': 'kokomi',
   'raiden-shogun': 'raiden',
   'kaedehara-kazuha': 'kazuha',
   'shikanoin-heizou': 'heizou',
};

// Characters to skip entirely (non-playable, bosses, NPCs, or confirmed unreleased)
const SKIP_SLUGS = new Set([
   'manekin', 'manekina',  // test/placeholder characters
]);

// Skip Traveler — handled as separate traveler-{element}.json files
const TRAVELER_IDS = new Set([10000005, 10000007]);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function wikiFileUrl(fileName) {
   try {
      const r = await fetch(
         `${WIKI_API}?action=query&titles=${encodeURIComponent('File:' + fileName)}&prop=imageinfo&iiprop=url&format=json`,
         { headers: { 'User-Agent': 'Mozilla/5.0 genshin-api/1.0' } }
      );
      const d = await r.json();
      const page = Object.values(d.query.pages)[0];
      return page.imageinfo?.[0]?.url ?? null;
   } catch { return null; }
}

async function fetchJSON(url) {
   const res = await fetch(url, {
      headers: { 'User-Agent': 'genshin-api-updater/1.0 (github.com/devesh-anand/genshin-api)' },
   });
   if (!res.ok) throw new Error(`HTTP ${res.status}`);
   return res.json();
}

async function downloadBuffer(url) {
   const res = await fetch(url, {
      headers: { 'User-Agent': 'genshin-api-updater/1.0' },
   });
   if (!res.ok) throw new Error(`HTTP ${res.status}`);
   return Buffer.from(await res.arrayBuffer());
}

async function uploadToR2(r2Key, buffer) {
   await s3.putObject({ Bucket: BUCKET, Key: r2Key, ContentType: 'image/png', Body: buffer }).promise();
   return `${PUBLIC_URL}/${r2Key}`;
}

// Try each URL in order; upload the first that succeeds. Returns public URL.
async function tryImg(candidates, r2Key) {
   for (const url of candidates) {
      if (!url) continue;
      try {
         const buf = await downloadBuffer(url);
         const uploaded = await uploadToR2(r2Key, buf);
         process.stdout.write('.');
         return uploaded;
      } catch {
         // try next candidate
      }
   }
   process.stdout.write('✗');
   return `${PUBLIC_URL}/${r2Key}`; // placeholder — image will be missing in R2
}

function titleCase(str) {
   if (!str) return '';
   return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Strip Genshin's in-game text markup: <color=#...>, </color>, <i>, </i>
function cleanText(str) {
   if (!str) return '';
   return str
      .replace(/<color=#[0-9A-Fa-f]+>/g, '')
      .replace(/<\/color>/g, '')
      .replace(/<\/?i>/g, '')
      .replace(/\\n/g, '\n')
      .trim();
}

function formatBirthday(arr) {
   if (!Array.isArray(arr) || arr.length < 2) return '0000-00-00';
   const [month, day] = arr;
   return `0000-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// yatta.moe `route` is the character display name with spaces, e.g. "Kamisato Ayaka".
// Convert to a URL-friendly slug then apply any overrides.
function toSlug(route) {
   return route.toLowerCase().replace(/\s+/g, '-');
}

function getSlug(route) {
   const base = toSlug(route);
   return SLUG_OVERRIDES[base] || base;
}

async function processCharacter(charId, charRoute, existing) {
   const slug = getSlug(charRoute);

   if (existing.has(slug)) return;

   process.stdout.write(`\n→ ${slug.padEnd(24)}`);

   let d;
   try {
      const res = await fetchJSON(`${YATTA}/api/v2/en/avatar/${charId}`);
      d = res.data;
   } catch (e) {
      process.stdout.write(` FETCH_ERROR: ${e.message}`);
      return;
   }

   const iconName = d.icon || `UI_AvatarIcon_${slug}`;
   const internalName = iconName.replace('UI_AvatarIcon_', '');
   const vision = ELEMENT_MAP[d.element] || d.element || 'Unknown';
   const weaponInfo = WEAPON_MAP[d.weaponType] || { display: d.weaponType || '', key: d.weaponType || '' };
   const nation = titleCase(d.region);
   const yattaUI = `${YATTA}/assets/UI`;

   // talent is a 0-indexed array:
   //   [0] Normal Attack  [1] Elemental Skill  [2] Elemental Burst
   //   [3] Passive A1     [4] Passive A4       [5] Passive (auto/utility)
   const talents = Array.isArray(d.talent) ? d.talent : Object.values(d.talent || {});

   const talentImg = (icon, r2name) =>
      tryImg([`${yattaUI}/${icon}.png`, `${ENKA}/${icon}.png`], `${slug}/${r2name}`);

   // ── Skill Talents ────────────────────────────────────────────────────────────
   const skillTalents = [
      {
         name: talents[0]?.name || 'Normal Attack',
         unlock: 'Normal Attack',
         description: cleanText(talents[0]?.description),
         upgrades: [],
         type: 'NORMAL_ATTACK',
         img: talents[0]?.icon
            ? await talentImg(talents[0].icon, 'talent-1.png')
            : `${PUBLIC_URL}/${slug}/talent-1.png`,
      },
      {
         name: talents[1]?.name || 'Elemental Skill',
         unlock: 'Elemental Skill',
         description: cleanText(talents[1]?.description),
         upgrades: [],
         type: 'ELEMENTAL_SKILL',
         img: talents[1]?.icon
            ? await talentImg(talents[1].icon, 'talent-skill.png')
            : `${PUBLIC_URL}/${slug}/talent-skill.png`,
      },
      {
         name: talents[2]?.name || 'Elemental Burst',
         unlock: 'Elemental Burst',
         description: cleanText(talents[2]?.description),
         upgrades: [],
         type: 'ELEMENTAL_BURST',
         img: talents[2]?.icon
            ? await talentImg(talents[2].icon, 'talent-burst.png')
            : `${PUBLIC_URL}/${slug}/talent-burst.png`,
      },
   ];

   // ── Passive Talents ──────────────────────────────────────────────────────────
   const passiveTalents = [
      {
         name: talents[3]?.name || '',
         unlock: 'Unlocked at Ascension 1',
         description: cleanText(talents[3]?.description),
         level: 1,
         img: talents[3]?.icon
            ? await talentImg(talents[3].icon, 'talent-passive-1.png')
            : `${PUBLIC_URL}/${slug}/talent-passive-1.png`,
      },
      {
         name: talents[4]?.name || '',
         unlock: 'Unlocked at Ascension 4',
         description: cleanText(talents[4]?.description),
         level: 4,
         img: talents[4]?.icon
            ? await talentImg(talents[4].icon, 'talent-passive-2.png')
            : `${PUBLIC_URL}/${slug}/talent-passive-2.png`,
      },
      {
         name: talents[5]?.name || '',
         unlock: 'Unlocked Automatically',
         description: cleanText(talents[5]?.description),
         img: talents[5]?.icon
            ? await talentImg(talents[5].icon, 'talent-passive-0.png')
            : `${PUBLIC_URL}/${slug}/talent-passive-0.png`,
      },
   ];

   // ── Constellations ───────────────────────────────────────────────────────────
   const constArr = Array.isArray(d.constellation)
      ? d.constellation
      : Object.values(d.constellation || {});

   const constellations = await Promise.all(
      constArr.map(async (con, i) => ({
         name: con.name || `Constellation ${i + 1}`,
         unlock: `Constellation Lv. ${i + 1}`,
         description: cleanText(con.description),
         level: i + 1,
         img: con.icon
            ? await talentImg(con.icon, `constellation-${i + 1}.png`)
            : `${PUBLIC_URL}/${slug}/constellation-${i + 1}.png`,
      }))
   );

   // ── Main Images ──────────────────────────────────────────────────────────────
   // Wiki sources are higher quality for card/portrait/constellation.
   // Fetch wiki URLs in parallel first, then upload with Enka as fallback.
   const wikiName = (d.name || '').replace(/ /g, '_');
   const constellationName = (d.fetter?.constellation || '').replace(/ /g, '_');
   const [wikiCardUrl, wikiPortraitUrl, wikiConstUrl] = await Promise.all([
      wikiFileUrl(`${wikiName}_Card.png`),
      wikiFileUrl(`${wikiName}_Portrait.png`),
      wikiFileUrl(`${constellationName}.png`),
   ]);

   const [card, banner, icon, portrait, constellationImg, iconBig] = await Promise.all([
      tryImg(
         [
            wikiCardUrl,
            `${ENKA}/UI_AvatarIcon_${internalName}_Card.png`,
            `${yattaUI}/UI_AvatarIcon_${internalName}_Card.png`,
         ],
         `${slug}/card.png`
      ),
      tryImg(
         [
            `${ENKA}/UI_Gacha_AvatarImg_${internalName}.png`,
            `${yattaUI}/UI_Gacha_AvatarImg_${internalName}.png`,
         ],
         `${slug}/gacha-splash.png`
      ),
      tryImg(
         [`${ENKA}/${iconName}.png`, `${yattaUI}/${iconName}.png`],
         `${slug}/icon.png`
      ),
      tryImg(
         [
            wikiPortraitUrl,
            wikiCardUrl,
            `${ENKA}/UI_AvatarIcon_Side_${internalName}.png`,
            `${yattaUI}/UI_AvatarIcon_Side_${internalName}.png`,
         ],
         `${slug}/portrait.png`
      ),
      tryImg(
         [
            wikiConstUrl,
            `${ENKA}/Eff_UI_Talent_${internalName}.png`,
            `${yattaUI}/Eff_UI_Talent_${internalName}.png`,
            `${ENKA}/${iconName}.png`,
         ],
         `${slug}/constellation.png`
      ),
      tryImg(
         [`${ENKA}/${iconName}.png`, `${yattaUI}/${iconName}.png`],
         `${slug}/icon-big.png`
      ),
   ]);

   // ── Write JSON ───────────────────────────────────────────────────────────────
   const charJSON = {
      name: d.name,
      title: d.fetter?.title || '',
      vision,
      weapon: weaponInfo.display,
      nation,
      affiliation: d.fetter?.native || '',
      rarity: d.rank,
      constellation: d.fetter?.constellation || '',
      birthday: formatBirthday(d.birthday),
      description: cleanText(d.fetter?.detail),
      skillTalents,
      passiveTalents,
      constellations,
      vision_key: vision.toUpperCase(),
      weapon_type: weaponInfo.key,
      img: {
         card,
         constellation: constellationImg,
         banner,
         icon,
         'icon-big': iconBig,
         portrait,
      },
   };

   await fs.writeFile(
      path.join(DATA_DIR, `${slug}.json`),
      JSON.stringify(charJSON, null, 2)
   );
   process.stdout.write(' ✓');
}

async function main() {
   const existing = new Set(
      (await fs.readdir(DATA_DIR)).map(f => f.replace('.json', ''))
   );
   console.log(`Existing characters: ${existing.size}`);

   const arg = process.argv[2] || null;

   // If arg is a numeric ID, fetch that character directly (bypasses list endpoint)
   if (arg && /^\d+$/.test(arg)) {
      const res = await fetchJSON(`${YATTA}/api/v2/en/avatar/${arg}`);
      const d = res.data;
      if (!d) { console.error('Character not found'); process.exit(1); }
      await processCharacter(Number(arg), d.name, existing);
      console.log('\n\nProcessed 1 new character.');
      return;
   }

   const listRes = await fetchJSON(`${YATTA}/api/v2/en/avatar`);
   const characters = Object.values(listRes.data?.items || {});
   console.log(`yatta.moe total: ${characters.length}`);

   const targetSlug = arg;

   let processed = 0;
   for (const char of characters) {
      if (TRAVELER_IDS.has(char.id)) continue;
      // Skip yatta entries that resolve to traveler-boy/girl slugs (duplicates of aether-*/lumine-*)
      if (/traveler-(boy|girl)$/.test(getSlug(char.route))) continue;

      const slug = getSlug(char.route);
      if (SKIP_SLUGS.has(slug)) continue;
      if (targetSlug && slug !== targetSlug) continue;
      if (!targetSlug && existing.has(slug)) continue;

      try {
         await processCharacter(char.id, char.route, existing);
         processed++;
      } catch (e) {
         console.error(`\n  ERROR processing ${getSlug(char.route)}: ${e.message}`);
      }
      await sleep(800); // respectful rate limiting
   }

   console.log(`\n\nProcessed ${processed} new characters.`);
}

main().catch(err => {
   console.error('\nFatal:', err);
   process.exit(1);
});
