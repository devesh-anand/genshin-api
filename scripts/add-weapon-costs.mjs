/**
 * Adds ascension_costs to all weapon JSON files.
 *
 * Data sourced from gi.yatta.moe. No image uploads.
 *
 * Usage:
 *   node scripts/add-weapon-costs.mjs                # all weapons missing costs
 *   node scripts/add-weapon-costs.mjs staff-of-homa  # one weapon (by file slug)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEAPONS_DIR = path.join(__dirname, '../data/weapons');
const MATS_DIR    = path.join(__dirname, '../data/materials');
const YATTA       = 'https://gi.yatta.moe';

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'genshin-api/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function buildMatMap() {
  const files = await fs.readdir(MATS_DIR);
  const map = new Map();
  for (const f of files) {
    const d = JSON.parse(await fs.readFile(path.join(MATS_DIR, f), 'utf8'));
    map.set(Number(d.id), f.replace('.json', ''));
  }
  return map;
}

function mapItems(costItems, matMap) {
  if (!costItems) return [];
  return Object.entries(costItems).map(([id, qty]) => ({
    slug: matMap.get(Number(id)) ?? `unknown-${id}`,
    quantity: qty,
  }));
}

function extractAscensionCosts(promote, matMap) {
  return promote
    .filter(p => p?.costItems)
    .map(p => ({
      phase: p.promoteLevel,
      max_level: p.unlockMaxLevel,
      mora: p.coinCost,
      materials: mapItems(p.costItems, matMap),
    }));
}

async function main() {
  const matMap = await buildMatMap();
  console.log(`Material map: ${matMap.size} entries`);

  const listRes = await fetchJSON(`${YATTA}/api/v2/en/weapon`);
  const yattaItems = Object.values(listRes.data?.items ?? {});
  const yattaByName = new Map(yattaItems.map(w => [w.name, w.id]));
  console.log(`yatta weapons: ${yattaItems.length}`);

  const weaponFiles = (await fs.readdir(WEAPONS_DIR)).sort();
  const targetSlug = process.argv[2] ?? null;

  let processed = 0, skipped = 0, failed = 0;

  for (const file of weaponFiles) {
    const slug = file.replace('.json', '');
    if (targetSlug && slug !== targetSlug) continue;

    const weaponData = JSON.parse(await fs.readFile(path.join(WEAPONS_DIR, file), 'utf8'));

    if (!targetSlug && weaponData.ascension_costs) {
      skipped++;
      continue;
    }

    const yattaId = yattaByName.get(weaponData.name);
    if (!yattaId) {
      console.log(`\n⚠ No yatta ID for ${slug} (name: "${weaponData.name}")`);
      failed++;
      continue;
    }

    process.stdout.write(`\n→ ${slug.padEnd(48)}`);

    try {
      const res = await fetchJSON(`${YATTA}/api/v2/en/weapon/${yattaId}`);
      const ascension_costs = extractAscensionCosts(res.data.upgrade?.promote ?? [], matMap);

      const updated = { ...weaponData, ascension_costs };
      await fs.writeFile(path.join(WEAPONS_DIR, file), JSON.stringify(updated, null, 2));
      process.stdout.write(' ✓');
      processed++;
    } catch (e) {
      process.stdout.write(` ERROR: ${e.message}`);
      failed++;
    }

    await sleep(300);
  }

  console.log(`\n\nDone. processed=${processed}, skipped=${skipped}, failed=${failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
