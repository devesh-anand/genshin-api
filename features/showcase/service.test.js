// Runs against real data/ plus a saved Enka response (fixtures/enka-uid.json, anonymized).
// No network: the Enka client gets a fake fetch.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { ROOT_DIR } from '../../lib/paths.js';
import { NotFoundError, UnavailableError, ValidationError } from '../../lib/errors.js';
import { listCharacters } from '../characters/service.js';
import { planMaterials } from '../planner/service.js';
import { createEnkaClient } from './enka.js';
import * as svc from './service.js';

const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'features/showcase/fixtures/enka-uid.json'), 'utf8'));
const UID = '800000000';

/** A fake fetch: responds with `body` (cloned) and `status`, counting calls. */
function fakeFetch(body = FIXTURE, status = 200, { delayMs = 0 } = {}) {
   const f = async (url, opts) => {
      f.calls.push({ url, opts });
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) };
   };
   f.calls = [];
   return f;
}

const showcaseWith = (fetch, opts) => svc.getShowcase(UID, { client: createEnkaClient({ fetch, ...opts }) });

describe('showcase: game IDs in data', () => {
   it('every character has a game id and three talent skill ids', async () => {
      for (const { slug, data } of await listCharacters()) {
         assert.ok(Number.isInteger(data.id), `${slug}: id`);
         for (const type of ['NORMAL_ATTACK', 'ELEMENTAL_SKILL', 'ELEMENTAL_BURST']) {
            const talents = (data.skillTalents ?? []).filter((t) => t.type === type);
            assert.equal(talents.length, 1, `${slug}: one ${type} talent`);
            assert.ok(Number.isInteger(talents[0].id), `${slug}: ${type} id`);
         }
      }
   });

   it('characters sharing a game id (travelers) differ by Elemental Skill id and by element', async () => {
      const groups = Map.groupBy(await listCharacters(), ({ data }) => data.id);
      for (const [id, entries] of groups) {
         if (entries.length === 1) continue;
         const skill = entries.map(({ data }) => data.skillTalents.find((t) => t.type === 'ELEMENTAL_SKILL').id);
         assert.equal(new Set(skill).size, entries.length, `${id}: Elemental Skill ids`);
         assert.equal(new Set(entries.map(({ data }) => data.vision)).size, entries.length, `${id}: elements`);
      }
   });

});

describe('showcase: normalizing', () => {
   it('matches every character, weapon and artifact set to our records', async () => {
      const s = await showcaseWith(fakeFetch());
      assert.equal(s.characters.length, FIXTURE.avatarInfoList.length);
      for (const c of s.characters) {
         assert.ok(c.key && c.name, `avatar ${c.id} unmatched`);
         assert.ok(c.weapon?.key, `${c.key}: weapon ${c.weapon?.id} unmatched`);
         assert.equal(c.artifacts.length, 5);
         for (const a of c.artifacts) assert.ok(a.set.key && a.slot, `${c.key}: set ${a.set.id}`);
         // talent levels found under our skill ids
         for (const t of svc.TALENTS) assert.ok(Number.isInteger(c.talents[t].level), `${c.key}: ${t}`);
      }
   });

   it('reads Venti exactly', async () => {
      const venti = (await showcaseWith(fakeFetch())).characters.find((c) => c.key === 'venti');
      assert.equal(venti.level, 90);
      assert.equal(venti.ascension, 6);
      assert.equal(venti.constellation, 0);
      assert.deepEqual(svc.TALENTS.map((t) => venti.talents[t].level), [8, 6, 9]);
      assert.equal(venti.weapon.key, 'aqua-simulacra');
      assert.equal(venti.weapon.refinement, 1);
      assert.equal(venti.weapon.sub_stat.key, 'crit_dmg');
      assert.deepEqual(venti.artifacts.map((a) => a.slot), ['flower', 'plume', 'sands', 'goblet', 'circlet']);
      assert.ok(venti.set_bonuses.some((b) => b.key === 'viridescent-venerer' && b.bonus === 2));
   });

   it('stats are percentages where they should be, and crit value adds up', async () => {
      for (const c of (await showcaseWith(fakeFetch())).characters) {
         const cr = c.stats.find((s) => s.key === 'crit_rate');
         assert.ok(cr.percent && cr.value > 1 && cr.value < 150, `${c.key}: crit rate ${cr.value}`);
         assert.ok(c.stats.find((s) => s.key === 'hp').value > 1000);
         const sum = c.artifacts.reduce((n, a) => n + a.crit_value, 0);
         assert.ok(Math.abs(sum - c.crit_value) < 0.2);
      }
   });

   it('level state knows when a cap level is already ascended', () => {
      assert.deepEqual(svc.levelState(80, 6), { level: 80, ascension: 6, ascended: true, max_level: 90 });
      assert.deepEqual(svc.levelState(80, 5), { level: 80, ascension: 5, ascended: false, max_level: 80 });
      assert.equal(svc.levelState(90, 6).ascended, false);
      assert.equal(svc.levelState(1, 0).max_level, 20);
   });

   it('bonus talent levels map by proud skill group', () => {
      assert.deepEqual(svc.talentBonuses({ 2232: 3, 2239: 3 }), { normal_attack: 0, elemental_skill: 3, elemental_burst: 3 });
      assert.deepEqual(svc.talentBonuses({ 1031: 1 }), { normal_attack: 1, elemental_skill: 0, elemental_burst: 0 });
      assert.deepEqual(svc.talentBonuses(undefined), { normal_attack: 0, elemental_skill: 0, elemental_burst: 0 });
   });

   it('constellations raise the right talent', async () => {
      const raw = structuredClone(FIXTURE);
      const venti = raw.avatarInfoList.find((a) => a.avatarId === 10000022);
      venti.talentIdList = [1, 2, 3, 4, 5];
      venti.proudSkillExtraLevelMap = { 2232: 3, 2239: 3 }; // C3 burst, C5 skill — as Enka sends them
      const c = (await showcaseWith(fakeFetch(raw))).characters.find((x) => x.key === 'venti');
      assert.equal(c.constellation, 5);
      assert.equal(c.talents.elemental_burst.bonus, 3);
      assert.equal(c.talents.elemental_skill.bonus, 3);
      assert.equal(c.talents.normal_attack.bonus, 0);
   });

   it('travelers resolve by their talent ids', async () => {
      const raw = structuredClone(FIXTURE);
      // Anemo Lumine's Normal Attack / Skill / Burst
      Object.assign(raw.avatarInfoList[0], {
         avatarId: 10000007, skillDepotId: 704, skillLevelMap: { 100553: 6, 10067: 9, 10068: 8 },
      });
      const c = (await showcaseWith(fakeFetch(raw))).characters[0];
      assert.equal(c.key, 'lumine-anemo');
      assert.equal(c.talents.elemental_skill.level, 9);
      assert.equal(c.talents.elemental_burst.level, 8);
   });

   it('a traveler with talent ids we do not know is null, not a guess', async () => {
      const raw = structuredClone(FIXTURE);
      Object.assign(raw.avatarInfoList[0], { avatarId: 10000005, skillLevelMap: { 1: 1, 2: 1, 3: 1 } });
      const c = (await showcaseWith(fakeFetch(raw))).characters[0];
      assert.equal(c.key, null);
   });

   it('unknown IDs degrade to nulls, never throw', async () => {
      const raw = structuredClone(FIXTURE);
      raw.avatarInfoList[0].avatarId = 19999999;
      raw.avatarInfoList[0].equipList.find((e) => e.weapon).itemId = 99999;
      const c = (await showcaseWith(fakeFetch(raw))).characters[0];
      assert.equal(c.key, null);
      assert.equal(c.talents, null);
      assert.equal(c.weapon.key, null);
      assert.deepEqual(svc.toPlannerTargets(c).filter((t) => t.type === 'weapon'), []);
   });

   it('a hidden showcase is not an error', async () => {
      const raw = structuredClone(FIXTURE);
      delete raw.avatarInfoList;
      const s = await showcaseWith(fakeFetch(raw));
      assert.equal(s.details_hidden, true);
      assert.deepEqual(s.characters, []);
      assert.ok(s.listed.length > 0 && s.listed.every((c) => c.key));
      assert.equal(s.player.nickname, 'Fixture');
   });

   it('a listed traveler (details hidden: no talents) resolves by element', async () => {
      const raw = structuredClone(FIXTURE);
      delete raw.avatarInfoList;
      raw.playerInfo.showAvatarInfoList[0] = { avatarId: 10000005, level: 80, energyType: 8 };
      const s = await showcaseWith(fakeFetch(raw));
      assert.equal(s.listed[0].key, 'aether-geo');
   });
});

describe('showcase: Enka client', () => {
   it('sends a descriptive User-Agent and caches per UID', async () => {
      const fetch = fakeFetch();
      const client = createEnkaClient({ fetch });
      await svc.getShowcase(UID, { client });
      await svc.getShowcase(UID, { client });
      assert.equal(fetch.calls.length, 1);
      assert.match(fetch.calls[0].url, /\/api\/uid\/800000000$/);
      assert.match(fetch.calls[0].opts.headers['User-Agent'], /genshin-api.*github\.com/);
      assert.equal(client.stats().hits, 1);
   });

   it('concurrent lookups of one UID share a request', async () => {
      const fetch = fakeFetch(FIXTURE, 200, { delayMs: 20 });
      const client = createEnkaClient({ fetch });
      await Promise.all([1, 2, 3].map(() => svc.getShowcase(UID, { client })));
      assert.equal(fetch.calls.length, 1);
   });

   it('the cache is bounded by entries and by bytes', async () => {
      const byCount = createEnkaClient({ fetch: fakeFetch(), maxEntries: 2 });
      for (const uid of ['800000001', '800000002', '800000003']) await svc.getShowcase(uid, { client: byCount });
      assert.equal(byCount.stats().entries, 2);

      const bySize = createEnkaClient({ fetch: fakeFetch(), maxBytes: 50_000 }); // fits one ~25 KB showcase
      for (const uid of ['800000001', '800000002', '800000003']) await svc.getShowcase(uid, { client: bySize });
      assert.ok(bySize.stats().entries < 3);
      assert.ok(bySize.stats().bytes <= 50_000);
   });

   it('entries expire at the Enka ttl and are refetched', async () => {
      const first = await showcaseWith(fakeFetch({ ...FIXTURE, ttl: 60 }));
      assert.equal(Date.parse(first.cached_until) - Date.parse(first.fetched_at), 60_000);
      assert.equal(svc.cacheSeconds(first, Date.parse(first.fetched_at)), 60);
      assert.equal(svc.cacheSeconds(first, Date.parse(first.cached_until) + 1), 0);

      const fetch = fakeFetch({ ...FIXTURE, ttl: 0.05 });
      const client = createEnkaClient({ fetch, minTtl: 0.05 }); // 50 ms
      await svc.getShowcase(UID, { client });
      await new Promise((r) => setTimeout(r, 80));
      await svc.getShowcase(UID, { client });
      assert.equal(fetch.calls.length, 2);
   });

   it('maps Enka errors: 400 → invalid, 404 → not found (and cached), others → unavailable', async () => {
      await assert.rejects(showcaseWith(fakeFetch({}, 400)), ValidationError);

      const fetch404 = fakeFetch({}, 404);
      const client = createEnkaClient({ fetch: fetch404 });
      await assert.rejects(svc.getShowcase(UID, { client }), NotFoundError);
      await assert.rejects(svc.getShowcase(UID, { client }), NotFoundError);
      assert.equal(fetch404.calls.length, 1, '404 is cached');

      for (const status of [424, 429, 500, 503]) {
         await assert.rejects(showcaseWith(fakeFetch({}, status)), (e) => e instanceof UnavailableError && e.retryAfter > 0);
      }
      const down = async () => { throw new Error('ECONNRESET'); };
      await assert.rejects(showcaseWith(down), UnavailableError);
   });

   it('rejects bad UIDs before any request', async () => {
      const fetch = fakeFetch();
      const client = createEnkaClient({ fetch });
      for (const uid of ['', '123', '0123456789', '12345678901', 'abcdefghi', '80000000x', undefined]) {
         await assert.rejects(svc.getShowcase(uid, { client }), ValidationError, String(uid));
      }
      assert.equal(fetch.calls.length, 0);
   });

   it('sheds load past the queue limit with a 503', async () => {
      const fetch = fakeFetch(FIXTURE, 200, { delayMs: 30 });
      const client = createEnkaClient({ fetch, concurrency: 1, queue: 1 });
      const results = await Promise.allSettled(
         ['800000001', '800000002', '800000003'].map((uid) => svc.getShowcase(uid, { client }))
      );
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
      assert.ok(results.some((r) => r.status === 'rejected' && r.reason instanceof UnavailableError));
   });
});

describe('showcase: lookups and planner', () => {
   it('finds a showcased character by loose name, else lists what is there', async () => {
      const s = await showcaseWith(fakeFetch());
      assert.equal((await svc.findShowcaseCharacter(s, 'raiden shogun')).key, 'raiden');
      await assert.rejects(svc.findShowcaseCharacter(s, 'nahida'), (e) => e instanceof NotFoundError && e.suggestions.includes('venti'));
      await assert.rejects(svc.findShowcaseCharacter(s, 'zzzzzz'), NotFoundError);
   });

   it('brief lines are short and complete', async () => {
      const b = svc.toBrief((await showcaseWith(fakeFetch())).characters.find((c) => c.key === 'venti'));
      assert.equal(b.talents, '8/6/9');
      assert.match(b.weapon, /^Aqua Simulacra R1 Lv90$/);
      assert.ok(b.sets.includes('2pc Viridescent Venerer'));
      assert.ok(b.stats.anemo_dmg_bonus > 0);
   });

   it('planner targets go from current levels and run through planMaterials', async () => {
      const s = await showcaseWith(fakeFetch());
      for (const c of s.characters) {
         const targets = svc.toPlannerTargets(c);
         for (const t of targets) {
            if (t.level) assert.ok(t.level.from < t.level.to);
            for (const r of Object.values(t.talents ?? {})) assert.ok(r.from < r.to && r.to === 10);
         }
         if (targets.length) await planMaterials({ targets }); // throws on anything the planner rejects
      }
      const venti = s.characters.find((c) => c.key === 'venti');
      assert.deepEqual(svc.toPlannerTargets(venti), [{
         type: 'character', name: 'venti',
         talents: { normal_attack: { from: 8, to: 10 }, elemental_skill: { from: 6, to: 10 }, elemental_burst: { from: 9, to: 10 } },
      }]);
   });
});
