import type { ErrorRequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { ZodError } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AppError, type ErrorCode, ERROR_STATUS } from '../errors/AppError.js';

type ErrorPayload = {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details: unknown[];
};

const fromCode = (code: ErrorCode, message: string, details: unknown[] = []): ErrorPayload => ({
  statusCode: ERROR_STATUS[code],
  code,
  message,
  details,
});

// Turns any thrown error into { statusCode, code, message, details }.
function normalizeError(err: unknown): ErrorPayload {
  // 1. Our own errors
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }

  // 2. Zod validation errors
  if (err instanceof ZodError) {
    return fromCode(
      'VALIDATION_ERROR',
      'Validation failed',
      err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    );
  }

  // 3. Prisma errors we can explain safely
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return fromCode('CONFLICT', 'A record with this value already exists');
      case 'P2025':
        return fromCode('NOT_FOUND', 'Record not found');
      case 'P2003':
        return fromCode('CONFLICT', 'A related record is missing or still in use');
      case 'P2034':
        return fromCode('CONFLICT', 'The data changed at the same time, please try again');
      default:
        break; // anything else is unexpected, so it falls through to 500
    }
  }

  // 4. JWT errors (expired, malformed, bad signature)
  if (err instanceof jwt.TokenExpiredError) {
    return fromCode('UNAUTHENTICATED', 'Your session has expired, please log in again');
  }
  if (err instanceof jwt.JsonWebTokenError) {
    return fromCode('UNAUTHENTICATED', 'Invalid token');
  }

  // 5. Multer upload errors (file too large, unexpected field, ...)
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large' : err.message;
    return fromCode('VALIDATION_ERROR', message);
  }

  // 6. Body parser errors (bad JSON, body too large)
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const type = (err as { type?: string }).type;
    if (type === 'entity.parse.failed') {
      return fromCode('VALIDATION_ERROR', 'Request body is not valid JSON');
    }
    if (type === 'entity.too.large') {
      return { ...fromCode('VALIDATION_ERROR', 'Request body is too large'), statusCode: 413 };
    }
  }

  // 7. Anything else is a bug: never leak its message to the client
  return fromCode('INTERNAL', 'Something went wrong');
}

// Express recognises an error handler by its 4 parameters, so keep all 4.
export const globalErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const payload = normalizeError(err);
  // Safe by default: debug details only when NODE_ENV is explicitly 'development'.
  const showDebug = process.env.NODE_ENV === 'development';

  if (payload.statusCode >= 500) {
    console.error('[error]', err);
  }

  const details =
    payload.code === 'INTERNAL' && showDebug && err instanceof Error
      ? [{ message: err.message, stack: err.stack }]
      : payload.details;

  // The HTTP status and the status in the JSON always come from the same payload.
  res.status(payload.statusCode).json({
    success: false,
    error: {
      code: payload.code,
      message: payload.message,
      details,
    },
  });
};