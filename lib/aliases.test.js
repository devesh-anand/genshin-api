// Integrity of the hand-curated nickname lists (features/*/aliases.js): every target exists,
// and no alias shadows another entity's real name or slug.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './nameResolver.js';
import { CHARACTER_ALIASES, listCharacters } from '../features/characters/service.js';
import { WEAPON_ALIASES, listWeapons } from '../features/weapons/service.js';
import { ARTIFACT_ALIASES, listArtifacts } from '../features/artifacts/service.js';

const SETS = [
   ['characters', CHARACTER_ALIASES, listCharacters],
   ['weapons', WEAPON_ALIASES, listWeapons],
   ['artifacts', ARTIFACT_ALIASES, listArtifacts],
];

for (const [label, aliases, list] of SETS) {
   describe(`${label} aliases`, () => {
      it('point at existing entries', async () => {
         const slugs = new Set((await list()).map((e) => e.slug));
         for (const slug of Object.keys(aliases)) assert.ok(slugs.has(slug), `${label}: unknown slug "${slug}"`);
      });

      it("never equal another entry's slug or display name", async () => {
         const owner = new Map();
         for (const { slug, data } of await list()) {
            owner.set(slug, slug);
            owner.set(slugify(data.name), slug);
         }
         for (const [slug, names] of Object.entries(aliases)) {
            for (const a of names) {
               const taken = owner.get(slugify(a));
               // Travelers share display names ("Aether"), so a same-family match is fine.
               const sameTraveler = taken && /^(aether|lumine)-/.test(taken) && /^(aether|lumine)-/.test(slug);
               assert.ok(!taken || taken === slug || sameTraveler, `${label}: alias "${a}" (→ ${slug}) shadows ${taken}`);
            }
         }
      });

      it('are only shared between entries on purpose (travelers)', () => {
         const seen = new Map();
         for (const [slug, names] of Object.entries(aliases)) {
            for (const a of names) {
               const k = slugify(a);
               const prev = seen.get(k);
               if (prev && prev !== slug) {
                  assert.ok(/^(aether|lumine)-/.test(prev) && /^(aether|lumine)-/.test(slug), `${label}: "${a}" used by ${prev} and ${slug}`);
               }
               seen.set(k, slug);
            }
         }
      });
   });
}
