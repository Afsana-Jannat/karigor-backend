import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';

type Options = {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
};

export const rateLimit = ({ windowMs, max, key }: Options) => {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Remove expired entries once a minute so the map cannot grow forever.
  setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(id);
    }
  }, 60_000).unref();

  return (req: Request, _res: Response, next: NextFunction) => {
    const id = key ? key(req) : (req.ip ?? 'unknown');
    const now = Date.now();
    const entry = hits.get(id);

    if (!entry || entry.resetAt <= now) {
      hits.set(id, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > max) {
      next(new AppError('RATE_LIMITED'));
      return;
    }
    next();
  };
};