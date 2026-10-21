
import { z } from 'zod';

export const createBidSchema = z.object({
  price: z.coerce.number().int().min(1).max(1_000_000),
  note: z.string().trim().max(200).optional(),
});

export const bidParamsSchema = z.object({
  id: z.string().trim().min(1, 'Job ID is required'),
});

export type CreateBidInput = z.infer<typeof createBidSchema>;


export const jobIdParams = z.object({
  id: z.string().trim().min(1),
});

export const jobBidsQuery = z.object({
  sort: z.enum(['price', 'rating', 'experience']).default('price'),
});

export const myBidsQuery = z.object({
  status: z.enum(['ACTIVE', 'SELECTED', 'REJECTED', 'WITHDRAWN']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(20),
});