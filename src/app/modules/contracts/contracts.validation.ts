
import { z } from 'zod';

export const selectBidParamsSchema = z.object({
  id: z.string().trim().min(1, 'Job ID is required'),
  bidId: z.string().trim().min(1, 'Bid ID is required'),
});





// আলাদা আলাদা স্কিমা
export const signContractParamsSchema = z.object({
  id: z.string().min(1),
});

export const signContractBodySchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});
