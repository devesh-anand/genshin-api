import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runsForChain, runsForSingle, runsForWeeklyBoss, weeklyBossResin, estimateDays } from './resin.js';

describe('runsForChain', () => {
   it('needs nothing → 0 runs', () => assert.equal(runsForChain([0, 0, 0], [1, 1, 1]), 0));

   it('single tier: ceil(need / drops)', () => assert.equal(runsForChain([10, 0, 0], [3, 0, 0]), 4));

   it('crafts lower tiers up (3 → 1)', () => {
      // Need 1 top-tier item, drops only bottom tier at 9/run → 1 run (9 → 3 → 1)
      assert.equal(runsForChain([0, 0, 1], [9, 0, 0]), 1);
      assert.equal(runsForChain([0, 0, 1], [8.9, 0, 0]), 2);
   });

   it('never crafts down', () => {
      // Plenty of top tier, but bottom tier must come from bottom drops
      assert.equal(runsForChain([5, 0, 0], [1, 0, 100]), 5);
   });

   it('matches the "tier-1 equivalents" shortcut when every tier can be crafted up', () => {
      // talent books 1→10 for one talent at domain IV: [3, 21, 38] vs [2.2, 1.98, 0.22]
      const eq = (3 + 21 * 3 + 38 * 9) / (2.2 + 1.98 * 3 + 0.22 * 9);
      assert.equal(runsForChain([3, 21, 38], [2.2, 1.98, 0.22]), Math.ceil(eq));
   });

   it('is Infinity when a tier can never be obtained', () => {
      assert.equal(runsForChain([0, 1], [0, 0]), Infinity);
   });
});

describe('runsForSingle', () => {
   it('rounds up and handles zero', () => {
      assert.equal(runsForSingle(46, 2.5556), 18);
      assert.equal(runsForSingle(0, 2), 0);
      assert.equal(runsForSingle(1, 0), Infinity);
   });
});

describe('runsForWeeklyBoss', () => {
   it('one wanted type: 1/3 of drops plus solvent conversions', () => {
      // 2.1/claim split over 3 types = 0.7 + 0.33 solvent → 1.03 per claim
      assert.equal(runsForWeeklyBoss([12, 0, 0], 2.1, 0.33), Math.ceil(12 / 1.03));
   });

   it('wanting all three types uses every drop (no conversion needed)', () => {
      assert.equal(runsForWeeklyBoss([7, 7, 7], 2.1, 0.33), 10); // 2.1 × 10 = 21
   });

   it('is Infinity when the boss level drops no materials', () => {
      assert.equal(runsForWeeklyBoss([1, 0, 0], 0, 0.33), Infinity);
   });
});

describe('weeklyBossResin', () => {
   it('first three claims each week cost 30, the rest 60', () => {
      assert.deepEqual(weeklyBossResin([2, 2]), { weeks: 2, resin: 2 * 2 * 30 });
      assert.deepEqual(weeklyBossResin([1, 1, 1, 1]), { weeks: 1, resin: 3 * 30 + 60 });
      assert.deepEqual(weeklyBossResin([3, 1, 1, 1, 1]), { weeks: 3, resin: 3 * 30 + 2 * 60 + 30 + 30 });
      assert.deepEqual(weeklyBossResin([]), { weeks: 0, resin: 0 });
   });
});

describe('estimateDays', () => {
   it('resin-limited', () => {
      assert.deepEqual(estimateDays({ total: 900, perDay: 180 }), { days: 5, limited_by: 'resin', from_resin: 5 });
   });

   it('domain-day-limited: a domain open 3 of 7 days takes longer', () => {
      const d = estimateDays({ total: 900, perDay: 180, domains: [{ resin: 900, openDays: 3 }] });
      assert.equal(d.limited_by, 'domain_days');
      assert.equal(d.days, Math.ceil((900 / 180) * (7 / 3)));
   });

   it('weekly-boss-limited: N weekly claims need N weeks', () => {
      const d = estimateDays({ total: 360, perDay: 180, weeklyWeeks: 12 });
      assert.deepEqual([d.days, d.limited_by, d.weekly_boss_weeks], [78, 'weekly_bosses', 12]);
   });

   it('nothing to farm → 0 days, no -0', () => {
      const d = estimateDays({ total: 0, perDay: 180 });
      assert.ok(Object.is(d.days, 0) && Object.is(d.from_resin, 0));
      assert.equal(d.limited_by, null);
   });
});
