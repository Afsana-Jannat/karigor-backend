
import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { createOrUpdateBidController } from './bids.controller.js';
import {
  bidParamsSchema,
  createBidSchema,
} from './bids.validation.js';
import { authenticate } from '../../middlewares/authenticate.js';

const router = Router();

router.put(
  '/:id/bid',authenticate,
  validateRequest({
    params: bidParamsSchema,
    body: createBidSchema,
  }),
  createOrUpdateBidController,
);

export const bidsRoutes = router;
