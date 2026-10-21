// import { createHash, randomInt } from 'node:crypto';
// import { env } from '../../../config/env.js';
// import { prisma } from '../../../lib/prisma.js';
// import { redis } from '../../../lib/redis.js';
// import { AppError } from '../../errors/AppError.js';
// import type { RegisterInput } from './auth.validation.js';

// const OTP_TTL_SECONDS = 300;
// const OTP_RESEND_COOLDOWN_SECONDS = 60;
// const OTP_MAX_ATTEMPTS = 5;
// const OTP_VERIFY_LOCK_SECONDS = 30;

// const getOtpKey = (phone: string) => `karigor:auth:otp:${phone}`;
// const getAttemptsKey = (phone: string) => `karigor:auth:otp:attempts:${phone}`;
// const getCooldownKey = (phone: string) => `karigor:auth:otp:cooldown:${phone}`;
// const getRegistrationKey = (phone: string) =>
//   `karigor:auth:registration:${phone}`;
// const getLockKey = (phone: string) => `karigor:auth:verify-lock:${phone}`;

// const hashOtp = (phone: string, otp: string) =>
//   createHash('sha256').update(`${phone}:${otp}`).digest('hex');

// const REQUEST_OTP_SCRIPT = `
// if redis.call("EXISTS", KEYS[2]) == 1 then
//   return -1
// end

// if redis.call("EXISTS", KEYS[1]) == 1 then
//   return 0
// end

// redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
// redis.call("SET", KEYS[3], "0", "EX", ARGV[2])
// redis.call("SET", KEYS[2], "1", "EX", ARGV[3])

// if ARGV[4] ~= "" then
//   redis.call("SET", KEYS[4], ARGV[4], "EX", ARGV[2])
// else
//   redis.call("DEL", KEYS[4])
// end

// return 1
// `;

// const VERIFY_OTP_SCRIPT = `
// local storedHash = redis.call("GET", KEYS[1])

// if not storedHash then
//   return {-1, ""}
// end

// local attempts = tonumber(redis.call("GET", KEYS[2]) or "0")

// if attempts >= tonumber(ARGV[2]) then
//   redis.call("DEL", KEYS[1], KEYS[2])
//   return {-2, ""}
// end

// if storedHash ~= ARGV[1] then
//   attempts = redis.call("INCR", KEYS[2])

//   if attempts == 1 then
//     redis.call("EXPIRE", KEYS[2], ARGV[3])
//   end

//   if attempts >= tonumber(ARGV[2]) then
//     redis.call("DEL", KEYS[1], KEYS[2])
//     return {-2, ""}
//   end

//   return {0, tostring(attempts)}
// end

// local locked = redis.call(
//   "SET",
//   KEYS[4],
//   "1",
//   "EX",
//   ARGV[4],
//   "NX"
// )

// if not locked then
//   return {-3, ""}
// end

// local registration = redis.call("GET", KEYS[3]) or ""

// return {1, registration}
// `;

// export async function registerUser(input: RegisterInput) {
//   const { name, phone, role } = input;

//   const existingUser = await prisma.user.findUnique({
//     where: { phone },
//     select: { id: true },
//   });

//   if (existingUser) {
//     throw new AppError(
//       'CONFLICT',
//       'An account with this phone number already exists. Please log in.'
//     );
//   }

//   return requestOtp(phone, { name, role });
// }

// export async function requestOtp(
//   phone: string,
//   registration?: Pick<RegisterInput, 'name' | 'role'>
// ) {
//   const otp = randomInt(100000, 1000000).toString();
//   const otpHash = hashOtp(phone, otp);

//   const result = Number(
//     await redis.eval(REQUEST_OTP_SCRIPT, {
//       keys: [
//         getOtpKey(phone),
//         getCooldownKey(phone),
//         getAttemptsKey(phone),
//         getRegistrationKey(phone),
//       ],
//       arguments: [
//         otpHash,
//         String(OTP_TTL_SECONDS),
//         String(OTP_RESEND_COOLDOWN_SECONDS),
//         registration ? JSON.stringify(registration) : '',
//       ],
//     })
//   );

//   if (result === -1) {
//     throw new AppError(
//       'RATE_LIMITED',
//       'Please wait before requesting another OTP.'
//     );
//   }

//   if (result !== 1) {
//     throw new AppError(
//       'RATE_LIMITED',
//       'An OTP request is already active. Please try again later.'
//     );
//   }

//   return {
//     message: 'OTP generated successfully.',
//     ...(env.NODE_ENV !== 'production' && env.DEMO_MODE ? { demoOtp: otp } : {}),
//   };
// }

// export async function verifyOtp(phone: string, otp: string) {
//   const otpKey = getOtpKey(phone);
//   const attemptsKey = getAttemptsKey(phone);
//   const registrationKey = getRegistrationKey(phone);
//   const cooldownKey = getCooldownKey(phone);
//   const lockKey = getLockKey(phone);

//   const submittedHash = hashOtp(phone, otp);

//   const rawResult = await redis.eval(VERIFY_OTP_SCRIPT, {
//     keys: [otpKey, attemptsKey, registrationKey, lockKey],
//     arguments: [
//       submittedHash,
//       String(OTP_MAX_ATTEMPTS),
//       String(OTP_TTL_SECONDS),
//       String(OTP_VERIFY_LOCK_SECONDS),
//     ],
//   });

//   if (!Array.isArray(rawResult)) {
//     throw new AppError('INTERNAL', 'Unexpected OTP verification result.');
//   }

//   const result = Number(rawResult[0]);
//   const resultDetail = String(rawResult[1] ?? '');

//   if (result === -1) {
//     throw new AppError(
//       'OTP_EXPIRED',
//       'OTP is invalid or has expired. Please request a new OTP.'
//     );
//   }

//   if (result === -2) {
//     throw new AppError(
//       'RATE_LIMITED',
//       'Too many incorrect attempts. Please request a new OTP.'
//     );
//   }

//   if (result === -3) {
//     throw new AppError(
//       'RATE_LIMITED',
//       'OTP verification is already in progress. Please try again shortly.'
//     );
//   }

//   if (result === 0) {
//     const attempts = Number(resultDetail);
//     const remainingAttempts = Math.max(0, OTP_MAX_ATTEMPTS - attempts);

//     throw new AppError(
//       'OTP_INVALID',
//       `Incorrect OTP. ${remainingAttempts} attempts remaining.`
//     );
//   }

//   if (result !== 1) {
//     throw new AppError('INTERNAL', 'Unexpected OTP verification result.');
//   }

//   try {
//     if (resultDetail) {
//       let registration: Pick<RegisterInput, 'name' | 'role'>;

//       try {
//         const parsed: unknown = JSON.parse(resultDetail);

//         if (
//           typeof parsed !== 'object' ||
//           parsed === null ||
//           !('name' in parsed) ||
//           typeof parsed.name !== 'string' ||
//           !('role' in parsed) ||
//           (parsed.role !== 'CUSTOMER' && parsed.role !== 'TECHNICIAN')
//         ) {
//           throw new Error('Invalid registration data.');
//         }

//         registration = {
//           name: parsed.name,
//           role: parsed.role,
//         };
//       } catch {
//         throw new AppError('INTERNAL', 'Pending registration data is invalid.');
//       }

//       const existingUser = await prisma.user.findUnique({
//         where: { phone },
//         select: { id: true },
//       });

//       if (existingUser) {
//         throw new AppError(
//           'CONFLICT',
//           'An account with this phone number already exists. Please log in.'
//         );
//       }

//       try {
//         await prisma.user.create({
//           data: {
//             name: registration.name,
//             phone,
//             role: registration.role,
//             isVerified: true,
//           },
//         });
//       } catch (error) {
//         if (
//           typeof error === 'object' &&
//           error !== null &&
//           'code' in error &&
//           error.code === 'P2002'
//         ) {
//           throw new AppError(
//             'CONFLICT',
//             'An account with this phone number already exists. Please log in.'
//           );
//         }

//         throw error;
//       }
//     }

//     await redis.del([otpKey, attemptsKey, registrationKey, cooldownKey]);

//     return {
//       verified: true,
//       message: resultDetail
//         ? 'Phone verified and account created successfully.'
//         : 'OTP verified successfully.',
//     };
//   } finally {
//     await redis.del(lockKey);
//   }
// }

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

const OTP_TTL_SECONDS = 300;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_VERIFY_LOCK_SECONDS = 30;

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

const getLockKey = (phone: string, purpose: OtpPurpose) =>
	purpose === "registration"
		? `karigor:auth:verify-lock:${phone}`
		: `karigor:auth:login:verify-lock:${phone}`;

const hashOtp = (phone: string, otp: string) =>
	createHash("sha256").update(`${phone}:${otp}`).digest("hex");

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

if ARGV[4] ~= "" then
  redis.call("SET", KEYS[4], ARGV[4], "EX", ARGV[2])
else
  redis.call("DEL", KEYS[4])
end

return 1
`;

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

local locked = redis.call(
  "SET",
  KEYS[4],
  "1",
  "EX",
  ARGV[4],
  "NX"
)

if not locked then
  return {-3, ""}
end

local registration = redis.call("GET", KEYS[3]) or ""

return {1, registration}
`;

async function requestOtpForPurpose(
	phone: string,
	purpose: OtpPurpose,
	registration?: Pick<RegisterInput, "name" | "role">,
) {
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

// Registration: only new CUSTOMER or TECHNICIAN accounts.
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

// Login: only an existing, verified account can request a login OTP.
export async function requestLoginOtp(phone: string) {
	const user = await prisma.user.findUnique({
		where: { phone },
		select: { id: true, isVerified: true },
	});

	if (!user || !user.isVerified) {
		throw new AppError(
			"UNAUTHENTICATED",
			"Unable to log in with this phone number. Please register or contact support.",
		);
	}

	return requestOtpForPurpose(phone, "login");
}

// Kept for compatibility with existing registration/controller code.
export async function requestOtp(
	phone: string,
	registration?: Pick<RegisterInput, "name" | "role">,
) {
	return requestOtpForPurpose(phone, "registration", registration);
}

async function verifyOtpForPurpose(
	phone: string,
	otp: string,
	purpose: OtpPurpose,
) {
	const otpKey = getOtpKey(phone, purpose);
	const attemptsKey = getAttemptsKey(phone, purpose);
	const registrationKey = getRegistrationKey(phone);
	const cooldownKey = getCooldownKey(phone, purpose);
	const lockKey = getLockKey(phone, purpose);

	const submittedHash = hashOtp(phone, otp);

	const rawResult = await redis.eval(VERIFY_OTP_SCRIPT, {
		keys: [otpKey, attemptsKey, registrationKey, lockKey],
		arguments: [
			submittedHash,
			String(OTP_MAX_ATTEMPTS),
			String(OTP_TTL_SECONDS),
			String(OTP_VERIFY_LOCK_SECONDS),
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
			"RATE_LIMITED",
			"OTP verification is already in progress. Please try again shortly.",
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

	return {
		resultDetail,
		otpKey,
		attemptsKey,
		registrationKey,
		cooldownKey,
		lockKey,
	};
}

// Registration OTP verification: creates the account, as before.
export async function verifyOtp(phone: string, otp: string) {
	const verification = await verifyOtpForPurpose(phone, otp, "registration");

	const {
		resultDetail,
		otpKey,
		attemptsKey,
		registrationKey,
		cooldownKey,
		lockKey,
	} = verification;

	try {
		if (resultDetail) {
			let registration: Pick<RegisterInput, "name" | "role">;

			try {
				const parsed: unknown = JSON.parse(resultDetail);

				if (
					typeof parsed !== "object" ||
					parsed === null ||
					!("name" in parsed) ||
					typeof parsed.name !== "string" ||
					!("role" in parsed) ||
					(parsed.role !== "CUSTOMER" && parsed.role !== "TECHNICIAN")
				) {
					throw new Error("Invalid registration data.");
				}

				registration = {
					name: parsed.name,
					role: parsed.role,
				};
			} catch {
				throw new AppError("INTERNAL", "Pending registration data is invalid.");
			}

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
		} else {
			throw new AppError(
				"OTP_INVALID",
				"This OTP was not requested for registration.",
			);
		}

		await redis.del([otpKey, attemptsKey, registrationKey, cooldownKey]);

		return {
			verified: true,
			message: "Phone verified and account created successfully.",
		};
	} finally {
		await redis.del(lockKey);
	}
}

// Login OTP verification: creates tokens for an existing verified user.
export async function verifyLoginOtp(phone: string, otp: string) {
	const verification = await verifyOtpForPurpose(phone, otp, "login");

	const { otpKey, attemptsKey, cooldownKey, lockKey } = verification;

	try {
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

		if (!user || !user.isVerified) {
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

		const accessToken = generateAccessToken(tokenPayload);
		const refreshToken = generateRefreshToken(tokenPayload);

		await redis.del([otpKey, attemptsKey, cooldownKey]);

		return {
			user: {
				id: user.id,
				phone: user.phone,
				name: user.name,
				role: user.role,
			},
			accessToken,
			refreshToken,
		};
	} finally {
		await redis.del(lockKey);
	}
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

	if (!user || !user.isVerified || user.status !== "ACTIVE") {
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
		where: { id: userId, tokenVersion: { gte: 0 } },
		data: { tokenVersion: { increment: 1 } },
	});

	if (result.count === 0) {
		throw new AppError("NOT_FOUND", "User account not found.");
	}

	return {
		message: "Logged out successfully.",
	};
}
