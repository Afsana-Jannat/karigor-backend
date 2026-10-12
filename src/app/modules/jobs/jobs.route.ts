
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

const router = Router();

router.post(
  '/',
  validateRequest({ body: createJobSchema }),
  createJobController,
);

router.get(
  '/',
  validateRequest({ query: listJobsQuerySchema }),
  getMyJobsController,
);

router.get(
  '/open',
  validateRequest({ query: openJobsQuerySchema }),
  getOpenJobsController,
);

export const jobsRoutes = router;
