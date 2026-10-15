import { z } from 'zod';

export const initiateBkashPaymentSchema = z.object({
  body: z.object({
    jobId: z.string().trim().min(1, 'Job ID is required'),
  }),
});

export type InitiateBkashPaymentInput = z.infer<
  typeof initiateBkashPaymentSchema
>['body'];