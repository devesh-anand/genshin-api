/**
 * Rebuilds every cross-reference in data/ from the data itself, so links can't drift.
 * Offline — no network, no uploads. Run last in every sync (sync.mjs does this).
 *
 *   1. Costs: `unknown-<id>` placeholders (written when costs ran before a new material
 *      existed) are resolved to the material with that ID.
 *   2. materials[].used_by.{characters,weapons} are regenerated from the character
 *      ascension/talent costs and weapon ascension costs. Nothing else writes them.
 *   3. enemies[].drops ↔ materials[].dropped_by are made symmetric (union of both sides,
 *      existing slugs only). Boss/weekly-boss drops whose source names an enemy
 *      ("Lv. 70+ The Game Before the Gate Challenge Reward") are linked to that enemy.
 *   4. Every string goes through cleanText (no raw game markup anywhere in data/).
 *
 * Exits 1 if anything is still unresolved, so CI notices.
 *
 * Usage: node scripts/link-data.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanText } from './lib/text.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../data');
const DIRS = ['characters', 'weapons', 'materials', 'enemies', 'artifacts'];

async function loadDir(dir) {
  const map = new Map();
  for (const f of (await fs.readdir(path.join(DATA, dir))).filter(f => f.endsWith('.json')).sort()) {
    const p = path.join(DATA, dir, f);
    const raw = await fs.readFile(p, 'utf8');
    map.set(f.slice(0, -5), { path: p, raw, data: JSON.parse(raw) });
  }
  return map;
}

// Every { slug, quantity } entry in a cost structure, with the entry itself so it can be patched
function costEntries(costs, out = []) {
  if (Array.isArray(costs)) costs.forEach(c => costEntries(c, out));
  else if (costs && typeof costs === 'object') {
    if (typeof costs.slug === 'string' && 'quantity' in costs) out.push(costs);
    else Object.values(costs).forEach(c => costEntries(c, out));
  }
  return out;
}

function cleanStrings(v) {
  if (typeof v === 'string') return v.startsWith('http') ? v : cleanText(v);
  if (Array.isArray(v)) return v.map(cleanStrings);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cleanStrings(x)]));
  return v;
}

const sortedUnique = arr => [...new Set(arr)].sort();

async function main() {
  const db = Object.fromEntries(await Promise.all(DIRS.map(async d => [d, await loadDir(d)])));
  const { characters: C, weapons: W, materials: M, enemies: E } = db;
  const problems = [];

  // 1. resolve unknown-<id>
  const idToMat = new Map([...M].map(([slug, { data }]) => [Number(data.id), slug]));
  let resolved = 0;
  const owners = [
    ...[...C].map(([slug, r]) => ({ kind: 'characters', slug, entries: [...costEntries(r.data.ascension_costs), ...costEntries(r.data.talent_costs)] })),
    ...[...W].map(([slug, r]) => ({ kind: 'weapons', slug, entries: costEntries(r.data.ascension_costs) })),
  ];
  for (const o of owners) {
    for (const e of o.entries) {
      const m = /^unknown-(\d+)$/.exec(e.slug);
      if (m && idToMat.has(Number(m[1]))) { e.slug = idToMat.get(Number(m[1])); resolved++; }
      if (!M.has(e.slug)) problems.push(`${o.kind}/${o.slug}: cost material "${e.slug}" does not exist`);
    }
  }

  // 2. used_by from costs
  const usedBy = new Map([...M.keys()].map(s => [s, { characters: [], weapons: [] }]));
  for (const o of owners) for (const e of o.entries) usedBy.get(e.slug)?.[o.kind].push(o.slug);
  for (const [slug, r] of M) {
    const u = usedBy.get(slug);
    r.data.used_by = { characters: sortedUnique(u.characters), weapons: sortedUnique(u.weapons) };
  }

  // 3. drops <-> dropped_by
  const links = new Set(); // "material|enemy"
  for (const [enemy, r] of E) for (const mat of r.data.drops ?? []) if (M.has(mat)) links.add(`${mat}|${enemy}`);
  for (const [mat, r] of M) for (const enemy of r.data.dropped_by ?? []) if (E.has(enemy)) links.add(`${mat}|${enemy}`);

  // Boss rewards that aren't "drops" on yatta (weekly bosses): link by the enemy named in the source
  const enemiesByNameLength = [...E].sort((a, b) => b[1].data.name.length - a[1].data.name.length);
  for (const [mat, r] of M) {
    const m = r.data;
    if (!['boss-drop', 'weekly-boss-drop'].includes(m.category) || m.dropped_by?.length) continue;
    const desc = m.source?.description ?? '';
    const hit = enemiesByNameLength.find(([, e]) => desc.includes(e.data.name));
    if (hit) links.add(`${mat}|${hit[0]}`);
  }

  for (const [, r] of M) r.data.dropped_by = [];
  for (const [, r] of E) r.data.drops = r.data.drops ?? [];
  for (const [enemy, r] of E) for (const d of r.data.drops) if (!M.has(d)) problems.push(`enemies/${enemy}: drop "${d}" does not exist`);
  const dropsBefore = new Map([...E].map(([s, r]) => [s, r.data.drops.filter(d => M.has(d))]));
  for (const [, r] of E) r.data.drops = [];
  for (const link of links) {
    const [mat, enemy] = link.split('|');
    M.get(mat).data.dropped_by.push(enemy);
  }
  for (const [enemy, r] of E) {
    // keep the original drop order, append newly linked materials
    const linked = [...links].filter(l => l.endsWith(`|${enemy}`)).map(l => l.split('|')[0]);
    r.data.drops = [...new Set([...dropsBefore.get(enemy), ...linked])];
  }
  for (const [, r] of M) r.data.dropped_by = sortedUnique(r.data.dropped_by);

  // 4. clean text + write changed files
  let written = 0;
  for (const dir of DIRS) {
    for (const [, r] of db[dir]) {
      const next = JSON.stringify(cleanStrings(r.data), null, 2);
      if (next !== r.raw) { await fs.writeFile(r.path, next); written++; }
    }
  }

  // Report
  const weeklyUnlinked = [...M].filter(([, r]) => r.data.category === 'weekly-boss-drop' && !r.data.dropped_by.length).map(([s]) => s);
  console.log(`Resolved ${resolved} unknown-<id> cost entries. Files written: ${written}.`);
  if (weeklyUnlinked.length) console.log(`Weekly-boss materials with no boss (not boss rewards): ${weeklyUnlinked.join(', ')}`);

  if (problems.length) {
    console.error(`\n${problems.length} unresolved reference(s):\n  ` + problems.join('\n  '));
    process.exit(1);
  }
  console.log('All references resolve.');
}

main().catch(e => { console.error(e); process.exit(1); });
