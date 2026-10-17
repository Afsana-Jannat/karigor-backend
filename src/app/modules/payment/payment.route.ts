import { Router } from 'express';

import { authenticate } from '../../middlewares/authenticate.js';
import { validateRequest } from '../../middlewares/validateRequest.js';

import { initiateBkashPaymentSchema } from './payment.validation.js';
import { bkashCallback, initiateBkashPaymentController } from './payment.controller.js';


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

export const paymentsRoutes = router;