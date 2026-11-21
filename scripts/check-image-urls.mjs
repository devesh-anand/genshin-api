// Check which image URL patterns actually return 200 for a given character
// Usage: node scripts/check-image-urls.mjs nahida [--old tighnari]
import * as dotenv from 'dotenv';
dotenv.config();

const name = process.argv[2] || 'nahida';
const oldChar = process.argv[4]; // --old <slug>
const ENKA = 'https://enka.network/ui';
const YATTA = 'https://gi.yatta.moe/assets/UI';
const R2 = 'https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev';

async function head(url) {
   if (!url) return null;
   try {
      const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'genshin-api/1.0' } });
      return { ok: r.ok, status: r.status, size: r.headers.get('content-length') };
   } catch {
      return { ok: false, status: 'ERR' };
   }
}

async function checkUrl(label, url) {
   const r = await head(url);
   if (!r) { console.log(`  -  ${label.padEnd(40)} (no URL)`); return; }
   const kb = r.size ? `${(r.size/1024).toFixed(0)}KB` : '';
   const mark = r.ok ? '✓' : '✗';
   console.log(`  ${mark} ${r.status} ${label.padEnd(40)} ${kb}`);
   if (r.ok) console.log(`       ${url}`);
}

// Show what old character has in R2
if (oldChar) {
   console.log(`\n── Old character (${oldChar}) R2 images ──`);
   for (const img of ['card', 'constellation', 'portrait', 'banner', 'icon', 'icon-big']) {
      await checkUrl(img, `${R2}/${oldChar}/${img === 'banner' ? 'gacha-splash' : img}.png`);
   }
}

// Fetch the new character data
const listRes = await fetch('https://gi.yatta.moe/api/v2/en/avatar', {
   headers: { 'User-Agent': 'genshin-api/1.0' },
});
const list = await listRes.json();
const chars = Object.values(list.data?.items || {});
const char = chars.find(c => c.route?.toLowerCase().replace(/\s+/g, '-') === name);
if (!char) { console.log('Character not found:', name); process.exit(1); }

const detailRes = await fetch(`https://gi.yatta.moe/api/v2/en/avatar/${char.id}`, {
   headers: { 'User-Agent': 'genshin-api/1.0' },
});
const detail = await detailRes.json();
const d = detail.data;
const iconName = d.icon;
const internal = iconName.replace('UI_AvatarIcon_', '');

console.log(`\n── New character (${d.name}) candidates ──`);
console.log(`   icon: ${iconName}, internal: ${internal}`);

const candidates = {
   // card candidates
   '_Card (Enka)':                    `${ENKA}/UI_AvatarIcon_${internal}_Card.png`,
   'Gacha_AvatarIcon (Enka, large)':  `${ENKA}/UI_Gacha_AvatarIcon_${internal}.png`,
   '_Card (Yatta)':                   `${YATTA}/UI_AvatarIcon_${internal}_Card.png`,
   // portrait candidates
   'Side_Aicon (Enka)':               `${ENKA}/UI_AvatarIcon_Side_${internal}.png`,
   'Gacha_AvatarImg (Enka, full art)':`${ENKA}/UI_Gacha_AvatarImg_${internal}.png`,
   // constellation candidates
   'Eff_UI_Talent (Enka)':            `${ENKA}/Eff_UI_Talent_${internal}.png`,
   '_Constellation (Enka)':           `${ENKA}/UI_AvatarIcon_${internal}_Constellation.png`,
   'NameCardPic_Alpha (Enka)':        `${ENKA}/UI_NameCardPic_${internal}_Alpha.png`,
   'GcgBuff (Enka)':                  `${ENKA}/GcgBuff_${internal}.png`,
   // currently in R2 for this character
   'current card (R2)':               `${R2}/${name}/card.png`,
   'current portrait (R2)':           `${R2}/${name}/portrait.png`,
   'current constellation (R2)':      `${R2}/${name}/constellation.png`,
   'current icon (R2)':               `${R2}/${name}/icon.png`,
};

for (const [label, url] of Object.entries(candidates)) {
   await checkUrl(label, url);
}
