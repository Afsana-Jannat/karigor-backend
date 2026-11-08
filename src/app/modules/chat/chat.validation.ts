import { z } from "zod";

export const sendChatMessageSchema = z.object({
	message: z.string().trim().min(1).max(1000),
	sessionId: z.string().uuid().optional(),
});
