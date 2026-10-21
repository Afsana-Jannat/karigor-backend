import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
};