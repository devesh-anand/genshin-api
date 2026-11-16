// Golden tests: well-known in-game totals, checked against our data + code together.
// If one fails after a data sync, the data changed — check the game before "fixing" the test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planMaterials, getFarmingSchedule, estimateResin, phaseAt, expItemsFor, sortNeeds } from './service.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';

const qty = (plan) => Object.fromEntries(plan.materials.map((m) => [m.key, m.quantity]));
const byCategory = (plan, category) => plan.materials.filter((m) => m.category === category);
const char = (name, extra) => ({ type: 'character', name, ...extra });
const weapon = (name, extra) => ({ type: 'weapon', name, ...extra });

describe('planner: character ascension (5★, 1 → 90)', async () => {
   const plan = await planMaterials({ targets: [char('nahida', { level: { from: 1, to: 90 } })] });
   const q = qty(plan);

   it('needs the standard ascension totals', () => {
      assert.equal(q['kalpalata-lotus'], 168);
      assert.deepEqual(
         ['nagadus-emerald-sliver', 'nagadus-emerald-fragment', 'nagadus-emerald-chunk', 'nagadus-emerald-gemstone'].map((k) => q[k]),
         [1, 9, 9, 6]
      );
      assert.equal(q['quelled-creeper'], 46);
      assert.equal(plan.mora.ascension, 420000);
      assert.equal(plan.targets[0].level.ascensions, 6);
   });

   it('needs 8,362,650 EXP, as Hero’s Wit plus the smallest top-up', () => {
      assert.equal(plan.exp.character, 8362650);
      assert.equal(q['heros-wit'], 418);
      assert.equal(q['wanderers-advice'], 3);
      assert.equal(plan.mora.leveling, (418 * 20000 + 3 * 1000) / 5); // Mora is charged per item used
   });
});

describe('planner: one talent 1 → 10', async () => {
   const plan = await planMaterials({ targets: [char('nahida', { talents: { elemental_skill: { from: 1, to: 10 } } })] });
   const q = qty(plan);

   it('needs 3/21/38 books, 6/22/31 common drops, 6 weekly drops, 1 crown, 1,652,500 Mora', () => {
      assert.deepEqual(['teachings-of-ingenuity', 'guide-to-ingenuity', 'philosophies-of-ingenuity'].map((k) => q[k]), [3, 21, 38]);
      assert.deepEqual(['fungal-spores', 'luminescent-pollen', 'crystalline-cyst-dust'].map((k) => q[k]), [6, 22, 31]);
      assert.equal(q['puppet-strings'], 6);
      assert.equal(q['crown-of-insight'], 1);
      assert.equal(plan.mora.talents, 1652500);
      assert.equal(plan.mora.leveling + plan.mora.ascension, 0);
   });

   it('three talents cost exactly three times one', async () => {
      const all = await planMaterials({
         targets: [char('nahida', { talents: Object.fromEntries(['normal_attack', 'elemental_skill', 'elemental_burst'].map((t) => [t, { from: 1, to: 10 }])) })],
      });
      assert.equal(all.mora.talents, 3 * 1652500);
      assert.equal(qty(all)['crown-of-insight'], 3);
   });
});

describe('planner: weapons', () => {
   it('5★ 1 → 90: 225,000 ascension Mora and 9,064,450 EXP', async () => {
      const plan = await planMaterials({ targets: [weapon('mistsplitter', { level: { from: 1, to: 90 } })] });
      assert.equal(plan.mora.ascension, 225000);
      assert.equal(plan.exp.weapon, 9064450);
      assert.equal(qty(plan)['mystic-enhancement-ore'], 906);
      assert.ok(byCategory(plan, 'weapon-material').length === 4, 'four domain tiers');
   });

   it('1★/2★ weapons cap at 70', async () => {
      const plan = await planMaterials({ targets: [weapon('dull blade', { level: { from: 1, to: 70 } })] });
      assert.equal(plan.targets[0].level.ascensions, 4);
      await assert.rejects(planMaterials({ targets: [weapon('dull blade', { level: { from: 1, to: 80 } })] }), /above the maximum \(70\)/);
   });

   it('rejects talents on a weapon', async () => {
      await assert.rejects(planMaterials({ targets: [weapon('mistsplitter', { talents: { normal_attack: { from: 1, to: 2 } } })] }), ValidationError);
   });
});

describe('planner: ascension boundaries', () => {
   it('Lv 80 → 90 includes the 6th ascension unless already ascended', async () => {
      const notYet = await planMaterials({ targets: [char('nahida', { level: { from: 80, to: 90 } })] });
      const already = await planMaterials({ targets: [char('nahida', { level: { from: 80, to: 90, from_ascended: true } })] });
      assert.equal(notYet.mora.ascension, 120000);
      assert.equal(already.mora.ascension, 0);
      assert.equal(notYet.exp.character, already.exp.character);
   });

   it('to_ascended prepares the next cap without levelling', async () => {
      const plan = await planMaterials({ targets: [char('nahida', { level: { from: 80, to: 80, to_ascended: true } })] });
      assert.equal(plan.mora.ascension, 120000);
      assert.equal(plan.exp.character, 0);
   });

   it('phaseAt', () => {
      const phases = [40, 50, 60, 70, 80, 90].map((max_level, i) => ({ phase: i + 1, max_level }));
      assert.equal(phaseAt(phases, 1), 0);
      assert.equal(phaseAt(phases, 20), 0);
      assert.equal(phaseAt(phases, 20, true), 1);
      assert.equal(phaseAt(phases, 21), 1);
      assert.equal(phaseAt(phases, 90), 6);
      assert.equal(phaseAt(phases, 90, true), 6);
   });
});

describe('planner: several targets', () => {
   it('merges materials and Mora across targets', async () => {
      const a = await planMaterials({ targets: [char('nahida', { level: { from: 1, to: 90 } })] });
      const b = await planMaterials({ targets: [weapon('mistsplitter', { level: { from: 1, to: 90 } })] });
      const ab = await planMaterials({
         targets: [char('nahida', { level: { from: 1, to: 90 } }), weapon('mistsplitter', { level: { from: 1, to: 90 } })],
      });
      assert.equal(ab.mora.total, a.mora.total + b.mora.total);
      assert.equal(ab.targets.length, 2);
      const sum = { ...qty(a) };
      for (const [k, v] of Object.entries(qty(b))) sum[k] = (sum[k] ?? 0) + v;
      assert.deepEqual(qty(ab), sum);
   });

   it('every character and weapon plans 1 → max with all talents, resolving every material', async () => {
      const { listCharacters } = await import('../characters/service.js');
      const { listWeapons } = await import('../weapons/service.js');
      const talents = Object.fromEntries(['normal_attack', 'elemental_skill', 'elemental_burst'].map((t) => [t, { from: 1, to: 10 }]));
      for (const { slug, data } of await listCharacters()) {
         if (!data.ascension_costs?.length) continue; // e.g. manekin/manekina: no upgrade data
         const plan = await planMaterials({ targets: [char(slug, { level: { from: 1, to: 90 }, talents })] });
         assert.ok(plan.materials.every((m) => m.name), `${slug}: unresolved material`);
      }
      for (const { slug, data } of await listWeapons()) {
         const to = data.rarity <= 2 ? 70 : 90;
         const plan = await planMaterials({ targets: [weapon(slug, { level: { from: 1, to } })] });
         assert.ok(plan.materials.every((m) => m.name), `${slug}: unresolved material`);
      }
   });
});

describe('planner: input errors', () => {
   const bad = (input, re) => assert.rejects(planMaterials(input), re);

   it('validates shape, ranges and names', async () => {
      await bad({}, ValidationError);
      await bad({ targets: [] }, ValidationError);
      await bad({ targets: [char('nahida')] }, /give a level range and\/or talents/);
      await bad({ targets: [char('nahida', { level: { from: 90, to: 80 } })] }, /below current/);
      await bad({ targets: [char('nahida', { talents: { normal_attack: { from: 1, to: 11 } } })] }, ValidationError);
      await bad({ targets: [char('zzzzzzzz', { level: { from: 1, to: 2 } })] }, NotFoundError);
      await bad({ targets: [char('manekin', { level: { from: 1, to: 90 } })] }, /no ascension data/);
      await bad({ targets: Array.from({ length: 21 }, () => char('nahida', { level: { from: 1, to: 2 } })) }, ValidationError);
   });

   it('accepts loose names', async () => {
      const plan = await planMaterials({ targets: [char('Hu Tao', { level: { from: 1, to: 20 } })] });
      assert.equal(plan.targets[0].key, 'hu-tao');
   });
});

describe('planner helpers', () => {
   it('expItemsFor uses the fewest items with overshoot below the smallest', () => {
      const items = [{ slug: 'big', exp: 20000 }, { slug: 'mid', exp: 5000 }, { slug: 'small', exp: 1000 }];
      assert.deepEqual(expItemsFor(26500, items), [
         { slug: 'big', quantity: 1, exp: 20000 }, { slug: 'mid', quantity: 1, exp: 5000 }, { slug: 'small', quantity: 2, exp: 2000 },
      ]);
      assert.deepEqual(expItemsFor(0, items), []);
   });

   it('sortNeeds orders by category, family, tier', () => {
      const lines = [
         { key: 'b2', category: 'talent-book', family: 'b', tier: 2 },
         { key: 'x', category: 'exp-material' },
         { key: 'b1', category: 'talent-book', family: 'b', tier: 1 },
         { key: 'spec', category: 'local-specialty' },
      ];
      assert.deepEqual(sortNeeds(lines).map((l) => l.key), ['spec', 'b1', 'b2', 'x']);
   });
});

describe('planner: inventory', () => {
   const skill = char('nahida', { talents: { elemental_skill: { from: 1, to: 10 } } });

   it('subtracts owned items and crafts lower tiers up', async () => {
      const plan = await planMaterials({
         targets: [skill],
         inventory: { 'teachings of ingenuity': 30, 'guide-to-ingenuity': 5, 'Puppet Strings': 2 },
      });
      const line = (k) => plan.materials.find((m) => m.key === k);
      assert.equal(line('teachings-of-ingenuity').missing, 0);
      assert.deepEqual([line('guide-to-ingenuity').crafted, line('guide-to-ingenuity').missing], [9, 7]); // 27 spare → 9
      assert.equal(line('puppet-strings').missing, 4);
      assert.equal(line('philosophies-of-ingenuity').missing, 38);
      assert.deepEqual(plan.crafting.find((c) => c.key === 'guide-to-ingenuity'), {
         key: 'guide-to-ingenuity', quantity: 9, from: 'teachings-of-ingenuity', from_quantity: 27, mora: 9 * 550,
      });
      assert.equal(plan.mora.total, plan.mora.talents + plan.mora.crafting);
   });

   it('an inventory covering everything leaves nothing missing', async () => {
      const base = await planMaterials({ targets: [skill] });
      const inventory = Object.fromEntries(base.materials.map((m) => [m.key, m.quantity]));
      const plan = await planMaterials({ targets: [skill], inventory });
      assert.equal(plan.missing_count, 0);
      assert.equal(plan.mora.crafting, 0);
   });

   it('counts EXP items by EXP value', async () => {
      const lvl = char('nahida', { level: { from: 1, to: 90 } });
      // 1,600 Adventurer's Experience = 8,000,000 EXP of the 8,362,650 needed → 362,650 left
      const plan = await planMaterials({ targets: [lvl], inventory: { "adventurer's experience": 1600 } });
      const line = (k) => plan.materials.find((m) => m.key === k);
      assert.equal(line('heros-wit').missing, 18);       // 360,000
      assert.equal(line('wanderers-advice').missing, 3); // 2,650 → 3,000
      assert.equal(line('heros-wit').owned, 0);
   });

   it('reports unknown inventory names instead of failing', async () => {
      const plan = await planMaterials({ targets: [skill], inventory: { 'definitely not a material': 5 } });
      assert.deepEqual(plan.unknown_inventory, ['definitely not a material']);
   });

   it('without an inventory, lines have no owned/missing fields', async () => {
      const plan = await planMaterials({ targets: [skill] });
      assert.ok(plan.materials.every((m) => m.missing === undefined));
      assert.equal(plan.crafting, undefined);
   });
});

describe('planner: farming schedule', () => {
   const input = { targets: [char('nahida', { level: { from: 1, to: 90 }, talents: { elemental_skill: { from: 1, to: 10 } } })] };

   it('groups what is needed by where it comes from', async () => {
      const f = await getFarmingSchedule(input);
      assert.ok(f.domains.some((d) => d.domain.includes('Mastery') && d.materials.some((m) => m.key === 'philosophies-of-ingenuity')));
      assert.ok(f.local_specialties.some((r) => r.materials.some((m) => m.key === 'kalpalata-lotus')));
      assert.ok(f.bosses.some((b) => b.key === 'quelled-creeper' && b.dropped_by.length));
      assert.ok(f.enemies.some((e) => e.key === 'crystalline-cyst-dust'));
      assert.ok(f.other.some((o) => o.key === 'heros-wit'));
      assert.ok(f.mora_needed > 0);
      assert.equal(Object.keys(f.domains_by_day).length, 7);
   });

   it('filters domains by day (Sunday has everything)', async () => {
      const monday = await getFarmingSchedule({ ...input, day: 'monday' });
      const sunday = await getFarmingSchedule({ ...input, day: 'sunday' });
      assert.ok(monday.domains.every((d) => d.days.includes('monday')));
      const week = await getFarmingSchedule(input);
      assert.equal(sunday.domains.length, week.domains.length);
      await assert.rejects(getFarmingSchedule({ ...input, day: 'funday' }), ValidationError);
   });

   it('leaves out what the inventory already covers', async () => {
      const f = await getFarmingSchedule({ ...input, inventory: { 'kalpalata lotus': 168 } });
      assert.ok(!f.local_specialties.some((r) => r.materials.some((m) => m.key === 'kalpalata-lotus')));
   });
});

describe('planner: resin estimate', () => {
   const t9 = Object.fromEntries(['normal_attack', 'elemental_skill', 'elemental_burst'].map((t) => [t, { from: 1, to: 9 }]));
   const nahida = { type: 'character', name: 'nahida', level: { from: 1, to: 90 }, talents: t9 };
   const act = (r, type) => r.activities.find((a) => a.type === type);

   it('Nahida 1→90, 9/9/9: runs per activity from average drops', async () => {
      const r = await estimateResin({ targets: [nahida] });
      assert.equal(act(r, 'ley_line_exp').runs, Math.ceil(8362650 / 122500)); // 69
      assert.equal(act(r, 'talent_domain').runs, 79);
      assert.equal(act(r, 'talent_domain').name, 'Domain of Mastery: Witticism');
      const boss = act(r, 'normal_boss');
      assert.equal(boss.boss, 'dendro-hypostasis');
      assert.equal(boss.limited_by, 'gems'); // 46 Quelled Creeper alone = 18 runs; gems need more
      assert.equal(boss.runs, 32);
      assert.deepEqual([act(r, 'weekly_boss').runs, act(r, 'weekly_boss').resin], [12, 12 * 30]);
      assert.equal(r.total_resin, r.activities.reduce((s, a) => s + a.resin, 0));
      assert.deepEqual([r.days, r.limited_by], [78, 'weekly_bosses']);
   });

   it('lists what costs no resin', async () => {
      const r = await estimateResin({ targets: [nahida] });
      const keys = r.not_from_resin.map((x) => x.key);
      assert.ok(keys.includes('kalpalata-lotus') && keys.includes('crystalline-cyst-dust'));
      assert.match(r.not_from_resin.find((x) => x.key === 'kalpalata-lotus').how, /Sumeru/);
      assert.ok(!keys.includes('heros-wit'), 'character EXP comes from Ley Lines');
   });

   it('inventory lowers the estimate', async () => {
      const full = await estimateResin({ targets: [nahida] });
      const owned = await estimateResin({ targets: [nahida], inventory: { 'heros wit': 200, 'philosophies of ingenuity': 30 } });
      assert.ok(act(owned, 'ley_line_exp').runs < act(full, 'ley_line_exp').runs);
      assert.ok(act(owned, 'talent_domain').runs < act(full, 'talent_domain').runs);
   });

   it('settings: lower levels need more runs; Mora Ley Lines are opt-in; more resin per day is faster', async () => {
      const base = await estimateResin({ targets: [nahida] });
      const low = await estimateResin({ targets: [nahida], resin: { domain_level: 3, world_level: 5 } });
      assert.ok(act(low, 'talent_domain').runs > act(base, 'talent_domain').runs);
      assert.ok(act(low, 'ley_line_exp').runs > act(base, 'ley_line_exp').runs);
      assert.equal(act(base, 'ley_line_mora'), undefined);
      const mora = await estimateResin({ targets: [nahida], resin: { include_mora: true } });
      assert.ok(act(mora, 'ley_line_mora').runs > 0);
      const lvl = { targets: [{ type: 'character', name: 'nahida', level: { from: 1, to: 90 } }] };
      assert.ok((await estimateResin({ ...lvl, resin: { resin_per_day: 360 } })).days < (await estimateResin(lvl)).days);
   });

   it('World Level 9 falls back to the World Level 8 boss table, with a note', async () => {
      const r = await estimateResin({ targets: [nahida], resin: { world_level: 9 } });
      assert.ok(r.notes.some((n) => /World Level 9/.test(n)));
      assert.equal(act(r, 'normal_boss').runs, 32);
   });

   it('weapons: domain runs; EXP ore is not resin', async () => {
      const r = await estimateResin({ targets: [{ type: 'weapon', name: 'mistsplitter', level: { from: 1, to: 90 } }] });
      assert.ok(act(r, 'weapon_domain').runs > 0);
      assert.ok(r.not_from_resin.some((x) => x.key === 'mystic-enhancement-ore'));
   });

   it('nothing to farm → 0 resin, 0 days', async () => {
      const r = await estimateResin({ targets: [{ type: 'character', name: 'nahida', level: { from: 90, to: 90 } }] });
      assert.deepEqual([r.total_resin, r.days, r.limited_by], [0, 0, null]);
   });

   it('rejects bad settings', async () => {
      await assert.rejects(estimateResin({ targets: [nahida], resin: { world_level: 10 } }), ValidationError);
      await assert.rejects(estimateResin({ targets: [nahida], resin: { domain_level: 5 } }), ValidationError);
   });

   it('farming schedule includes the estimate and cites its sources', async () => {
      const f = await getFarmingSchedule({ targets: [nahida] });
      assert.ok(f.resin.total_resin > 0);
      assert.match(f.resin.sources.license, /CC BY-SA/);
      assert.ok(f.resin.sources.pages.every((u) => u.startsWith('https://genshin-impact.fandom.com/')));
   });
});
