
import { Router } from 'express';

import { validateRequest } from '../../middlewares/validateRequest.js';
import { selectBidController } from './contracts.controller.js';
import { selectBidParamsSchema } from './contracts.validation.js';
import { authenticate } from '../../middlewares/authenticate.js';

const router = Router();

router.post(
  '/:id/bids/:bidId/select',authenticate,
  validateRequest({ params: selectBidParamsSchema }),
  selectBidController,
);

export const contractsRoutes = router;
