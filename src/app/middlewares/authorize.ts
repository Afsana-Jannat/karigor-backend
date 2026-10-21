import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';
import type { AuthenticatedRequest, AuthenticatedUser } from './authenticate.js';

export const authorize =
  (...roles: AuthenticatedUser['role'][]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) return next(new AppError('UNAUTHENTICATED'));
    if (!roles.includes(user.role)) return next(new AppError('FORBIDDEN'));
    next();
  };