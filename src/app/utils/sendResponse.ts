import type { Response } from 'express';

export type Meta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type SendResponseOptions<T> = {
  statusCode?: number;
  data: T;
  meta?: Meta;
};

export function buildMeta(page: number, pageSize: number, total: number): Meta {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

// Success shape: { success: true, data, meta? } (meta only on lists)
export function sendResponse<T>(
  res: Response,
  { statusCode = 200, data, meta }: SendResponseOptions<T>
): void {
  res.status(statusCode).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}