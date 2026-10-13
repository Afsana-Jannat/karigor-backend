import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { AppError } from "../errors/AppError.js";

type TokenPayload = {
	userId: string;
	role: "CUSTOMER" | "TECHNICIAN" | "ADMIN";
	tokenVersion: number;
};

function getJwtSecrets() {
	const accessSecret = env.JWT_ACCESS_SECRET;
	const refreshSecret = env.JWT_REFRESH_SECRET;

	if (!accessSecret || !refreshSecret) {
		throw new AppError("INTERNAL", "JWT authentication is not configured.");
	}

	return { accessSecret, refreshSecret };
}

export function generateAccessToken(payload: TokenPayload): string {
	const { accessSecret } = getJwtSecrets();

	return jwt.sign(payload, accessSecret, {
		expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
		issuer: "karigor-api",
		audience: "karigor-client",
	});
}

export function generateRefreshToken(payload: TokenPayload): string {
	const { refreshSecret } = getJwtSecrets();

	return jwt.sign(payload, refreshSecret, {
		expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
		issuer: "karigor-api",
		audience: "karigor-client",
	});
}

export function verifyAccessToken(token: string): TokenPayload {
	const { accessSecret } = getJwtSecrets();

	try {
		const decoded = jwt.verify(token, accessSecret, {
			issuer: "karigor-api",
			audience: "karigor-client",
		});

		if (
			typeof decoded === "string" ||
			typeof decoded.userId !== "string" ||
			!["CUSTOMER", "TECHNICIAN", "ADMIN"].includes(String(decoded.role)) ||
			typeof decoded.tokenVersion !== "number"
		) {
			throw new Error("Invalid token payload");
		}

		return {
			userId: decoded.userId,
			role: decoded.role as TokenPayload["role"],
			tokenVersion: decoded.tokenVersion,
		};
	} catch {
		throw new AppError("UNAUTHENTICATED", "Invalid or expired access token.");
	}
}

export function verifyRefreshToken(token: string): TokenPayload {
	const { refreshSecret } = getJwtSecrets();

	try {
		const decoded = jwt.verify(token, refreshSecret, {
			issuer: "karigor-api",
			audience: "karigor-client",
		});

		if (
			typeof decoded === "string" ||
			typeof decoded.userId !== "string" ||
			!["CUSTOMER", "TECHNICIAN", "ADMIN"].includes(String(decoded.role)) ||
			typeof decoded.tokenVersion !== "number"
		) {
			throw new Error("Invalid token payload");
		}

		return {
			userId: decoded.userId,
			role: decoded.role as TokenPayload["role"],
			tokenVersion: decoded.tokenVersion,
		};
	} catch {
		throw new AppError("UNAUTHENTICATED", "Invalid or expired refresh token.");
	}
}
