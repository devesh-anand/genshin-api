/**
 * Adds ascension_costs and talent_costs to all character JSON files.
 *
 * Data sourced from gi.yatta.moe. No image uploads — read-only network calls.
 *
 * Usage:
 *   node scripts/add-character-costs.mjs         # all characters missing costs
 *   node scripts/add-character-costs.mjs nahida  # one character (by file slug)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHARS_DIR = path.join(__dirname, '../data/characters');
const MATS_DIR  = path.join(__dirname, '../data/materials');
const YATTA     = 'https://gi.yatta.moe';

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['''""()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

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

function extractTalentCosts(talentObj, matMap) {
  // Filter to the 3 upgradeable combat talents (those with actual levelup costs)
  const upgradeable = Object.entries(talentObj)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, t]) => t)
    .filter(t => t.promote && Object.values(t.promote).some(p => p?.costItems));

  if (upgradeable.length < 3) return null;

  const [na, skill, burst] = upgradeable;

  const extractLevels = t =>
    Object.values(t.promote)
      .filter(p => p?.costItems)
      .map(p => ({
        level: p.level,
        mora: p.coinCost,
        materials: mapItems(p.costItems, matMap),
      }));

  return {
    normal_attack:    extractLevels(na),
    elemental_skill:  extractLevels(skill),
    elemental_burst:  extractLevels(burst),
  };
}

// Resolve the yatta API ID for a character file.
// Handles aether-*, lumine-*, traveler-* (mapped to aether), and regular characters.
function resolveYattaId(slug, charName, yattaByName) {
  const aetherMatch = slug.match(/^aether-(\w+)$/);
  if (aetherMatch) return `10000005-${aetherMatch[1]}`;

  const lumineMatch = slug.match(/^lumine-(\w+)$/);
  if (lumineMatch) return `10000007-${lumineMatch[1]}`;

  // Legacy traveler-{element} slugs — use aether variant
  const travelerMatch = slug.match(/^traveler-(\w+)$/);
  if (travelerMatch) return `10000005-${travelerMatch[1]}`;

  return yattaByName.get(charName) ?? null;
}

async function main() {
  const matMap = await buildMatMap();
  console.log(`Material map: ${matMap.size} entries`);

  const listRes = await fetchJSON(`${YATTA}/api/v2/en/avatar`);
  const yattaItems = Object.values(listRes.data?.items ?? {});
  // Map name → id for regular characters (non-traveler)
  const yattaByName = new Map(
    yattaItems
      .filter(c => !String(c.id).includes('-'))
      .map(c => [c.name, c.id])
  );
  console.log(`yatta characters: ${yattaItems.length}`);

  const charFiles = (await fs.readdir(CHARS_DIR)).sort();
  const targetSlug = process.argv[2] ?? null;

  let processed = 0, skipped = 0, failed = 0;

  for (const file of charFiles) {
    const slug = file.replace('.json', '');
    if (targetSlug && slug !== targetSlug) continue;

    const charData = JSON.parse(await fs.readFile(path.join(CHARS_DIR, file), 'utf8'));

    if (!targetSlug && charData.ascension_costs) {
      skipped++;
      continue;
    }

    const yattaId = resolveYattaId(slug, charData.name, yattaByName);
    if (!yattaId) {
      console.log(`\n⚠ No yatta ID for ${slug} (name: "${charData.name}")`);
      failed++;
      continue;
    }

    process.stdout.write(`\n→ ${slug.padEnd(42)}`);

    try {
      const res = await fetchJSON(`${YATTA}/api/v2/en/avatar/${yattaId}`);
      const ydata = res.data;

      const ascension_costs = extractAscensionCosts(ydata.upgrade.promote, matMap);
      const talent_costs    = extractTalentCosts(ydata.talent, matMap);

      if (!talent_costs) {
        process.stdout.write(' ⚠ could not parse talent costs');
        failed++;
        continue;
      }

      const updated = { ...charData, ascension_costs, talent_costs };
      await fs.writeFile(path.join(CHARS_DIR, file), JSON.stringify(updated, null, 2));
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
