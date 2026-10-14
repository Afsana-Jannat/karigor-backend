
import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  createJobController,
  getMyJobsController,
  getOpenJobsController,
} from './jobs.controller.js';
import {
  createJobSchema,
  listJobsQuerySchema,
  openJobsQuerySchema,
} from './jobs.validation.js';
import { authenticate } from '../../middlewares/authenticate.js';

const router = Router();

router.post(
  '/',authenticate,
  validateRequest({ body: createJobSchema }),
  createJobController,
);

router.get(
  '/',authenticate,
  validateRequest({ query: listJobsQuerySchema }),
  getMyJobsController,
);

router.get(
  '/open',authenticate,
  validateRequest({ query: openJobsQuerySchema }),
  getOpenJobsController,
);

export const jobsRoutes = router;
