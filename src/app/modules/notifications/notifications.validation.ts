import { z } from 'zod';

export const notificationsQuery = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(20),
});

export const notificationIdParams = z.object({
  id: z.string().cuid(),
});

