import { z } from "zod";

export const createReviewValidation = z.object({
  body: z.object({
    rating: z
      .number()
      .int()
      .min(1, "Rating must be at least 1")
      .max(5, "Rating cannot exceed 5"),
    comment: z
      .string()
      .max(300, "Comment cannot exceed 300 characters")
      .optional(),
  }),
  params: z.object({
    id: z.string().min(1, "Job ID is required"),
  }),
});
