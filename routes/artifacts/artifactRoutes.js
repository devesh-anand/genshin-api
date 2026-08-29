import express from 'express';
import { artifacts, artifactByName } from './controllers.js';

const router = express.Router();

router.get('/', artifacts);
router.get('/:name', artifactByName);

export default router;
