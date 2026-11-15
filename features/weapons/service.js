import { weaponStore, queryWeapons } from './weaponStore.js';
import { sortResults } from '../../lib/sort.js';

const SORT_FIELDS = {
   name:   'name',
   rarity: 'rarity',
   type:   'type',
};

export const weapons = async (req, res, next) => {
   try {
      const { type, rarity, details, sort, order } = req.query;
      let results = await queryWeapons({ type, rarity });
      results = sortResults(results, SORT_FIELDS[sort] ?? null, order);

      if (details === 'true') {
         return res.send({ weapons: results.map(({ slug, data }) => ({
            key: slug,
            name: data.name,
            rarity: data.rarity,
            type: data.type,
            sub_stat: data.sub_stat,
            passive_name: data.passive_name,
            img: data.img,
         }))});
      }
      res.send({ weapons: results.map((r) => r.slug) });
   } catch (e) {
      next(e);
   }
};

export const weaponByName = async (req, res) => {
   try {
      const data = await weaponStore.getOne(req.params.name);
      if (!data) return res.status(404).send({ error: 'Weapon not found.' });
      res.send(data);
   } catch (e) {
      res.status(404).send({ error: 'Weapon not found.' });
   }
};

export const weaponTypes = async (req, res, next) => {
   try {
      res.send({ types: await weaponStore.getDistinct('type') });
   } catch (e) { next(e); }
};
