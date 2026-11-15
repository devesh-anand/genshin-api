import { characterStore } from '../character/characterStore.js';
import { weaponStore } from '../weapons/weaponStore.js';
import { artifactStore } from '../artifacts/artifactStore.js';
import { materialStore } from '../materials/materialStore.js';
import { enemyStore } from '../enemies/enemyStore.js';

export const search = async (req, res, next) => {
   try {
      const { q } = req.query;
      if (!q || q.trim().length < 2) {
         return res.status(400).send({ error: 'Query must be at least 2 characters.' });
      }

      const term = q.trim().toLowerCase();
      const match = (data) => data.name?.toLowerCase().includes(term);

      const [chars, weapons, artifacts, materials, enemies] = await Promise.all([
         characterStore.query(match),
         weaponStore.query(match),
         artifactStore.query(match),
         materialStore.query(match),
         enemyStore.query(match),
      ]);

      res.set('Cache-Control', 'public, max-age=300');
      res.send({
         query: q.trim(),
         results: {
            characters: chars.map(({ slug, data }) => ({
               key: slug,
               name: data.name,
               vision: data.vision,
               weapon: data.weapon,
               rarity: data.rarity,
               img: data.img?.icon ?? null,
            })),
            weapons: weapons.map(({ slug, data }) => ({
               key: slug,
               name: data.name,
               type: data.type,
               rarity: data.rarity,
               img: data.img?.icon ?? null,
            })),
            artifacts: artifacts.map(({ slug, data }) => ({
               key: slug,
               name: data.name,
               rarity: data.rarity,
               img: data.pieces?.flower?.img ?? null,
            })),
            materials: materials.map(({ slug, data }) => ({
               key: slug,
               name: data.name,
               rarity: data.rarity,
               category: data.category,
               img: data.img,
            })),
            enemies: enemies.map(({ slug, data }) => ({
               key: slug,
               name: data.name,
               type: data.type,
               img: data.img,
            })),
         },
      });
   } catch (e) {
      next(e);
   }
};
