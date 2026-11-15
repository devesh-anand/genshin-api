import express from 'express';
import { materials, materialByName, materialCategories } from './controllers.js';

const router = express.Router();

router.get('/', materials);
router.get('/categories', materialCategories);
router.get('/:name', materialByName);

export default router;
