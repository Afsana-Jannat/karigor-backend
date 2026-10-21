import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  checkAuthController,
  logoutAllController,
  logoutController,
  refreshTokenController,
  registerController,
  requestLoginOtpController,
  verifyLoginOtpController,
  verifyOtpController,
} from './auth.controller.js';
import {
  loginOtpSchema,
  registerSchema,
  verifyOtpSchema,
} from './auth.validation.js';

const router = Router();

// Registration
router.post(
  '/register',
  validateRequest({ body: registerSchema.shape.body }),
  registerController
);

router.post(
  '/verify-otp',
  validateRequest({ body: verifyOtpSchema.shape.body }),
  verifyOtpController
);

// Login
router.post(
  '/login/request-otp',
  validateRequest({ body: loginOtpSchema.shape.body }),
  requestLoginOtpController
);

router.post(
  '/login/verify-otp',
  validateRequest({ body: verifyOtpSchema.shape.body }),
  verifyLoginOtpController
);

// Check the currently authenticated user.
router.get('/check-auth', authenticate, checkAuthController);

// Refresh access and refresh tokens using the HttpOnly refresh-token cookie.
router.post('/refresh', refreshTokenController);

// Logout requires a valid access token.
router.post('/logout', authenticate, logoutController);

// Logout from all devices
router.post('/logout-all', authenticate, logoutAllController);
export const authRoutes = router;
