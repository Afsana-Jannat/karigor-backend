import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { JobStatus, ReportReason } from "../../../generated/prisma/client.js";

export async function createJobReport(
  reporterId: string,
  jobId: string,
  payload: { reason: ReportReason; details?: string },
) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      customerId: true,
      technicianId: true,
      status: true,
    },
  });

  if (!job) {
    throw new AppError("NOT_FOUND", "Job not found");
  }

  const isParty =
    job.customerId === reporterId || job.technicianId === reporterId;
  if (!isParty) {
    throw new AppError(
      "FORBIDDEN",
      "You are not authorized to report this job",
    );
  }

  const allowedStatuses: JobStatus[] = [
    JobStatus.IN_PROGRESS,
    JobStatus.AWAITING_CONFIRMATION,
    JobStatus.COMPLETED,
    JobStatus.DISPUTED,
  ];

  if (!allowedStatuses.includes(job.status)) {
    throw new AppError(
      "INVALID_STATUS",
      "Job cannot be reported in its current status",
    );
  }

  const existingOpenReport = await prisma.report.findFirst({
    where: {
      jobId,
      reporterId,
      status: "OPEN",
    },
  });

  if (existingOpenReport) {
    throw new AppError(
      "CONFLICT",
      "You already have an open report for this job",
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const report = await tx.report.create({
      data: {
        jobId,
        reporterId,
        reason: payload.reason,
        details: payload.details,
        status: "OPEN",
      },
    });

    if (job.status !== JobStatus.DISPUTED) {
      await tx.job.update({
        where: { id: jobId },
        data: {
          statusBeforeDispute: job.status,
          status: JobStatus.DISPUTED,
        },
      });
    }

    return report;
  });

  return result;
}

export async function getMyReports(
  reporterId: string,
  page: number,
  pageSize: number,
) {
  const skip = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    prisma.report.findMany({
      where: { reporterId },
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jobId: true,
        reason: true,
        status: true,
        resolution: true,
        createdAt: true,
      },
    }),
    prisma.report.count({ where: { reporterId } }),
  ]);

  return { items, total };
}
