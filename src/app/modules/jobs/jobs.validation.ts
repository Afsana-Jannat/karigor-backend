
import { z } from 'zod';
import { isAreaSlug, isSkillSlug } from '../../../constants/index.js';

const MAX_PREFERRED_DATE_DAYS = 60;

function isPreferredDateValid(value: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const latestDate = new Date(today);
  latestDate.setDate(latestDate.getDate() + MAX_PREFERRED_DATE_DAYS);

  return value >= today && value <= latestDate;
}

export const createJobSchema = z.object({
  skill: z.string().trim().refine(isSkillSlug, 'Please select a valid skill'),
  area: z.string().trim().refine(isAreaSlug, 'Please select a valid area'),
  description: z
    .string()
    .trim()
    .min(5, 'Description must contain at least 5 characters')
    .max(500, 'Description cannot exceed 500 characters'),
  preferredDate: z.coerce
    .date()
    .refine(
      isPreferredDateValid,
      'Preferred date must be between today and 60 days from today',
    ),
  isEmergency: z.boolean().optional().default(false),
});

export const listJobsQuerySchema = z.object({
  status: z
    .enum([
      'OPEN',
      'CONTRACT_PENDING',
      'IN_PROGRESS',
      'AWAITING_CONFIRMATION',
      'COMPLETED',
      'CANCELLED',
      'DISPUTED',
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export const jobIdParamsSchema = z.object({
  id: z.string().trim().min(1, 'Job ID is required'),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;



export const openJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(10),
});

export type OpenJobsQuery = z.infer<typeof openJobsQuerySchema>;
