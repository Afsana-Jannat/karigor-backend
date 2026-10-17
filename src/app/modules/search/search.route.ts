import { Router } from 'express';
import { authenticate, type AuthenticatedRequest } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { rateLimit } from '../../middlewares/rateLimit.js';
import { uploadAudio } from '../../middlewares/upload.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { parseQuery, parseVoice } from './search.controller.js';
import { parseQueryBody } from './search.validation.js';

const router = Router();

// Customers only. Each Gemini call is limited per user.
const perUserLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  key: (req) => (req as AuthenticatedRequest).user?.id ?? req.ip ?? 'unknown',
});

router.post(
  '/parse-query',
  authenticate,
  authorize('CUSTOMER'),
  perUserLimit,
  validateRequest({ body: parseQueryBody }),
  parseQuery,
);

router.post(
  '/parse-voice',
  authenticate,
  authorize('CUSTOMER'),
  perUserLimit,
  uploadAudio,
  parseVoice,
);

export const searchRoutes = router;