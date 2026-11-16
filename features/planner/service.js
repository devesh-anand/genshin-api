/**
 * Material planner — what a set of characters/weapons needs to reach target levels/talents.
 *
 * Inputs are "targets": { type: 'character'|'weapon', name, level?: {from, to, from_ascended?, to_ascended?},
 *                         talents?: { normal_attack?: {from, to}, elemental_skill?, elemental_burst? } }
 * Output: one combined list of materials (with where to get them), Mora by purpose, EXP, and
 * a per-target summary. All game numbers come from data/ (costs, progression.json).
 *
 * Ascension model: phase 0 caps at level 20; each ascension_costs entry raises the cap to its
 * max_level. A level that equals a cap is ambiguous (Lv 40 before or after ascending), so callers
 * say `from_ascended` / `to_ascended`; by default "from" is not yet ascended and "to" doesn't
 * ascend beyond what the level needs.
 */
import { z } from 'zod';
import { ValidationError } from '../../lib/errors.js';
import { resolveCharacter } from '../characters/service.js';
import { resolveWeapon } from '../weapons/service.js';
import { getMaterial, getMaterialFamily, resolveMaterial, listMaterials } from '../materials/service.js';
import { getEnemy } from '../enemies/service.js';
import { getProgression } from './store.js';
import { resolveFamily } from './inventory.js';
import { runsForChain, runsForSingle, runsForWeeklyBoss, weeklyBossResin, estimateDays } from './resin.js';
import {
   RESIN, TALENT_DOMAIN, WEAPON_DOMAIN, NORMAL_BOSS, WEEKLY_BOSS, LEY_LINE,
   MAX_WORLD_LEVEL, MAX_BOSS_TABLE_WORLD_LEVEL, FARMING_SOURCES, FARMING_DATA_LICENSE,
} from './farming-rates.js';

export const TALENTS = ['normal_attack', 'elemental_skill', 'elemental_burst'];
export const MAX_TARGETS = 20;
const BASE_CAP = 20; // level cap before the first ascension

// ── Input schema (shared by REST validation and MCP tool schemas) ─────────────────────────

const levelInt = z.number().int().min(1).max(100);
const talentRange = z
   .object({
      from: z.number().int().min(1).max(10).describe('Current talent level (1–10).'),
      to: z.number().int().min(1).max(10).describe('Target talent level (1–10).'),
   })
   .describe('Talent level range.');

export const levelRangeSchema = z
   .object({
      from: levelInt.describe('Current level.'),
      to: levelInt.describe('Target level.'),
      from_ascended: z.boolean().optional().describe('Current level is a cap (20/40/50/…) and already ascended past it. Default false.'),
      to_ascended: z.boolean().optional().describe('Also ascend at the target level when it is a cap (e.g. 80 → ready for 90). Default false.'),
   })
   .describe('Level range.');

export const targetSchema = z.object({
   type: z.enum(['character', 'weapon']).describe('What to plan for.'),
   name: z.string().min(1).describe('Character or weapon name (loose input is fine).'),
   level: levelRangeSchema.optional(),
   talents: z
      .object(Object.fromEntries(TALENTS.map((t) => [t, talentRange.optional()])))
      .optional()
      .describe('Characters only: talent ranges to level.'),
});

export const MAX_INVENTORY_ITEMS = 500;

export const inventorySchema = z
   .record(z.string().min(1), z.number().int().min(0).max(1_000_000))
   .refine((o) => Object.keys(o).length <= MAX_INVENTORY_ITEMS, `At most ${MAX_INVENTORY_ITEMS} inventory entries.`)
   .describe('Materials you already own: { "<material name or key>": quantity }. EXP items count by EXP value; lower tiers are crafted up.');

export const planInputSchema = z.object({
   targets: z.array(targetSchema).min(1).max(MAX_TARGETS),
   inventory: inventorySchema.optional(),
});

/** zod error → one readable ValidationError message. */
export function parseOrThrow(schema, input) {
   const r = schema.safeParse(input);
   if (r.success) return r.data;
   const msg = r.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
      .join('; ');
   throw new ValidationError(`Invalid plan input — ${msg}`);
}

// ── Pure helpers ──────────────────────────────────────────────────────────────────────────

/** Phase reached at `level` (0 = never ascended). See module doc for the ascended flag. */
export function phaseAt(phases, level, ascended = false) {
   const caps = [BASE_CAP, ...phases.map((p) => p.max_level)];
   let phase = caps.findIndex((cap) => level <= cap);
   if (phase === -1) throw new ValidationError(`Level ${level} is above the maximum (${caps.at(-1)}).`);
   if (ascended && level === caps[phase] && phase < phases.length) phase += 1;
   return phase;
}

/** Fewest EXP items covering `exp`, biggest first (overshoot < smallest item). */
export function expItemsFor(exp, items) {
   const sorted = [...items].sort((a, b) => b.exp - a.exp);
   let left = exp;
   const used = [];
   sorted.forEach((item, i) => {
      const last = i === sorted.length - 1;
      const n = last ? Math.ceil(Math.max(left, 0) / item.exp) : Math.floor(left / item.exp);
      if (n > 0) used.push({ slug: item.slug, quantity: n, exp: n * item.exp });
      left -= n * item.exp;
   });
   return used;
}

class Tally {
   constructor() { this.map = new Map(); }
   add(slug, quantity) { if (quantity > 0) this.map.set(slug, (this.map.get(slug) ?? 0) + quantity); }
   addAll(materials) { for (const m of materials ?? []) this.add(m.slug, m.quantity); }
   merge(other) { for (const [s, q] of other.map) this.add(s, q); }
   entries() { return [...this.map.entries()]; }
}

const emptyMora = () => ({ leveling: 0, ascension: 0, talents: 0 });

function validateRange(label, from, to) {
   if (to < from) throw new ValidationError(`${label}: target (${to}) is below current (${from}).`);
}

// ── Per-target planning ───────────────────────────────────────────────────────────────────

function planLevel({ phases, curve, cap, expItems, expPerMora, level, label }) {
   const result = { tally: new Tally(), mora: emptyMora(), exp: 0, summary: null };
   if (!level) return result;
   const { from, to, from_ascended: fromAsc = false, to_ascended: toAsc = false } = level;
   validateRange(`${label} level`, from, to);
   if (to > cap) throw new ValidationError(`${label}: level ${to} is above the maximum (${cap}).`);
   if (!phases.length) throw new ValidationError(`${label}: no ascension data available.`);

   const p0 = phaseAt(phases, from, fromAsc);
   const p1 = Math.max(p0, phaseAt(phases, to, toAsc));
   for (const p of phases.filter((x) => x.phase > p0 && x.phase <= p1)) {
      result.tally.addAll(p.materials);
      result.mora.ascension += p.mora;
   }

   const totalAt = (lv) => curve.find((x) => x.level === lv)?.total_exp;
   const exp = totalAt(to) - totalAt(from);
   const items = expItemsFor(exp, expItems);
   for (const it of items) result.tally.add(it.slug, it.quantity);
   // The game charges Mora per EXP item used, so cost follows item EXP (incl. overshoot).
   result.mora.leveling = Math.round(items.reduce((s, it) => s + it.exp, 0) / expPerMora);
   result.exp = exp;
   result.summary = { from, to, ascensions: p1 - p0, phase: { from: p0, to: p1 } };
   return result;
}

function planTalents(data, talents, label) {
   const result = { tally: new Tally(), mora: emptyMora(), summary: null };
   if (!talents) return result;
   const summary = {};
   for (const t of TALENTS) {
      const range = talents[t];
      if (!range) continue;
      validateRange(`${label} ${t}`, range.from, range.to);
      const costs = data.talent_costs?.[t] ?? [];
      if (range.to > range.from && !costs.length) throw new ValidationError(`${label}: no talent cost data available.`);
      for (const step of costs.filter((c) => c.level > range.from && c.level <= range.to)) {
         result.tally.addAll(step.materials);
         result.mora.talents += step.mora;
      }
      summary[t] = { from: range.from, to: range.to };
   }
   result.summary = summary;
   return result;
}

async function planTarget(target, prog) {
   if (target.type === 'character') {
      const { slug, data } = await resolveCharacter(target.name);
      const label = data.name;
      const lv = planLevel({
         phases: data.ascension_costs ?? [],
         curve: prog.character.levels,
         cap: prog.max_level.character,
         expItems: prog.exp_materials.character,
         expPerMora: prog.character.exp_per_mora,
         level: target.level,
         label,
      });
      const tl = planTalents(data, target.talents, label);
      lv.tally.merge(tl.tally);
      return {
         tally: lv.tally,
         mora: { ...lv.mora, talents: tl.mora.talents },
         exp: { character: lv.exp, weapon: 0 },
         summary: { type: 'character', key: slug, name: data.name, level: lv.summary, talents: tl.summary },
      };
   }

   if (target.talents) throw new ValidationError(`Weapons have no talents (${target.name}).`);
   const { slug, data } = await resolveWeapon(target.name);
   const rarity = String(data.rarity);
   const lv = planLevel({
      phases: data.ascension_costs ?? [],
      curve: prog.weapon.by_rarity[rarity],
      cap: prog.max_level.weapon[rarity],
      expItems: prog.exp_materials.weapon,
      expPerMora: prog.weapon.exp_per_mora,
      level: target.level,
      label: data.name,
   });
   return {
      tally: lv.tally,
      mora: lv.mora,
      exp: { character: 0, weapon: lv.exp },
      summary: { type: 'weapon', key: slug, name: data.name, rarity: data.rarity, level: lv.summary },
   };
}

// ── Output shaping ────────────────────────────────────────────────────────────────────────

/** Display order: what you farm first / most often. */
export const CATEGORY_ORDER = [
   'local-specialty', 'ascension-gem', 'boss-drop', 'weekly-boss-drop', 'talent-book',
   'weapon-material', 'common-drop', 'weapon-billet', 'exp-material',
];

/** Material record → planner line: identity + where to get it. */
export async function describeNeed(slug, quantity) {
   const m = await getMaterial(slug);
   if (!m) return { key: slug, name: null, category: 'unknown', quantity, source: null };
   return {
      key: slug,
      name: m.name,
      category: m.category,
      rarity: m.rarity,
      ...(m.family && { family: m.family, tier: m.tier }),
      quantity,
      source: m.source ?? null,
      ...(m.dropped_by?.length && { dropped_by: m.dropped_by }),
   };
}

export function sortNeeds(lines) {
   const rank = (c) => (CATEGORY_ORDER.includes(c) ? CATEGORY_ORDER.indexOf(c) : CATEGORY_ORDER.length);
   return lines.sort(
      (a, b) =>
         rank(a.category) - rank(b.category) ||
         String(a.family ?? a.key).localeCompare(String(b.family ?? b.key)) ||
         (a.tier ?? a.rarity ?? 0) - (b.tier ?? b.rarity ?? 0) ||
         a.key.localeCompare(b.key)
   );
}

/** Loose material names → slugs; unknown names are reported, not fatal. */
async function normaliseInventory(inventory = {}) {
   const owned = new Map();
   const unknown = [];
   for (const [name, quantity] of Object.entries(inventory)) {
      try {
         const { slug } = await resolveMaterial(name);
         owned.set(slug, (owned.get(slug) ?? 0) + quantity);
      } catch {
         unknown.push(name);
      }
   }
   return { owned, unknown };
}

/**
 * EXP items are interchangeable by EXP value: owned items are spent (biggest first) and the
 * remaining EXP is re-expressed as the fewest items to obtain.
 */
function applyExpInventory(lines, owned, expItems, expNeeded) {
   const mine = lines.filter((l) => expItems.some((e) => e.slug === l.key));
   if (!mine.length) return;
   const ownedExp = expItems.reduce((sum, e) => sum + (owned.get(e.slug) ?? 0) * e.exp, 0);
   const stillNeed = expItemsFor(Math.max(0, expNeeded - ownedExp), expItems);
   for (const l of mine) {
      l.owned = owned.get(l.key) ?? 0;
      l.missing = stillNeed.find((x) => x.slug === l.key)?.quantity ?? 0;
   }
}

async function applyInventory(materials, owned, prog, exp) {
   const byKey = new Map(materials.map((m) => [m.key, m]));
   const crafting = [];

   // Families: owned + craft up.
   for (const family of new Set(materials.map((m) => m.family).filter(Boolean))) {
      const members = await getMaterialFamily(family);
      const tiers = members.map(({ slug, data }) => ({
         key: slug,
         tier: data.tier,
         need: byKey.get(slug)?.quantity ?? 0,
         owned: owned.get(slug) ?? 0,
         craft: data.craft,
      }));
      resolveFamily(tiers).forEach((r, i) => {
         const line = byKey.get(r.key);
         if (line) Object.assign(line, { owned: tiers[i].owned, crafted: r.crafted, missing: r.missing });
         if (r.crafts > 0) {
            crafting.push({ key: r.key, quantity: r.crafts, from: tiers[i].craft.from, from_quantity: r.crafts * tiers[i].craft.quantity, mora: r.craft_mora });
         }
      });
   }

   // EXP items: by EXP value, per item set.
   applyExpInventory(materials, owned, prog.exp_materials.character, exp.character);
   applyExpInventory(materials, owned, prog.exp_materials.weapon, exp.weapon);

   // Everything else: plain subtraction.
   for (const m of materials) {
      if (m.missing !== undefined) continue;
      m.owned = owned.get(m.key) ?? 0;
      m.missing = Math.max(0, m.quantity - m.owned);
   }
   return crafting;
}

async function runPlan(input) {
   const { targets, inventory } = parseOrThrow(planInputSchema, input);
   for (const t of targets) {
      if (!t.level && !t.talents) throw new ValidationError(`${t.name}: give a level range and/or talents to plan.`);
   }
   const prog = await getProgression();
   const planned = await Promise.all(targets.map((t) => planTarget(t, prog)));

   const tally = new Tally();
   const mora = emptyMora();
   const exp = { character: 0, weapon: 0 };
   for (const p of planned) {
      tally.merge(p.tally);
      for (const k of Object.keys(mora)) mora[k] += p.mora[k];
      exp.character += p.exp.character;
      exp.weapon += p.exp.weapon;
   }

   const materials = sortNeeds(await Promise.all(tally.entries().map(([slug, q]) => describeNeed(slug, q))));
   const result = {
      targets: planned.map((p) => ({ ...p.summary, mora: p.mora.leveling + p.mora.ascension + p.mora.talents })),
      materials,
      mora: { ...mora, total: mora.leveling + mora.ascension + mora.talents },
      exp,
   };

   if (inventory) {
      const { owned, unknown } = await normaliseInventory(inventory);
      const crafting = await applyInventory(materials, owned, prog, exp);
      const craftMora = crafting.reduce((s, c) => s + c.mora, 0);
      result.crafting = crafting;
      result.mora.crafting = craftMora;
      result.mora.total += craftMora;
      result.missing_count = materials.reduce((s, m) => s + m.missing, 0);
      if (unknown.length) result.unknown_inventory = unknown;
   }
   return result;
}

/**
 * Plan materials for one or more targets.
 * @param {unknown} input - { targets: [...], inventory?: { name: qty } } (validated here)
 * @returns {Promise<{ targets, materials, mora, exp, crafting?, missing_count?, unknown_inventory? }>}
 *   With an inventory, each material line also has owned / crafted / missing.
 * @throws {ValidationError|NotFoundError}
 */
export async function planMaterials(input) {
   return runPlan(input);
}

// ── Farming schedule ──────────────────────────────────────────────────────────────────────

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const resinOptionsSchema = z
   .object({
      world_level: z.number().int().min(0).max(MAX_WORLD_LEVEL).optional().describe('World Level (affects bosses and Ley Lines). Default 8.'),
      domain_level: z.number().int().min(1).max(4).optional().describe('Domain level I–IV you run (talent/weapon domains). Default 4.'),
      weekly_boss_level: z.number().int().min(1).max(6).optional().describe('Weekly boss domain level I–VI. Default 6.'),
      resin_per_day: z.number().int().min(1).max(2000).optional().describe(`Resin spent per day. Default ${RESIN.per_day} (natural regeneration).`),
      include_mora: z.boolean().optional().describe('Also count Mora Ley Lines for the plan\'s Mora. Default false (most players have Mora from elsewhere).'),
   })
   .describe('Assumptions for the resin/time estimate.');

export const farmingInputSchema = planInputSchema.extend({
   day: z.enum(DAYS).optional().describe('Only show domains open on this day (server reset time). Default: the whole week.'),
   resin: resinOptionsSchema.optional(),
});

export const resinInputSchema = planInputSchema.extend({ resin: resinOptionsSchema.optional() });

const need = (m) => m.missing ?? m.quantity;
const brief = (m) => ({ key: m.key, name: m.name, tier: m.tier, quantity: need(m) });

/**
 * Where and when to farm what a plan still needs (after inventory, if given).
 * @param {unknown} input - planMaterials input + optional `day`
 * @returns {Promise<{ domains, bosses, local_specialties, enemies, other, mora_needed }>}
 */
export async function getFarmingSchedule(input) {
   const { day, resin: resinOptions, ...planInput } = parseOrThrow(farmingInputSchema, input);
   const plan = await runPlan(planInput);
   const open = plan.materials.filter((m) => need(m) > 0);
   const resin = await estimateFromPlan(plan, resinOptions);

   const domains = new Map();
   const bosses = [];
   const regions = new Map();
   const enemies = [];
   const other = [];
   for (const m of open) {
      const src = m.source ?? {};
      if (src.type === 'domain') {
         const d = domains.get(src.name) ?? { domain: src.name, days: src.days ?? [], materials: [] };
         d.materials.push(brief(m));
         domains.set(src.name, d);
      } else if (src.type === 'local-specialty') {
         const r = regions.get(src.region) ?? { region: src.region, materials: [] };
         r.materials.push(brief(m));
         regions.set(src.region, r);
      } else if (['boss-drop', 'weekly-boss-drop', 'ascension-gem'].includes(m.category)) {
         bosses.push({ ...brief(m), category: m.category, dropped_by: m.dropped_by ?? [], how: src.description });
      } else if (m.category === 'common-drop') {
         enemies.push({ ...brief(m), dropped_by: m.dropped_by ?? [], how: src.description });
      } else {
         other.push({ ...brief(m), category: m.category, how: src.description });
      }
   }

   let domainList = [...domains.values()];
   if (day) domainList = domainList.filter((d) => d.days.includes(day));
   const byDay = Object.fromEntries(
      (day ? [day] : DAYS).map((d) => [d, [...domains.values()].filter((x) => x.days.includes(d)).map((x) => x.domain)])
   );

   return {
      ...(day && { day }),
      domains: domainList,
      domains_by_day: byDay,
      bosses,
      local_specialties: [...regions.values()],
      enemies,
      other,
      mora_needed: plan.mora.total,
      resin,
      ...(plan.unknown_inventory && { unknown_inventory: plan.unknown_inventory }),
   };
}

// ── Resin and time estimate ───────────────────────────────────────────────────────────────

/**
 * How much Original Resin (and roughly how many days) a plan still needs, from average
 * drops (features/planner/farming-rates.js). Materials that don't cost resin are listed
 * separately. Uses `missing` after inventory/crafting when an inventory was given.
 *
 * @param {unknown} input - planMaterials input + optional `resin` options (see resinOptionsSchema)
 */
export async function estimateResin(input) {
   const { resin: options, ...planInput } = parseOrThrow(resinInputSchema, input);
   return estimateFromPlan(await runPlan(planInput), options);
}

async function enemyName(slug) {
   return (await getEnemy(slug))?.name ?? slug;
}

/** Need per tier for a family, lowest tier first, from the plan's lines. */
async function familyNeeds(family, needByKey) {
   const members = await getMaterialFamily(family);
   return { members, need: members.map(({ slug }) => needByKey.get(slug) ?? 0) };
}

async function estimateFromPlan(plan, options = {}) {
   const settings = {
      world_level: options.world_level ?? 8,
      domain_level: options.domain_level ?? 4,
      weekly_boss_level: options.weekly_boss_level ?? 6,
      resin_per_day: options.resin_per_day ?? RESIN.per_day,
      include_mora: options.include_mora ?? false,
   };
   const notes = [
      'Run counts use average drops (community-sampled), so real farming varies around them.',
      'Days are a lower bound: resin per day, domain open days and the once-a-week weekly bosses all limit progress.',
   ];
   const bossWl = Math.min(settings.world_level, MAX_BOSS_TABLE_WORLD_LEVEL);
   if (settings.world_level > MAX_BOSS_TABLE_WORLD_LEVEL) {
      notes.push(`No published boss drop table for World Level ${settings.world_level}; using World Level ${bossWl}.`);
   }
   const prog = await getProgression();

   const lines = plan.materials.filter((m) => need(m) > 0);
   const needByKey = new Map(lines.map((m) => [m.key, need(m)]));
   const activities = [];
   const notFromResin = [];
   const handled = new Set();

   // Domains: one claim yields one family's drops, so runs add up per domain.
   const domainRuns = new Map();
   for (const family of new Set(lines.filter((m) => m.source?.type === 'domain' && m.family).map((m) => m.family))) {
      const { members, need: needs } = await familyNeeds(family, needByKey);
      const first = lines.find((m) => m.family === family);
      const table = first.category === 'weapon-material' ? WEAPON_DOMAIN : TALENT_DOMAIN;
      const runs = runsForChain(needs, table[settings.domain_level], members[1]?.data.craft?.quantity ?? 3);
      const d = domainRuns.get(first.source.name) ?? {
         type: first.category === 'weapon-material' ? 'weapon_domain' : 'talent_domain',
         name: first.source.name,
         open_days: first.source.days ?? [],
         runs: 0,
         materials: [],
      };
      d.runs += runs;
      d.materials.push(family);
      domainRuns.set(first.source.name, d);
      members.forEach(({ slug }) => handled.add(slug));
   }
   for (const d of domainRuns.values()) activities.push({ ...d, resin: d.runs * RESIN.domain });

   // Normal bosses: each claim drops the boss's own material and gems of its element together.
   const bossEntries = new Map();
   for (const m of lines.filter((x) => x.category === 'boss-drop')) {
      const boss = m.dropped_by?.[0];
      if (!boss) continue;
      const runs = runsForSingle(needByKey.get(m.key), NORMAL_BOSS.material[bossWl]);
      const e = bossEntries.get(boss) ?? { type: 'normal_boss', boss, name: await enemyName(boss), runs: 0, materials: [] };
      e.runs = Math.max(e.runs, runs);
      e.materials.push(m.key);
      bossEntries.set(boss, e);
      handled.add(m.key);
   }
   for (const family of new Set(lines.filter((m) => m.category === 'ascension-gem' && m.family).map((m) => m.family))) {
      const { members, need: needs } = await familyNeeds(family, needByKey);
      const droppers = new Set(members.flatMap(({ data }) => data.dropped_by ?? []));
      if (!droppers.size) continue; // e.g. Brilliant Diamond: not from bosses
      const gemRuns = runsForChain(needs, NORMAL_BOSS.gems[bossWl], members[1]?.data.craft?.quantity ?? 3);
      const sharing = [...bossEntries.values()].filter((e) => droppers.has(e.boss)).sort((a, b) => b.runs - a.runs);
      const covered = sharing.reduce((s, e) => s + e.runs, 0);
      if (sharing.length) {
         sharing[0].materials.push(family);
         if (gemRuns > covered) {
            sharing[0].runs += gemRuns - covered;
            sharing[0].limited_by = 'gems';
         }
      } else {
         const options = [...droppers].slice(0, 5);
         bossEntries.set(family, {
            type: 'normal_boss', boss: null, name: `Any boss that drops ${members.at(-1).data.name}`,
            options: await Promise.all(options.map(enemyName)), runs: gemRuns, materials: [family],
         });
      }
      members.forEach(({ slug }) => handled.add(slug));
   }
   for (const e of bossEntries.values()) activities.push({ ...e, resin: e.runs * RESIN.normal_boss });

   // Weekly bosses: random type among the boss's three, Dream Solvents convert between them.
   const weeklyNeeds = new Map();
   for (const m of lines.filter((x) => x.category === 'weekly-boss-drop')) {
      const boss = m.dropped_by?.[0];
      if (!boss) continue; // quest rewards etc.
      weeklyNeeds.set(boss, [...(weeklyNeeds.get(boss) ?? []), m.key]);
      handled.add(m.key);
   }
   const weeklyAll = weeklyNeeds.size ? await listMaterials({ category: 'weekly-boss-drop' }) : [];
   const weeklyEntries = [];
   for (const [boss, keys] of weeklyNeeds) {
      const mats = weeklyAll.filter((x) => x.data.dropped_by?.includes(boss)).map((x) => x.slug);
      const runs = runsForWeeklyBoss(
         mats.map((k) => needByKey.get(k) ?? 0),
         WEEKLY_BOSS.materials[settings.weekly_boss_level],
         WEEKLY_BOSS.dream_solvent,
         Math.max(mats.length, WEEKLY_BOSS.materials_per_boss)
      );
      weeklyEntries.push({ type: 'weekly_boss', boss, name: await enemyName(boss), runs, weeks: runs, materials: keys });
   }
   const weekly = weeklyBossResin(weeklyEntries.map((e) => e.runs));
   // Spread the weekly resin across bosses for display (discounts go to the bosses claimed most).
   for (const e of weeklyEntries) {
      activities.push({ ...e, resin: Math.round((weekly.resin * e.runs) / Math.max(1, weeklyEntries.reduce((s, x) => s + x.runs, 0))) });
   }

   // Ley Lines: character EXP (and Mora if asked).
   const charExpItems = prog.exp_materials.character;
   const charExp = lines
      .filter((m) => charExpItems.some((e) => e.slug === m.key))
      .reduce((s, m) => s + needByKey.get(m.key) * charExpItems.find((e) => e.slug === m.key).exp, 0);
   charExpItems.forEach((e) => handled.add(e.slug));
   if (charExp > 0) {
      const runs = runsForSingle(charExp, LEY_LINE.character_exp[settings.world_level]);
      activities.push({ type: 'ley_line_exp', name: 'Ley Line Outcrop (Blossom of Revelation)', runs, resin: runs * RESIN.ley_line, exp: charExp });
   }
   if (settings.include_mora && plan.mora.total > 0) {
      const runs = runsForSingle(plan.mora.total, LEY_LINE.mora[settings.world_level]);
      activities.push({ type: 'ley_line_mora', name: 'Ley Line Outcrop (Blossom of Wealth)', runs, resin: runs * RESIN.ley_line, mora: plan.mora.total });
   }

   // Everything else costs no resin.
   const NON_RESIN = {
      'local-specialty': 'Collected in the open world (respawns over time)',
      'common-drop': 'Dropped by common enemies',
      'exp-material': 'Weapon EXP ore is forged (no resin)',
      'weapon-billet': 'Weekly boss / Trounce rewards, or forged',
   };
   for (const m of lines.filter((x) => !handled.has(x.key))) {
      notFromResin.push({
         key: m.key, name: m.name, category: m.category, quantity: need(m),
         how: m.source?.region ? `${NON_RESIN[m.category] ?? ''} — ${m.source.region}`.replace(/^ — /, '') : (NON_RESIN[m.category] ?? m.source?.description ?? null),
      });
   }

   // Settings that can't produce a needed tier (e.g. domain level I for 4★ books): report, don't count.
   const unobtainable = activities.filter((a) => !Number.isFinite(a.runs));
   for (const a of unobtainable) Object.assign(a, { runs: null, resin: null, obtainable: false });
   if (unobtainable.length) {
      notes.push(`Not obtainable at these settings: ${unobtainable.map((a) => a.name).join(', ')} — try a higher domain/boss level.`);
   }
   const total = activities.reduce((s, a) => s + (a.resin ?? 0), 0);
   const days = estimateDays({
      total,
      perDay: settings.resin_per_day,
      domains: activities.filter((a) => a.type.endsWith('_domain') && a.resin).map((a) => ({ resin: a.resin, openDays: a.open_days.length })),
      weeklyWeeks: Number.isFinite(weekly.weeks) ? weekly.weeks : 0,
   });

   return {
      total_resin: total,
      ...days,
      activities: activities.sort((a, b) => (b.resin ?? 0) - (a.resin ?? 0)),
      not_from_resin: notFromResin,
      settings,
      notes,
      sources: { license: FARMING_DATA_LICENSE, pages: FARMING_SOURCES.map((s) => s.url) },
   };
}
