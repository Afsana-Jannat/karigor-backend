import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/authenticate.js";
import { AppError } from "../../errors/AppError.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { deleteCurrentUser, updateCurrentUser } from "./user.service.js";

export const updateCurrentUserController = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError("UNAUTHENTICATED");
    }

    const { name } = req.body;
    const result = await updateCurrentUser(userId, name);

    sendResponse(res, {
      data: result,
    });
  }
);

export const deleteCurrentUserController = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      throw new AppError("UNAUTHENTICATED");
    }

    await deleteCurrentUser(userId, userRole);

  
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/api/v1/auth",
    });

    sendResponse(res, {
      data: { success: true, message: "Account deleted successfully." },
    });
  }
);