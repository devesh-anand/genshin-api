import { materialStore, queryMaterials } from './materialStore.js';
import { sortResults } from '../../lib/sort.js';

const SORT_FIELDS = {
   name:     'name',
   rarity:   'rarity',
   category: 'category',
};

export const materials = async (req, res, next) => {
   try {
      const { category, rarity, details, sort, order } = req.query;
      let results = await queryMaterials({ category, rarity });
      results = sortResults(results, SORT_FIELDS[sort] ?? null, order);

      if (details === 'true') {
         return res.send({ materials: results.map(({ slug, data }) => ({
            key: slug,
            name: data.name,
            rarity: data.rarity,
            category: data.category,
            img: data.img,
         }))});
      }
      res.send({ materials: results.map((r) => r.slug) });
   } catch (e) {
      next(e);
   }
};

export const materialByName = async (req, res) => {
   try {
      const data = await materialStore.getOne(req.params.name);
      if (!data) return res.status(404).send({ error: 'Material not found.' });
      res.send(data);
   } catch (e) {
      res.status(404).send({ error: 'Material not found.' });
   }
};

export const materialCategories = async (req, res, next) => {
   try {
      res.send({ categories: await materialStore.getDistinct('category') });
   } catch (e) { next(e); }
};
