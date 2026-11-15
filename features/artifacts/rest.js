import express from 'express';
import { handle, sendList, sendOr404 } from '../../lib/http.js';
import { listArtifacts, getArtifact, toSummary } from './service.js';

const router = express.Router();

router.get('/', handle(async (req, res) => {
   const { rarity, details, sort, order } = req.query;
   sendList(res, 'artifacts', await listArtifacts({ rarity, sort, order }), details, toSummary);
}));

router.get('/:name', handle(async (req, res) => {
   sendOr404(res, await getArtifact(req.params.name), 'Artifact set not found.');
}));

export default router;
