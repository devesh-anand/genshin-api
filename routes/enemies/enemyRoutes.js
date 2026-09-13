import express from 'express';
import { enemies, enemyByName, enemyTypes } from './controllers.js';

const router = express.Router();

router.get('/', enemies);
router.get('/types', enemyTypes);
router.get('/:name', enemyByName);

export default router;
