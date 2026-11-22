/**
 * Adds what's needed to compute a weapon's stats at any level. No image uploads.
 *
 *   data/weapons/{slug}.json → growth:
 *     atk            { init, curve }  base ATK at level 1 and the growth curve it follows
 *     sub_stat       { init, curve }  same for the substat (absent on 1★/2★ weapons); percent
 *                                     stats are fractions, as the game stores them (0.192 = 19.2%)
 *     ascension_atk  [phase 0..6]     flat base ATK added at each ascension phase (running total,
 *                                     not per phase: phase 6 already includes phases 1–5)
 *     max_level      90 (3★–5★) or 70 (1★/2★)
 *
 *   data/weapon-curves.json → curves: { GROW_CURVE_*: [multiplier at level 1, 2, … 90] }
 *
 *   stat(level, phase) = init × curve[level] (+ ascension_atk[phase] for ATK)
 *   e.g. Aqua Simulacra Lv 90: 44.34 × 22.75 + 186.7 = 542 ATK; 0.192 × 4.594 = 88.2% CRIT DMG.
 * features/weapons/service.js does the maths; this only stores the inputs.
 *
 * Source: gi.yatta.moe (static weapon curves + one detail request per weapon).
 *
 * Usage:
 *   node scripts/add-weapon-stats.mjs           # weapons missing growth (+ refresh curves)
 *   node scripts/add-weapon-stats.mjs --all     # every weapon
 *   node scripts/add-weapon-stats.mjs aqua-simulacra
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchJSON, sleep } from './lib/discover.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../data');
const WEAPON_DIR = path.join(DATA, 'weapons');
const CURVES_FILE = path.join(DATA, 'weapon-curves.json');
const YATTA = 'https://gi.yatta.moe/api/v2';
const MAX_LEVEL = 90;

const round = (n, places = 4) => Math.round(n * 10 ** places) / 10 ** places;

/** yatta weapon detail → our growth block, or null when it doesn't have what we need */
function toGrowth(detail) {
   const [atk, sub] = detail?.upgrade?.prop ?? [];
   const promote = detail?.upgrade?.promote ?? [];
   if (atk?.propType !== 'FIGHT_PROP_BASE_ATTACK' || !promote.length) return null;
   const byPhase = [...promote].sort((a, b) => a.promoteLevel - b.promoteLevel);
   return {
      atk: { init: round(atk.initValue), curve: atk.type },
      ...(sub && { sub_stat: { init: round(sub.initValue, 6), curve: sub.type } }),
      ascension_atk: byPhase.map((p) => round(p.addProps?.FIGHT_PROP_BASE_ATTACK ?? 0, 2)),
      max_level: Math.max(...byPhase.map((p) => p.unlockMaxLevel)),
   };
}

async function writeCurves(used) {
   const res = await fetchJSON(`${YATTA}/static/weaponCurve`);
   if (!res?.data) throw new Error('Failed to fetch yatta weapon curves');
   const curves = {};
   for (const type of [...used].sort()) {
      const values = [];
      for (let level = 1; level <= MAX_LEVEL; level++) {
         const v = res.data[level]?.curveInfos?.[type];
         if (typeof v !== 'number') throw new Error(`curve ${type} has no value at level ${level}`);
         values.push(round(v, 6));
      }
      curves[type] = values;
   }
   const out = JSON.stringify({ source: 'gi.yatta.moe', max_level: MAX_LEVEL, curves }, null, 2);
   const prev = await fs.readFile(CURVES_FILE, 'utf8').catch(() => null);
   if (out !== prev) await fs.writeFile(CURVES_FILE, out);
   return Object.keys(curves).length;
}

async function main() {
   const args = process.argv.slice(2);
   const all = args.includes('--all');
   const only = args.find((a) => !a.startsWith('--')) ?? null;

   const files = (await fs.readdir(WEAPON_DIR)).filter((f) => f.endsWith('.json')).sort();
   const used = new Set();
   let updated = 0, written = 0;
   const problems = [];

   for (const f of files) {
      const slug = f.slice(0, -5);
      const file = path.join(WEAPON_DIR, f);
      const raw = await fs.readFile(file, 'utf8');
      const w = JSON.parse(raw);
      const wanted = only ? slug === only : all || !w.growth;
      if (wanted) {
         if (!w.id) { problems.push(`${slug}: no game id`); continue; }
         const res = await fetchJSON(`${YATTA}/en/weapon/${w.id}`);
         const growth = toGrowth(res?.data);
         if (!growth) { problems.push(`${slug}: yatta has no stat growth for weapon ${w.id}`); continue; }
         w.growth = growth;
         const out = JSON.stringify(w, null, 2) + (raw.endsWith('\n') ? '\n' : '');
         if (out !== raw) { await fs.writeFile(file, out); written++; }
         updated++;
         await sleep(250);
      }
      if (w.growth) {
         used.add(w.growth.atk.curve);
         if (w.growth.sub_stat) used.add(w.growth.sub_stat.curve);
      }
   }

   const curveCount = await writeCurves(used);
   console.log(`Done. weapons updated=${updated}, files written=${written}, curves=${curveCount}`);
   if (problems.length) {
      console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
      process.exit(1);
   }
}

main().catch((e) => { console.error(e); process.exit(1); });
