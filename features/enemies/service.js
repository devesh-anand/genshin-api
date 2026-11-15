import { enemyStore, queryEnemies } from './enemyStore.js';
import { sortResults } from '../../lib/sort.js';

const SORT_FIELDS = {
   name: 'name',
   type: 'type',
};

export const enemies = async (req, res, next) => {
   try {
      const { type, details, sort, order } = req.query;
      let results = await queryEnemies({ type });
      results = sortResults(results, SORT_FIELDS[sort] ?? null, order);

      if (details === 'true') {
         return res.send({ enemies: results.map(({ slug, data }) => ({
            key: slug,
            name: data.name,
            type: data.type,
            img: data.img,
         }))});
      }
      res.send({ enemies: results.map((r) => r.slug) });
   } catch (e) {
      next(e);
   }
};

export const enemyByName = async (req, res) => {
   try {
      const data = await enemyStore.getOne(req.params.name);
      if (!data) return res.status(404).send({ error: 'Enemy not found.' });
      res.send(data);
   } catch (e) {
      res.status(404).send({ error: 'Enemy not found.' });
   }
};

export const enemyTypes = async (req, res, next) => {
   try {
      res.send({ types: await enemyStore.getDistinct('type') });
   } catch (e) { next(e); }
};
