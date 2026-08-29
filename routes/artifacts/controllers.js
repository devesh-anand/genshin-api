import path from 'path';
import { createDataStore } from '../../lib/dataStore.js';

const store = createDataStore(path.join(path.resolve(), 'data/artifacts'));

function queryArtifacts({ rarity } = {}) {
   return store.query((a) => {
      if (rarity && a.rarity !== Number(rarity)) return false;
      return true;
   });
}

export const artifacts = async (req, res, next) => {
   try {
      const { rarity, details } = req.query;
      const results = await queryArtifacts({ rarity });

      if (details === 'true') {
         return res.send({ artifacts: results.map(({ slug, data }) => ({
            key: slug,
            name: data.name,
            rarity: data.rarity,
            bonus: data.bonus,
            img: data.pieces?.flower?.img ?? null,
         }))});
      }
      res.send({ artifacts: results.map((r) => r.slug) });
   } catch (e) {
      next(e);
   }
};

export const artifactByName = async (req, res) => {
   try {
      const data = await store.getOne(req.params.name);
      if (!data) return res.status(404).send({ error: 'Artifact set not found.' });
      res.send(data);
   } catch (e) {
      res.status(404).send({ error: 'Artifact set not found.' });
   }
};
