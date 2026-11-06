import { Router } from 'express';

import { authenticate } from '../../middlewares/authenticate.js';
import { validateRequest } from '../../middlewares/validateRequest.js';

import { initiateBkashPaymentSchema } from './payment.validation.js';
import {
  bkashCallback,
  getJobPaymentsController,
  initiateBkashPaymentController,
  reconcileBkashPaymentController,
} from './payment.controller.js';


const router = Router();

router.post(
  '/bkash/initiate',
  authenticate,
  validateRequest({
    body: initiateBkashPaymentSchema.shape.body,
  }),
  initiateBkashPaymentController,
);
router.get("/bkash/callback", bkashCallback);

router.get(
  "/:id/payments",
  authenticate,
  getJobPaymentsController,
);

router.post(
  "/:id/reconcile",
  authenticate,
  reconcileBkashPaymentController,
);

export const paymentsRoutes = router;