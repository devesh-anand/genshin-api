import path from 'path';
import { createDataStore } from '../../lib/dataStore.js';

const store = createDataStore(path.join(path.resolve(), 'data/weapons'));

function queryWeapons({ type, rarity } = {}) {
   return store.query((w) => {
      if (type   && w.type?.toLowerCase()  !== type.toLowerCase())  return false;
      if (rarity && w.rarity              !== Number(rarity))        return false;
      return true;
   });
}

export const weapons = async (req, res, next) => {
   try {
      const { type, rarity, details } = req.query;
      const results = await queryWeapons({ type, rarity });

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
      const data = await store.getOne(req.params.name);
      if (!data) return res.status(404).send({ error: 'Weapon not found.' });
      res.send(data);
   } catch (e) {
      res.status(404).send({ error: 'Weapon not found.' });
   }
};

export const weaponTypes = async (req, res, next) => {
   try {
      res.send({ types: await store.getDistinct('type') });
   } catch (e) { next(e); }
};
