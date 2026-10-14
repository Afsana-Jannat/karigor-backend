import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";

export async function createJobReview(
  customerId: string,
  jobId: string,
  payload: { rating: number; comment?: string },
) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, customerId: true, technicianId: true, status: true },
  });

  if (!job) {
    throw new AppError("NOT_FOUND", "Job not found");
  }

  if (job.customerId !== customerId) {
    throw new AppError(
      "FORBIDDEN",
      "You are not authorized to review this job",
    );
  }

  if (job.status !== "COMPLETED") {
    throw new AppError("INVALID_STATUS", "You can only review a completed job");
  }

  if (!job.technicianId) {
    throw new AppError("CONFLICT", "No technician was assigned to this job");
  }

  const existingReview = await prisma.review.findUnique({
    where: { jobId },
  });

  if (existingReview) {
    throw new AppError(
      "CONFLICT",
      "A review has already been submitted for this job",
    );
  }

  const technicianId = job.technicianId;

  const result = await prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        jobId,
        customerId,
        technicianId,
        rating: payload.rating,
        comment: payload.comment,
      },
    });

    const stats = await tx.review.aggregate({
      where: { technicianId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const ratingAvg = stats._avg.rating ?? 0;
    const ratingCount = stats._count.rating ?? 0;

    await tx.technicianProfile.update({
      where: { userId: technicianId },
      data: {
        ratingAvg: Number(ratingAvg.toFixed(2)),
        ratingCount,
      },
    });

    return review;
  });

  return result;
}
