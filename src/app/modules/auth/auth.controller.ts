import type { Request, Response } from 'express';
import { AppError } from '../../errors/AppError.js';
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { sendResponse } from '../../utils/sendResponse.js';
import {
  getCurrentUser,
  logoutAllUser,
  logoutUser,
  refreshSession,
  registerUser,
  requestLoginOtp,
  verifyLoginOtp,
  verifyOtp,
} from './auth.service.js';

export const registerController = catchAsync(
  async (req: Request, res: Response) => {
    const result = await registerUser(req.body);

    sendResponse(res, {
      data: result,
    });
  }
);

export const verifyOtpController = catchAsync(
  async (req: Request, res: Response) => {
    const { phone, otp } = req.body;

    const result = await verifyOtp(phone, otp);

    if (!result.verified) {
      throw new AppError('OTP_INVALID');
    }

    sendResponse(res, {
      data: result,
    });
  }
);

// Request OTP for an existing account.
export const requestLoginOtpController = catchAsync(
  async (req: Request, res: Response) => {
    const { phone } = req.body;

    const result = await requestLoginOtp(phone);

    sendResponse(res, {
      data: result,
    });
  }
);

// Verify login OTP and issue JWT tokens.
export const verifyLoginOtpController = catchAsync(
  async (req: Request, res: Response) => {
    const { phone, otp } = req.body;

    const result = await verifyLoginOtp(phone, otp);

    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    sendResponse(res, {
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken:result.refreshToken
      },
    });
  }
);

export const refreshTokenController = catchAsync(
  async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new AppError('UNAUTHENTICATED', 'Refresh token is required.');
    }

    const result = await refreshSession(refreshToken);

    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    sendResponse(res, {
      data: { accessToken: result.accessToken,
        refreshToken:result.refreshToken
       },
    });
  }
);

export const checkAuthController = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError('UNAUTHENTICATED');
    }

    const result = await getCurrentUser(userId);

    sendResponse(res, {
      data: { user: result },
    });
  }
);

export const logoutController = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError('UNAUTHENTICATED');
    }

    const result = await logoutUser(userId);

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });

    sendResponse(res, {
      data: result,
    });
  }
);
