import { artifactStore, queryArtifacts } from './artifactStore.js';
import { sortResults } from '../../lib/sort.js';

const SORT_FIELDS = {
   name:   'name',
   rarity: 'rarity',
};

export const artifacts = async (req, res, next) => {
   try {
      const { rarity, details, sort, order } = req.query;
      let results = await queryArtifacts({ rarity });
      results = sortResults(results, SORT_FIELDS[sort] ?? null, order);

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
      const data = await artifactStore.getOne(req.params.name);
      if (!data) return res.status(404).send({ error: 'Artifact set not found.' });
      res.send(data);
   } catch (e) {
      res.status(404).send({ error: 'Artifact set not found.' });
   }
};
