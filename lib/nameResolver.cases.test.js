// Real-world name cases: what players and models actually type, per entity type.
// Add a row whenever a name resolves wrongly in practice, so it stays fixed.
//   expect: slug   → must resolve to exactly this
//   expect: [a, b] → must NOT guess; suggestions must include all of these
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findCharacter } from '../features/characters/service.js';
import { findWeapon } from '../features/weapons/service.js';
import { findArtifact } from '../features/artifacts/service.js';
import { findMaterial } from '../features/materials/service.js';
import { findEnemy } from '../features/enemies/service.js';

const FIND = { character: findCharacter, weapon: findWeapon, artifact: findArtifact, material: findMaterial, enemy: findEnemy };

export const CASES = [
   // Same letters, different category: each tool resolves within its own type
   ['weapon', 'hod', 'harbinger-of-dawn'],
   ['weapon', 'HoD', 'harbinger-of-dawn'],
   ['artifact', 'hod', 'heart-of-depth'],
   ['artifact', 'HOD', 'heart-of-depth'],
   ['artifact', 'h.o.d', 'heart-of-depth'],

   // Curated nicknames
   ['character', 'Childe', 'tartaglia'],
   ['character', 'ei', 'raiden'],
   ['character', 'Raiden Ei', 'raiden'],
   ['character', 'scara', 'wanderer'],
   ['character', 'Morax', 'zhongli'],
   ['character', 'neuv', 'neuvillette'],
   ['character', 'xq', 'xingqiu'],
   ['weapon', 'Fav Sword', 'favonius-sword'],
   ['weapon', 'sac frags', 'sacrificial-fragments'],
   ['artifact', 'EoSF', 'emblem-of-severed-fate'],
   ['artifact', 'VV', 'viridescent-venerer'],

   // Generated initials
   ['weapon', 'pjws', 'primordial-jade-winged-spear'],
   ['weapon', 'tfd', 'a-thousand-floating-dreams'],
   ['artifact', 'totm', 'tenacity-of-the-millelith'],
   ['character', 'ht', 'hu-tao'],
   ['material', 'hw', 'heros-wit'],

   // Full names, spacing, typos, partial names
   ['character', 'zibai', 'zibai'],
   ['character', 'Hu Tao', 'hu-tao'],
   ['character', 'hutao', 'hu-tao'],
   ['character', 'Raiden Shogun', 'raiden'],
   ['character', 'kazuha', 'kazuha'],
   ['character', 'zhonlgi', 'zhongli'],
   ['weapon', 'harbinger', 'harbinger-of-dawn'],
   ['weapon', 'harbinger of dwan', 'harbinger-of-dawn'],
   ['weapon', 'mistsplitter', 'mistsplitter-reforged'],
   ['artifact', 'emblem of severd fate', 'emblem-of-severed-fate'],
   ['material', 'kalpalata lotos', 'kalpalata-lotus'],

   // Must not guess
   ['character', 'traveler', ['aether-anemo', 'lumine-anemo']],
   ['character', 'anemo traveler', ['aether-anemo', 'lumine-anemo']],
   ['character', 'aether', ['aether-anemo', 'aether-pyro']],
   ['character', 'zibia', ['zibai']],
   ['character', 'nahdia', ['nahida']],
   ['weapon', 'af', ['aquila-favonia', 'the-alley-flash']],
   ['weapon', 'skyward', ['skyward-harp', 'skyward-blade']],
   ['artifact', 'tm', ['tenacity-of-the-millelith', 'tiny-miracle']],
];

describe('name cases', () => {
   for (const [type, input, expect] of CASES) {
      it(`${type} "${input}" → ${Array.isArray(expect) ? `suggest ${expect.join(', ')}` : expect}`, async () => {
         const r = await FIND[type](input);
         if (Array.isArray(expect)) {
            assert.equal(r.slug, null, `guessed ${r.slug}`);
            for (const e of expect) assert.ok(r.suggestions.includes(e), `missing suggestion ${e}: ${JSON.stringify(r)}`);
         } else {
            assert.equal(r.slug, expect, JSON.stringify(r));
         }
      });
   }
});
