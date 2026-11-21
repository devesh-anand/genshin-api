/**
 * Fills in derived fields on material JSON files. No image uploads.
 *
 *   source  — where to get it. yatta's source list (domain + days, or a description);
 *             local specialties get { type: "local-specialty", region }; if yatta has
 *             nothing, falls back to the known droppers ("Dropped by X").
 *   region  — local specialties only, from yatta's type (localSpecialtySnezhnaya → "Snezhnaya").
 *   exp     — EXP materials only, parsed from the description ("Gives 20,000 EXP").
 *   craft   — { from, quantity, mora } when the item is crafted from a lower tier of the same
 *             item; null otherwise. Ratio from yatta's recipe, Mora from the Fandom wiki's
 *             {{Recipe}} template (null if the wiki doesn't list it). Element/type conversions
 *             (… + Dust of Azoth, … + Dream Solvent) are not crafting and are ignored.
 *   family, tier — derived from the craft chains across all materials: family is
 *             "<top-tier slug>-series", tier 1 = lowest. null for items not in a chain.
 *
 * Sources: gi.yatta.moe (recipes, sources, types), genshin-impact.fandom.com (crafting Mora).
 *
 * Usage:
 *   node scripts/enrich-materials.mjs          # materials missing any of the fields
 *   node scripts/enrich-materials.mjs --all    # refresh every material
 *   node scripts/enrich-materials.mjs kristallfold
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchJSON, sleep, YATTA } from './lib/discover.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATS_DIR = path.join(__dirname, '../data/materials');
const ENEMIES_DIR = path.join(__dirname, '../data/enemies');
const WIKI_API = 'https://genshin-impact.fandom.com/api.php';

// Categories whose items can be part of a craft chain (3 lower → 1 higher)
const CRAFTABLE = new Set(['talent-book', 'weapon-material', 'ascension-gem', 'common-drop', 'boss-drop', 'weekly-boss-drop']);

// ── source ────────────────────────────────────────────────────────────────────

// Prefers domain entries (have days); falls back to the first non-placeholder single.
function parseSource(sources) {
  if (!sources?.length) return null;
  const domain = sources.find(s => s.type === 'domain');
  if (domain) return { type: 'domain', name: domain.name, days: domain.days };
  const single = sources.find(s => s.type === 'single' && !s.name.startsWith('Placeholder'));
  if (single) return { type: 'boss', description: single.name };
  return null;
}

function regionFromType(type) {
  const m = /^localSpecialty(.+)$/.exec(type || '');
  if (!m) return null;
  // NodKrai → Nodkrai, matching the character `nation` spelling so the two can be joined
  return m[1].charAt(0) + m[1].slice(1).toLowerCase();
}

function parseExp(description) {
  const m = /Gives ([\d,]+) EXP/i.exec(description || '');
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

// ── craft ─────────────────────────────────────────────────────────────────────

// A crafting recipe has exactly one ingredient (the lower tier). Conversions add a catalyst.
function craftRecipe(recipe, idToSlug) {
  for (const ingredients of Object.values(recipe || {})) {
    const entries = Object.entries(ingredients);
    if (entries.length !== 1) continue;
    const [id, item] = entries[0];
    const from = idToSlug.get(Number(id));
    if (from) return { from, quantity: item.count };
  }
  return null;
}

async function wikiCraftMora(name) {
  const url = `${WIKI_API}?action=parse&format=json&prop=wikitext&redirects=1&page=${encodeURIComponent(name)}`;
  const res = await fetchJSON(url);
  const text = res?.parse?.wikitext?.['*'];
  if (!text) return null;
  // {{Recipe |type = Crafting |Teachings of Ingenuity = 3 |Mora = 550 ...}}
  const block = /\{\{Recipe\s*\|[^}]*type\s*=\s*Crafting[^}]*\}\}/i.exec(text)?.[0];
  if (!block) return null;
  const mora = /\|\s*Mora\s*=\s*([\d,]+)/i.exec(block);
  return mora ? Number(mora[1].replace(/,/g, '')) : 0;
}

// ── family / tier ─────────────────────────────────────────────────────────────

function assignFamilies(mats) {
  const higherOf = new Map(); // lower slug → higher slug
  for (const [slug, m] of mats) if (m.craft?.from) higherOf.set(m.craft.from, slug);

  for (const [slug, m] of mats) {
    const inChain = m.craft?.from || higherOf.has(slug);
    if (!inChain) { m.family = null; m.tier = null; continue; }
    let top = slug;
    while (higherOf.has(top)) top = higherOf.get(top);
    let tier = 1, cur = slug;
    while (mats.get(cur)?.craft?.from) { tier++; cur = mats.get(cur).craft.from; }
    m.family = `${top}-series`;
    m.tier = tier;
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

const needsWork = m =>
  m.source === undefined || m.source === null || m.craft === undefined ||
  (m.category === 'local-specialty' && !m.region) ||
  (m.category === 'exp-material' && m.exp == null);

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const target = args.find(a => !a.startsWith('--')) ?? null;

  const files = (await fs.readdir(MATS_DIR)).filter(f => f.endsWith('.json')).sort();
  const mats = new Map();
  for (const f of files) mats.set(f.slice(0, -5), JSON.parse(await fs.readFile(path.join(MATS_DIR, f), 'utf8')));
  const idToSlug = new Map([...mats].map(([slug, m]) => [Number(m.id), slug]));

  const enemyNames = new Map();
  for (const f of await fs.readdir(ENEMIES_DIR)) {
    const e = JSON.parse(await fs.readFile(path.join(ENEMIES_DIR, f), 'utf8'));
    enemyNames.set(f.slice(0, -5), e.name);
  }

  const list = await fetchJSON(`${YATTA}/material`);
  if (!list) throw new Error('Failed to fetch yatta material list');
  const yattaType = new Map(Object.values(list.data.items).map(i => [Number(i.id), i.type]));

  let done = 0, failed = 0;
  for (const [slug, m] of mats) {
    if (target ? slug !== target : !(all || needsWork(m))) continue;
    process.stdout.write(`\n→ ${slug.padEnd(48)}`);

    const res = await fetchJSON(`${YATTA}/material/${m.id}`);
    if (!res?.data) { process.stdout.write(' FETCH_ERROR'); failed++; continue; }
    const d = res.data;

    if (m.category === 'local-specialty') {
      m.region = regionFromType(yattaType.get(Number(m.id)));
      m.source = { type: 'local-specialty', region: m.region };
    } else {
      m.source = parseSource(d.source);
      if (!m.source && m.dropped_by?.length) {
        const names = m.dropped_by.map(e => enemyNames.get(e) ?? e);
        m.source = { type: 'boss', description: `Dropped by ${names.join(', ')}` };
      }
    }

    if (m.category === 'exp-material') m.exp = parseExp(d.description);

    m.craft = null;
    if (CRAFTABLE.has(m.category)) {
      const recipe = craftRecipe(d.recipe, idToSlug);
      if (recipe) {
        const mora = await wikiCraftMora(m.name);
        m.craft = { ...recipe, mora };
        process.stdout.write(` craft:${recipe.quantity}×${recipe.from} mora:${mora ?? '?'}`);
        await sleep(400);
      }
    }

    process.stdout.write(m.source ? ` source:${m.source.type}` : ' source:none');
    done++;
    await sleep(250);
  }

  assignFamilies(mats);

  // Write every file whose content changed (family/tier can move when a new tier appears)
  let written = 0;
  for (const [slug, m] of mats) {
    const p = path.join(MATS_DIR, `${slug}.json`);
    const next = JSON.stringify(m, null, 2);
    if (next !== await fs.readFile(p, 'utf8')) { await fs.writeFile(p, next); written++; }
  }

  console.log(`\n\nDone. enriched=${done}, failed=${failed}, files written=${written}`);
  if (failed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
