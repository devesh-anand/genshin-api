import express from 'express';
import { handle } from '../../lib/http.js';
import { planMaterials, getFarmingSchedule } from './service.js';

const router = express.Router();

// POST, because plans carry a structured body (targets + inventory). Validation and
// error statuses (400 invalid input, 404 unknown name) come from the service.
router.post('/plan', handle(async (req, res) => {
   res.send(await planMaterials(req.body));
}));

router.post('/farming', handle(async (req, res) => {
   res.send(await getFarmingSchedule(req.body));
}));

export default router;
