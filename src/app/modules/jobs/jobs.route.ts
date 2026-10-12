
import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  createJobController,
  getMyJobsController,
} from './jobs.controller.js';
import {
  createJobSchema,
  listJobsQuerySchema,
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

export const jobsRoutes = router;
