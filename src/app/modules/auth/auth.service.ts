import { createHash, randomInt } from "node:crypto";
import { env } from "../../../config/env.js";
import { prisma } from "../../../lib/prisma.js";
import { redis } from "../../../lib/redis.js";
import { AppError } from "../../errors/AppError.js";
import {
	generateAccessToken,
	generateRefreshToken,
	verifyRefreshToken,
} from "../../utils/jwt.js";
import type { RegisterInput } from "./auth.validation.js";

type OtpPurpose = "registration" | "login";
type PublicRole = "CUSTOMER" | "TECHNICIAN";

type RegistrationData = {
	name: string;
	role: PublicRole;
};

const OTP_TTL_SECONDS = 300;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

const getOtpKey = (phone: string, purpose: OtpPurpose) =>
	purpose === "registration"
		? `karigor:auth:otp:${phone}`
		: `karigor:auth:login:otp:${phone}`;

const getAttemptsKey = (phone: string, purpose: OtpPurpose) =>
	purpose === "registration"
		? `karigor:auth:otp:attempts:${phone}`
		: `karigor:auth:login:otp:attempts:${phone}`;

const getCooldownKey = (phone: string, purpose: OtpPurpose) =>
	purpose === "registration"
		? `karigor:auth:otp:cooldown:${phone}`
		: `karigor:auth:login:otp:cooldown:${phone}`;

const getRegistrationKey = (phone: string) =>
	`karigor:auth:registration:${phone}`;

const hashOtp = (phone: string, otp: string) =>
	createHash("sha256").update(`${phone}:${otp}`).digest("hex");

/**
 * Creates an OTP and stores its hash.
 * Login OTP requests never modify registration metadata.
 */
const REQUEST_OTP_SCRIPT = `
if redis.call("EXISTS", KEYS[2]) == 1 then
  return -1
end

if redis.call("EXISTS", KEYS[1]) == 1 then
  return 0
end

redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
redis.call("SET", KEYS[3], "0", "EX", ARGV[2])
redis.call("SET", KEYS[2], "1", "EX", ARGV[3])

if ARGV[5] == "registration" then
  redis.call("SET", KEYS[4], ARGV[4], "EX", ARGV[2])
end

return 1
`;

/**
 * Verifies an OTP and consumes it atomically.
 * A successful OTP cannot be verified a second time.
 */
const VERIFY_OTP_SCRIPT = `
local storedHash = redis.call("GET", KEYS[1])

if not storedHash then
  return {-1, ""}
end

local attempts = tonumber(redis.call("GET", KEYS[2]) or "0")

if attempts >= tonumber(ARGV[2]) then
  redis.call("DEL", KEYS[1], KEYS[2])
  return {-2, ""}
end

if storedHash ~= ARGV[1] then
  attempts = redis.call("INCR", KEYS[2])

  if attempts == 1 then
    redis.call("EXPIRE", KEYS[2], ARGV[3])
  end

  if attempts >= tonumber(ARGV[2]) then
    redis.call("DEL", KEYS[1], KEYS[2])
    return {-2, ""}
  end

  return {0, tostring(attempts)}
end

local registration = ""

if ARGV[4] == "registration" then
  registration = redis.call("GET", KEYS[3]) or ""

  if registration == "" then
    return {-3, ""}
  end
end

redis.call("DEL", KEYS[1], KEYS[2], KEYS[4])

if ARGV[4] == "registration" then
  redis.call("DEL", KEYS[3])
end

return {1, registration}
`;

async function requestOtpForPurpose(
	phone: string,
	purpose: OtpPurpose,
	registration?: RegistrationData,
) {
	if (purpose === "registration" && !registration) {
		throw new AppError(
			"VALIDATION_ERROR",
			"Registration details are required before requesting an OTP.",
		);
	}

	const otp = randomInt(100000, 1000000).toString();
	const otpHash = hashOtp(phone, otp);

	const registrationData =
		purpose === "registration" && registration
			? JSON.stringify(registration)
			: "";

	const result = Number(
		await redis.eval(REQUEST_OTP_SCRIPT, {
			keys: [
				getOtpKey(phone, purpose),
				getCooldownKey(phone, purpose),
				getAttemptsKey(phone, purpose),
				getRegistrationKey(phone),
			],
			arguments: [
				otpHash,
				String(OTP_TTL_SECONDS),
				String(OTP_RESEND_COOLDOWN_SECONDS),
				registrationData,
				purpose,
			],
		}),
	);

	if (result === -1) {
		throw new AppError(
			"RATE_LIMITED",
			"Please wait before requesting another OTP.",
		);
	}

	if (result !== 1) {
		throw new AppError(
			"RATE_LIMITED",
			"An OTP request is already active. Please try again later.",
		);
	}

	return {
		message: "OTP generated successfully.",
		...(env.NODE_ENV !== "production" && env.DEMO_MODE ? { demoOtp: otp } : {}),
	};
}

export async function registerUser(input: RegisterInput) {
	const { name, phone, role } = input;

	const existingUser = await prisma.user.findUnique({
		where: { phone },
		select: { id: true },
	});

	if (existingUser) {
		throw new AppError(
			"CONFLICT",
			"An account with this phone number already exists. Please log in.",
		);
	}

	return requestOtpForPurpose(phone, "registration", { name, role });
}

export async function requestLoginOtp(phone: string) {
	const user = await prisma.user.findUnique({
		where: { phone },
		select: {
			isVerified: true,
			status: true,
		},
	});

	if (!user?.isVerified || user.status !== "ACTIVE") {
		throw new AppError(
			"UNAUTHENTICATED",
			"Unable to log in with this phone number. Please register or contact support.",
		);
	}

	return requestOtpForPurpose(phone, "login");
}

/**
 * Legacy compatibility function.
 * Registration must include name and role.
 */
export async function requestOtp(
	phone: string,
	registration?: RegistrationData,
) {
	return requestOtpForPurpose(phone, "registration", registration);
}

async function verifyOtpForPurpose(
	phone: string,
	otp: string,
	purpose: OtpPurpose,
) {
	const rawResult = await redis.eval(VERIFY_OTP_SCRIPT, {
		keys: [
			getOtpKey(phone, purpose),
			getAttemptsKey(phone, purpose),
			getRegistrationKey(phone),
			getCooldownKey(phone, purpose),
		],
		arguments: [
			hashOtp(phone, otp),
			String(OTP_MAX_ATTEMPTS),
			String(OTP_TTL_SECONDS),
			purpose,
		],
	});

	if (!Array.isArray(rawResult)) {
		throw new AppError("INTERNAL", "Unexpected OTP verification result.");
	}

	const result = Number(rawResult[0]);
	const resultDetail = String(rawResult[1] ?? "");

	if (result === -1) {
		throw new AppError(
			"OTP_EXPIRED",
			"OTP is invalid or has expired. Please request a new OTP.",
		);
	}

	if (result === -2) {
		throw new AppError(
			"RATE_LIMITED",
			"Too many incorrect attempts. Please request a new OTP.",
		);
	}

	if (result === -3) {
		throw new AppError(
			"OTP_INVALID",
			"Registration details are missing or invalid. Please register again.",
		);
	}

	if (result === 0) {
		const attempts = Number(resultDetail);
		const remainingAttempts = Math.max(0, OTP_MAX_ATTEMPTS - attempts);

		throw new AppError(
			"OTP_INVALID",
			`Incorrect OTP. ${remainingAttempts} attempts remaining.`,
		);
	}

	if (result !== 1) {
		throw new AppError("INTERNAL", "Unexpected OTP verification result.");
	}

	return resultDetail;
}

function parseRegistrationData(value: string): RegistrationData {
	try {
		const parsed: unknown = JSON.parse(value);

		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("name" in parsed) ||
			typeof parsed.name !== "string" ||
			parsed.name.trim().length < 2 ||
			parsed.name.trim().length > 100 ||
			!("role" in parsed) ||
			(parsed.role !== "CUSTOMER" && parsed.role !== "TECHNICIAN")
		) {
			throw new Error("Invalid registration data.");
		}

		return {
			name: parsed.name.trim(),
			role: parsed.role,
		};
	} catch {
		throw new AppError(
			"VALIDATION_ERROR",
			"Registration details are invalid. Please register again.",
		);
	}
}

export async function verifyOtp(phone: string, otp: string) {
	const registrationData = await verifyOtpForPurpose(
		phone,
		otp,
		"registration",
	);

	const registration = parseRegistrationData(registrationData);

	try {
		await prisma.user.create({
			data: {
				name: registration.name,
				phone,
				role: registration.role,
				isVerified: true,
			},
		});
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "P2002"
		) {
			throw new AppError(
				"CONFLICT",
				"An account with this phone number already exists. Please log in.",
			);
		}

		throw error;
	}

	return {
		verified: true,
		message: "Phone verified and account created successfully.",
	};
}

export async function verifyLoginOtp(phone: string, otp: string) {
	await verifyOtpForPurpose(phone, otp, "login");

	const user = await prisma.user.findUnique({
		where: { phone },
		select: {
			id: true,
			phone: true,
			name: true,
			role: true,
			status: true,
			isVerified: true,
			tokenVersion: true,
		},
	});

	if (!user?.isVerified) {
		throw new AppError(
			"UNAUTHENTICATED",
			"This account is unavailable for login.",
		);
	}

	if (user.status !== "ACTIVE") {
		throw new AppError("FORBIDDEN", "This account is not active.");
	}

	const tokenPayload = {
		userId: user.id,
		role: user.role,
		tokenVersion: user.tokenVersion,
	};

	return {
		user: {
			id: user.id,
			phone: user.phone,
			name: user.name,
			role: user.role,
		},
		accessToken: generateAccessToken(tokenPayload),
		refreshToken: generateRefreshToken(tokenPayload),
	};
}

export async function refreshSession(refreshToken: string) {
	const payload = verifyRefreshToken(refreshToken);

	const user = await prisma.user.findUnique({
		where: { id: payload.userId },
		select: {
			id: true,
			role: true,
			status: true,
			isVerified: true,
			tokenVersion: true,
		},
	});

	if (!user?.isVerified || user.status !== "ACTIVE") {
		throw new AppError("UNAUTHENTICATED", "Your session is no longer valid.");
	}

	if (
		user.tokenVersion !== payload.tokenVersion ||
		user.role !== payload.role
	) {
		throw new AppError(
			"UNAUTHENTICATED",
			"Your session has expired. Please log in again.",
		);
	}

	const tokenPayload = {
		userId: user.id,
		role: user.role,
		tokenVersion: user.tokenVersion,
	};

	return {
		accessToken: generateAccessToken(tokenPayload),
		refreshToken: generateRefreshToken(tokenPayload),
	};
}

export async function logoutUser(userId: string) {
	const result = await prisma.user.updateMany({
		where: { id: userId },
		data: { tokenVersion: { increment: 1 } },
	});

	if (result.count === 0) {
		throw new AppError("NOT_FOUND", "User account not found.");
	}

	return {
		message: "Logged out successfully.",
	};
}

export async function getCurrentUser(userId: string) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			phone: true,
			role: true,
			status: true,
			isVerified: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	if (!user?.isVerified || user.status !== "ACTIVE") {
		throw new AppError("UNAUTHENTICATED");
	}

	return user;
}
