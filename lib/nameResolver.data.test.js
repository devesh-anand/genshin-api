// Safety net on the real dataset: a single-letter typo of any name must resolve to that
// entity or to nothing — never to a different entity. (A full sweep of ~65k typos was run
// when typo correction was added; this samples it to stay fast.)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveName } from './nameResolver.js';
import { characterStore } from '../features/characters/store.js';
import { weaponStore } from '../features/weapons/store.js';
import { artifactStore } from '../features/artifacts/store.js';
import { CHARACTER_ALIASES } from '../features/characters/aliases.js';
import { WEAPON_ALIASES } from '../features/weapons/aliases.js';
import { ARTIFACT_ALIASES } from '../features/artifacts/aliases.js';

const ALIASES = { characterStore: CHARACTER_ALIASES, weaponStore: WEAPON_ALIASES, artifactStore: ARTIFACT_ALIASES };
import { materialStore } from '../features/materials/store.js';
import { enemyStore } from '../features/enemies/store.js';

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function typosOf(name) {
   const i = Math.floor(name.length / 2);
   return [
      name.slice(0, i) + name.slice(i + 1),                          // delete
      name.slice(0, i) + name[i + 1] + name[i] + name.slice(i + 2),  // swap
      name.slice(0, i) + 'q' + name.slice(i + 1),                    // substitute
   ].filter((t) => norm(t) !== norm(name));
}

describe('nameResolver on real data', () => {
   for (const [label, store] of Object.entries({ characterStore, weaponStore, artifactStore })) {
      it(`${label}: every slug and display name still resolves to itself with aliases on`, async () => {
         const entries = await store.getAll();
         for (const { slug, data } of entries) {
            assert.equal(resolveName(entries, slug, { aliases: ALIASES[label] }).slug, slug, slug);
            const byName = resolveName(entries, data.name, { aliases: ALIASES[label] });
            assert.ok(byName.slug === slug || byName.suggestions.includes(slug), `${data.name} → ${JSON.stringify(byName)}`);
         }
      });
   }

   for (const [label, store] of Object.entries({ characterStore, weaponStore, artifactStore, materialStore, enemyStore })) {
      it(`${label}: typos never resolve to a different entity`, async () => {
         const entries = await store.getAll();
         const byNormName = new Map(entries.map((e) => [norm(e.data.name ?? ''), e.slug]));
         for (const { slug, data } of entries.filter((_, i) => i % 3 === 0)) {
            if (!data.name || data.name.length < 4) continue;
            for (const typo of typosOf(data.name)) {
               const got = resolveName(entries, typo, { aliases: ALIASES[label] }).slug;
               const spellsAnotherName = byNormName.get(norm(typo)) === got;
               assert.ok(got === null || got === slug || spellsAnotherName, `"${typo}" → ${got} (meant ${slug})`);
            }
         }
      });
   }
});
