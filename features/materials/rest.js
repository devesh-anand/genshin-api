import express from 'express';
import { handle, sendList, sendOr404 } from '../../lib/http.js';
import { listMaterials, getMaterial, listMaterialCategories, toSummary } from './service.js';

const router = express.Router();

router.get('/', handle(async (req, res) => {
   const { category, rarity, details, sort, order } = req.query;
   sendList(res, 'materials', await listMaterials({ category, rarity, sort, order }), details, toSummary);
}));

router.get('/categories', handle(async (req, res) => res.send({ categories: await listMaterialCategories() })));

router.get('/:name', handle(async (req, res) => {
   sendOr404(res, await getMaterial(req.params.name), 'Material not found.');
}));

export default router;
