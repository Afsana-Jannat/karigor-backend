
import { Router } from 'express';

import { validateRequest } from '../../middlewares/validateRequest.js';
import { getJobContractController, requestContractSignOtpController, selectBidController, signContractController } from './contracts.controller.js';
import { selectBidParamsSchema, signContractBodySchema, signContractParamsSchema} from './contracts.validation.js';
import { authenticate } from '../../middlewares/authenticate.js';

const router = Router();

router.post(
  '/:id/bids/:bidId/select',authenticate,
  validateRequest({ params: selectBidParamsSchema }),
  selectBidController,
);
router.get(
  "/:id/contract",
  authenticate,
  getJobContractController,
);
router.post(
  '/:id/sign-otp',
  authenticate,
  requestContractSignOtpController,
);

router.post(
  '/:id/sign',
 authenticate,
  validateRequest({
    params: signContractParamsSchema,
    body: signContractBodySchema
  }),
  signContractController,
);

export const contractsRoutes = router;
