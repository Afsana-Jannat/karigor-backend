import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

type Schemas = {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
};

// Usage: validateRequest({ body: createSchema, query: listSchema })
// Each part has its own schema, so there is no wrapping object to forget.
// Parsed (and coerced) values replace the originals, so controllers can trust them.
export const validateRequest =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body ?? {});
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query);
        // Express 5: req.query is a getter, so it cannot be assigned directly.
        Object.defineProperty(req, 'query', {
          value: parsedQuery,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      next();
    } catch (error) {
      next(error); // ZodError is turned into a 400 by globalErrorHandler
    }
  };