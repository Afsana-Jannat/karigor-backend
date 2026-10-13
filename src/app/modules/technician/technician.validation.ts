import { z } from 'zod';
import { AREA_SLUGS, SKILL_SLUGS } from '../../../constants/index.js';

export const searchTechniciansQuery = z.object({
  skill: z
    .string()
    .refine((v) => SKILL_SLUGS.includes(v), { message: 'Unknown skill slug' })
    .optional(),
  area: z
    .string()
    .refine((v) => AREA_SLUGS.includes(v), { message: 'Unknown area slug' })
    .optional(),
  q: z.string().max(100).optional(),
  verifiedOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  availableNow: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxRate: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['relevance', 'rating', 'experience', 'rate']).default('relevance'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(20),
});

export const technicianIdParams = z.object({
  id: z.string().cuid(),
});


export const reviewsQuery = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(20),
});

const uniqueList = (label: string) => ({
  message: `${label} must not contain duplicates`,
});
export const upsertProfileBody = z
  .object({
    name: z.string().trim().min(2).max(50).optional(),
    age: z.coerce.number().int().min(16).max(80),
    bio: z.string().max(300).optional(),
    experienceYears: z.coerce.number().int().min(0).max(60),
    skills: z
      .union([z.string(), z.array(z.string())])
      .transform((v) => (Array.isArray(v) ? v : [v]))
      .refine((v) => v.length >= 1 && v.length <= 10, {
        message: 'Provide 1 to 10 skills',
      })
      .refine((v) => v.every((s) => SKILL_SLUGS.includes(s)), {
        message: 'One or more skill slugs are invalid',
      })
      .refine((v) => new Set(v).size === v.length, uniqueList('skills')),
    areas: z
      .union([z.string(), z.array(z.string())])
      .transform((v) => (Array.isArray(v) ? v : [v]))
      .refine((v) => v.length >= 1 && v.length <= 10, {
        message: 'Provide 1 to 10 areas',
      })
      .refine((v) => v.every((a) => AREA_SLUGS.includes(a)), {
        message: 'One or more area slugs are invalid',
      })
      .refine((v) => new Set(v).size === v.length, uniqueList('areas')),
    rateMin: z.coerce.number().int().min(0).max(1000000).optional(),
    rateMax: z.coerce.number().int().min(0).max(1000000).optional(),
  })
  .refine(
    (d) => d.rateMin === undefined || d.rateMax === undefined || d.rateMin <= d.rateMax,
    { message: 'rateMin must not be greater than rateMax' },
  );