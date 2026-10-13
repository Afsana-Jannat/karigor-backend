import { z } from "zod";

const phoneSchema = z
	.string()
	.trim()
	.regex(
		/^\+?[1-9]\d{7,14}$/,
		"Please provide a valid phone number with country code.",
	);

export const registerSchema = z.object({
	body: z.object({
		name: z.string().trim().min(2).max(100),
		phone: phoneSchema,
		role: z.enum(["CUSTOMER", "TECHNICIAN"]),
	}),
});

export const requestOtpSchema = z.object({
	body: z.object({
		phone: phoneSchema,
	}),
});

export const loginOtpSchema = z.object({
	body: z.object({
		phone: phoneSchema,
	}),
});

export const verifyOtpSchema = z.object({
	body: z.object({
		phone: phoneSchema,
		otp: z.string().regex(/^\d{6}$/, "OTP must be exactly 6 digits."),
	}),
});

export type RegisterInput = z.infer<typeof registerSchema>["body"];
export type RequestOtpInput = z.infer<typeof requestOtpSchema>["body"];
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>["body"];
export type LoginOtpInput = z.infer<typeof loginOtpSchema>["body"];
