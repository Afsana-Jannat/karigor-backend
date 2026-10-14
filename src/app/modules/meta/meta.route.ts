import { Router } from 'express';
import { getMetaOptions } from './meta.controller.js';

const router = Router();

router.get('/options', getMetaOptions);

export const metaRoutes = router;