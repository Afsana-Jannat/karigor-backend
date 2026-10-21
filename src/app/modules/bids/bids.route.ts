
import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { createOrUpdateBidController, getJobBids, getMyBids, withdrawBid } from './bids.controller.js';
import {
  bidParamsSchema,
  createBidSchema,
  jobBidsQuery,
  jobIdParams,
  myBidsQuery,
} from './bids.validation.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';

const router = Router();

router.put(
  '/:id/bid',authenticate,
  validateRequest({
    params: bidParamsSchema,
    body: createBidSchema,
  }),
  createOrUpdateBidController,
);


router.get(
  '/mine',
  authenticate,
  authorize('TECHNICIAN'),
  validateRequest({ query: myBidsQuery }),
  getMyBids,
);

router.delete(
  '/:id/bid',
  authenticate,
  authorize('TECHNICIAN'),
  validateRequest({ params: bidParamsSchema }),
  withdrawBid,
);

const jobBidsRouter = Router();

jobBidsRouter.get(
  '/:id/bids',
  authenticate,
  authorize('CUSTOMER'),
  validateRequest({ params: jobIdParams, query: jobBidsQuery }),
  getJobBids,
);

export const bidsRoutes = router;
export const jobBidsRoutes = jobBidsRouter;
