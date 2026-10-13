
import { z } from 'zod';

export const createBidSchema = z.object({
  price: z.coerce.number().int().min(1).max(1_000_000),
  note: z.string().trim().max(200).optional(),
});

export const bidParamsSchema = z.object({
  id: z.string().trim().min(1, 'Job ID is required'),
});

export type CreateBidInput = z.infer<typeof createBidSchema>;
