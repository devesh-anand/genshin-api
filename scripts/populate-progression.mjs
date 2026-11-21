/**
 * Writes data/progression.json: levelling tables for the material planner.
 *
 *   character.levels           — EXP to reach the next level, and total EXP to reach this level
 *   character.exp_per_mora     — EXP you get per 1 Mora spent levelling (Mora = EXP / exp_per_mora)
 *   weapon.by_rarity["1".."5"] — same per weapon rarity (curves differ; 1★/2★ cap at 70)
 *   weapon.exp_per_mora
 *   max_level                  — the final level in each table (the live cap)
 *   exp_materials              — EXP items with their value, from data/materials (exp field)
 *
 * Source: genshin-impact.fandom.com — "Character EXP" and "Weapon EXP/<n>-Star Weapons".
 * Every table is checked (total[n+1] = total[n] + next[n]) before anything is written.
 *
 * Usage: node scripts/populate-progression.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchJSON, sleep } from './lib/discover.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../data');
const WIKI_API = 'https://genshin-impact.fandom.com/api.php';

async function wikitext(page) {
  const res = await fetchJSON(`${WIKI_API}?action=parse&format=json&prop=wikitext&redirects=1&page=${encodeURIComponent(page)}`);
  const text = res?.parse?.wikitext?.['*'];
  if (!text) throw new Error(`wiki page not found: ${page}`);
  return text;
}

const num = s => Number(String(s).replace(/'''|<sup>.*?<\/sup>|,/g, '').trim());

// Per-level tables are rows of cells "level || next || total", possibly several groups per row.
// Returns [{ level, exp_to_next, total_exp }] sorted by level. "MAX" → exp_to_next: null.
function parseLevelTable(text) {
  const levels = new Map();
  for (const table of text.split('{|').slice(1)) {
    const body = table.split('|}')[0];
    if (!/Total EXP|\|\|\s*MAX|'''MAX'''/i.test(body) && !/^\s*class="fandom-table"/.test(body)) continue;
    for (const row of body.split(/\n\|-/).slice(1)) {
      const cells = row.replace(/^\s*\n?\|/, '').split('||').map(c => c.trim());
      if (cells.length % 3 !== 0) continue;
      for (let i = 0; i < cells.length; i += 3) {
        const level = num(cells[i]);
        const next = /MAX/.test(cells[i + 1]) ? null : num(cells[i + 1]);
        const total = num(cells[i + 2]);
        if (!Number.isInteger(level) || !Number.isFinite(total) || (next !== null && !Number.isFinite(next))) continue;
        levels.set(level, { level, exp_to_next: next, total_exp: total });
      }
    }
  }
  return [...levels.values()].sort((a, b) => a.level - b.level);
}

function checkTable(name, rows) {
  if (rows.length < 20) throw new Error(`${name}: only ${rows.length} levels parsed`);
  if (rows[0].level !== 1 || rows[0].total_exp !== 0) throw new Error(`${name}: must start at level 1 with 0 EXP`);
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    if (b.level !== a.level + 1) throw new Error(`${name}: gap after level ${a.level}`);
    if (a.total_exp + a.exp_to_next !== b.total_exp) throw new Error(`${name}: level ${a.level}→${b.level} doesn't add up`);
  }
  const last = rows.at(-1);
  if (last.exp_to_next !== null) throw new Error(`${name}: last level ${last.level} isn't marked MAX`);
  return last.level;
}

// "costs 1 [[Mora]] for every 5 points" / "10 points of experience cost 1 [[Mora]]"
function expPerMora(text) {
  const m = /1 \[\[Mora\]\] for every (\d+) points/i.exec(text) ?? /(\d+) points of experience cost 1 \[\[Mora\]\]/i.exec(text);
  if (!m) throw new Error('Mora rule not found on wiki page');
  return Number(m[1]);
}

async function main() {
  const charText = await wikitext('Character EXP');
  const charLevels = parseLevelTable(charText);
  const charMax = checkTable('character', charLevels);
  await sleep(500);

  const weaponText = await wikitext('Weapon EXP');
  const byRarity = {}, weaponMax = {};
  for (const r of [1, 2, 3, 4, 5]) {
    await sleep(500);
    const rows = parseLevelTable(await wikitext(`Weapon EXP/${r}-Star Weapons`));
    weaponMax[r] = checkTable(`weapon ${r}★`, rows);
    byRarity[r] = rows;
  }

  // EXP items come from materials (enrich-materials.mjs parses their EXP value)
  const exp_materials = { character: [], weapon: [] };
  for (const f of await fs.readdir(path.join(DATA, 'materials'))) {
    const m = JSON.parse(await fs.readFile(path.join(DATA, 'materials', f), 'utf8'));
    if (m.category !== 'exp-material') continue;
    const kind = /enhancement ore/i.test(m.name) ? 'weapon' : 'character';
    exp_materials[kind].push({ slug: f.slice(0, -5), name: m.name, exp: m.exp ?? null, rarity: m.rarity });
  }
  for (const list of Object.values(exp_materials)) list.sort((a, b) => (b.exp ?? 0) - (a.exp ?? 0));

  const progression = {
    source: 'Genshin Impact Fandom wiki: "Character EXP", "Weapon EXP"',
    max_level: { character: charMax, weapon: weaponMax },
    character: { exp_per_mora: expPerMora(charText), levels: charLevels },
    weapon: { exp_per_mora: expPerMora(weaponText), by_rarity: byRarity },
    exp_materials,
  };

  await fs.writeFile(path.join(DATA, 'progression.json'), JSON.stringify(progression, null, 2));
  console.log(`Wrote data/progression.json — character cap ${charMax} (${charLevels.at(-1).total_exp.toLocaleString('en-US')} EXP), ` +
    `weapon caps ${JSON.stringify(weaponMax)}, EXP items: ${exp_materials.character.length} character / ${exp_materials.weapon.length} weapon`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
