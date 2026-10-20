import { z } from "zod";

export const updateUserSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters.").max(50, "Name cannot exceed 50 characters."),
  }),
});

export const deleteUserSchema = z.object({
  body: z.object({
    confirm: z.string().refine((val) => val === "DELETE", {
      message: "You must type 'DELETE' to confirm account deletion.",
    }),
  }),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>["body"];
export type DeleteUserInput = z.infer<typeof deleteUserSchema>["body"];