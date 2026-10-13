
import { z } from 'zod';

export const selectBidParamsSchema = z.object({
  id: z.string().trim().min(1, 'Job ID is required'),
  bidId: z.string().trim().min(1, 'Bid ID is required'),
});
