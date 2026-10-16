import { z } from "zod";

export const createReportValidation = z.object({
  body: z.object({
    reason: z.enum(["NO_SHOW", "POOR_WORK", "OVERCHARGE", "FRAUD", "OTHER"]),
    details: z
      .string()
      .max(500, "Details cannot exceed 500 characters")
      .optional(),
  }),
  params: z.object({
    id: z.string().min(1, "Job ID is required"),
  }),
});

export const listReportsQueryValidation = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(20).default(20),
  }),
});
