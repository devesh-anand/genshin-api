import { characterStore } from '../character/characterStore.js';
import { weaponStore } from '../weapons/weaponStore.js';
import { artifactStore } from '../artifacts/artifactStore.js';

export const search = async (req, res, next) => {
   try {
      const { q } = req.query;
      if (!q || q.trim().length < 2) {
         return res.status(400).send({ error: 'Query must be at least 2 characters.' });
      }

      const term = q.trim().toLowerCase();
      const match = (data) => data.name?.toLowerCase().includes(term);

      const [chars, weapons, artifacts] = await Promise.all([
         characterStore.query(match),
         weaponStore.query(match),
         artifactStore.query(match),
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
         },
      });
   } catch (e) {
      next(e);
   }
};
