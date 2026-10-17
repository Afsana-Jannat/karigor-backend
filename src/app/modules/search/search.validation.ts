import { z } from 'zod';

export const parseQueryBody = z.object({
  query: z.string().trim().min(1).max(200),
});