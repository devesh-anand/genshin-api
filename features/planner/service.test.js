// Golden tests: well-known in-game totals, checked against our data + code together.
// If one fails after a data sync, the data changed — check the game before "fixing" the test.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planMaterials, phaseAt, expItemsFor, sortNeeds } from './service.js';
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
