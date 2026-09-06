import { characterStore, queryCharacters } from './characterStore.js';
import { sortResults } from '../../lib/sort.js';

// ?sort= values → data field names
const SORT_FIELDS = {
   name:    'name',
   rarity:  'rarity',
   element: 'vision',
   nation:  'nation',
   weapon:  'weapon',
};

// Summary shape returned when ?details=true
function toSummary({ slug, data }) {
   return {
      key: slug,
      name: data.name,
      title: data.title,
      vision: data.vision,
      weapon: data.weapon,
      nation: data.nation,
      rarity: data.rarity,
      img: data.img,
   };
}

export const characters = async (req, res, next) => {
   try {
      const { element, weapon, nation, rarity, details, sort, order } = req.query;
      let results = await queryCharacters({ element, weapon, nation, rarity });
      results = sortResults(results, SORT_FIELDS[sort] ?? null, order);

      if (details === 'true') {
         return res.send({ characters: results.map(toSummary) });
      }
      res.send({ characters: results.map((r) => r.slug) });
   } catch (e) {
      next(e);
   }
};

export const name = async (req, res) => {
   try {
      const data = await characterStore.getOne(req.params.name);
      if (!data) return res.status(404).send({ error: 'Character not found.' });
      res.send(data);
   } catch (e) {
      res.status(404).send({ error: 'Character not found.' });
   }
};

// Kept for backwards compatibility — delegates to queryCharacters
export const element = async (req, res, next) => {
   try {
      const results = await queryCharacters({ element: req.params.element });
      res.send({ characters: results.map((r) => r.slug) });
   } catch (e) {
      next(e);
   }
};

export const weapon = async (req, res, next) => {
   try {
      const results = await queryCharacters({ weapon: req.params.weapon });
      res.send({ characters: results.map((r) => r.slug) });
   } catch (e) {
      next(e);
   }
};

export const elements = async (req, res, next) => {
   try {
      const values = await characterStore.getDistinct('vision');
      res.send({ elements: values });
   } catch (e) {
      next(e);
   }
};

export const nations = async (req, res, next) => {
   try {
      const values = await characterStore.getDistinct('nation');
      res.send({ nations: values });
   } catch (e) {
      next(e);
   }
};

export const imgList = async (req, res, next) => {
   try {
      const results = await queryCharacters();
      res.send({ characters: results.map(toSummary) });
   } catch (e) {
      next(e);
   }
};

export const imgOfCharsOfElement = async (req, res, next) => {
   try {
      const results = await queryCharacters({ element: req.params.element });
      res.send({ characters: results.map(toSummary) });
   } catch (e) {
      next(e);
   }
};
