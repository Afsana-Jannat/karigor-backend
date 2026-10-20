import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";

export async function updateCurrentUser(userId: string, name: string) {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { name },
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
    },
  });

  return updatedUser;
}

export async function deleteCurrentUser(userId: string, userRole: string) {
  if (userRole === "ADMIN") {
    throw new AppError("FORBIDDEN", "Admins cannot delete their accounts here.");
  }

  
  const activeJobsCount = await prisma.job.count({
    where: {
      OR: [
        { customerId: userId },
        { technicianId: userId },
      ],
      status: {
        in: ["OPEN", "CONTRACT_PENDING", "IN_PROGRESS", "AWAITING_CONFIRMATION", "DISPUTED"],
      },
    },
  });

  if (activeJobsCount > 0) {
    throw new AppError(
      "CONFLICT",
      "Please finish or cancel your active jobs before deleting your account."
    );
  }

  return await prisma.$transaction(async (tx) => {
    
    await tx.user.update({
      where: { id: userId },
      data: {
        status: "DELETED",
        tokenVersion: { increment: 1 },
      },
    });

    
    if (userRole === "TECHNICIAN") {
      await tx.technicianProfile.updateMany({
        where: { userId },
        data: { isAvailableNow: false },
      });

      await tx.bid.updateMany({
        where: {
          technicianId: userId,
          status: "ACTIVE",
        },
        data: {
          status: "WITHDRAWN",
        },
      });
    }

    return {
      success: true,
      message: "Account deleted successfully.",
    };
  });
}