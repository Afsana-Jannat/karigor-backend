import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../errors/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";
import { verifyAccessToken } from "../utils/jwt.js";

export type AuthenticatedUser = {
	id: string;
	role: "CUSTOMER" | "TECHNICIAN" | "ADMIN";
};

export type AuthenticatedRequest = Request & {
	user?: AuthenticatedUser;
};

export const authenticate = catchAsync(
	async (req: Request, _res: Response, next: NextFunction) => {
		const request = req as AuthenticatedRequest;
		const authorization = request.headers.authorization;

		if (!authorization?.startsWith("Bearer ")) {
			throw new AppError("UNAUTHENTICATED");
		}

		const token = authorization.slice(7).trim();

		if (!token) {
			throw new AppError("UNAUTHENTICATED");
		}

		const payload = verifyAccessToken(token);

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

		if (
			!user?.isVerified ||
			user.status !== "ACTIVE" ||
			user.tokenVersion !== payload.tokenVersion ||
			user.role !== payload.role
		) {
			throw new AppError("UNAUTHENTICATED");
		}

		request.user = {
			id: user.id,
			role: user.role,
		};

		next();
	},
);
