import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import {
  VerifyStatus,
  ReportStatus,
  JobStatus,
  UserStatus,
  Role,
} from "../../../generated/prisma/client.js";
import cloudinary from "cloudinary";

const getPrivateNidUrl = (publicId: string) => {
  const timestamp = Math.round(new Date().getTime() / 1000);
  return cloudinary.v2.url(publicId, {
    resource_type: "image",
    type: "authenticated",
    sign_url: true,
    secure: true,
    expires_at: timestamp + 300,
  });
};

export const getVerificationQueue = async (
  status: VerifyStatus,
  page: number,
  pageSize: number,
) => {
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    prisma.technicianProfile.findMany({
      where: { verifyStatus: status },
      include: {
        user: { select: { id: true, name: true, createdAt: true } },
      },
      skip,
      take: pageSize,
      orderBy: { createdAt: "asc" },
    }),
    prisma.technicianProfile.count({ where: { verifyStatus: status } }),
  ]);

  return { items, total };
};

export const getVerificationDetail = async (technicianId: string) => {
  const profile = await prisma.technicianProfile.findUnique({
    where: { userId: technicianId },
    include: {
      user: { select: { id: true, name: true, phone: true, createdAt: true } },
    },
  });

  if (!profile) {
    throw new AppError("NOT_FOUND", "Technician profile not found");
  }

  let signedNidUrl: string | null = null;
  if (profile.nidPublicId) {
    try {
      signedNidUrl = getPrivateNidUrl(profile.nidPublicId);
    } catch {
      signedNidUrl = null;
    }
  }

  return { ...profile, signedNidUrl };
};

export const approveVerification = async (
  adminId: string,
  technicianId: string,
) => {
  return await prisma.$transaction(async (tx) => {
    const profile = await tx.technicianProfile.findUnique({
      where: { userId: technicianId },
    });

    if (!profile || profile.verifyStatus !== VerifyStatus.PENDING) {
      throw new AppError(
        "INVALID_STATUS",
        "Verification request not found or not in PENDING state",
      );
    }

    const updatedProfile = await tx.technicianProfile.update({
      where: { userId: technicianId },
      data: { verifyStatus: VerifyStatus.VERIFIED, rejectReason: null },
    });

    await tx.auditLog.create({
      data: {
        adminId,
        action: "VERIFICATION_APPROVED",
        entityType: "TechnicianProfile",
        entityId: technicianId,
      },
    });

    await tx.notification.create({
      data: {
        userId: technicianId,
        type: "VERIFICATION_RESULT",
      },
    });

    return updatedProfile;
  });
};

export const rejectVerification = async (
  adminId: string,
  technicianId: string,
  reason: string,
) => {
  return await prisma.$transaction(async (tx) => {
    const profile = await tx.technicianProfile.findUnique({
      where: { userId: technicianId },
    });

    if (!profile || profile.verifyStatus !== VerifyStatus.PENDING) {
      throw new AppError(
        "INVALID_STATUS",
        "Verification request not found or not in PENDING state",
      );
    }

    const updatedProfile = await tx.technicianProfile.update({
      where: { userId: technicianId },
      data: { verifyStatus: VerifyStatus.REJECTED, rejectReason: reason },
    });

    await tx.auditLog.create({
      data: {
        adminId,
        action: "VERIFICATION_REJECTED",
        entityType: "TechnicianProfile",
        entityId: technicianId,
        details: { reason },
      },
    });

    await tx.notification.create({
      data: {
        userId: technicianId,
        type: "VERIFICATION_RESULT",
      },
    });

    return updatedProfile;
  });
};

export const getUsers = async (
  role?: Role,
  status?: UserStatus,
  q?: string,
  page = 1,
  pageSize = 20,
) => {
  const skip = (page - 1) * pageSize;
  const where: any = {};
  if (role) where.role = role;
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        isVerified: true,
        createdAt: true,
      },
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total };
};

export const getUserDetail = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      technicianProfile: true,
      _count: {
        select: {
          jobsAsCustomer: true,
          jobsAsTechnician: true,
          bids: true,
          reportsFiled: true,
          reportsResolved: true,
          paymentsMade: true,
        },
      },
    },
  });

  if (!user || user.status === UserStatus.DELETED) {
    throw new AppError("NOT_FOUND", "User not found");
  }

  const jobStats = await prisma.job.groupBy({
    by: ["status"],
    where: {
      OR: [{ customerId: id }, { technicianId: id }],
    },
    _count: { status: true },
  });

  const paymentTotals = await prisma.payment.aggregate({
    where: { payerId: id, status: "SUCCESS" },
    _sum: { amount: true },
  });

  return { user, jobStats, paymentTotals: paymentTotals._sum.amount || 0 };
};

export const blockOrUnblockUser = async (
  adminId: string,
  targetUserId: string,
  blocked: boolean,
  reason: string,
) => {
  if (adminId === targetUserId) {
    throw new AppError("FORBIDDEN", "You cannot block yourself");
  }

  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user || user.status === UserStatus.DELETED) {
      throw new AppError("NOT_FOUND", "User not found");
    }

    if (user.role === Role.ADMIN) {
      throw new AppError("FORBIDDEN", "Cannot block an admin user");
    }

    const newStatus = blocked ? UserStatus.BLOCKED : UserStatus.ACTIVE;

    const updatedUser = await tx.user.update({
      where: { id: targetUserId },
      data: {
        status: newStatus,
        tokenVersion: blocked ? { increment: 1 } : undefined,
      },
    });

    if (blocked && user.role === Role.TECHNICIAN) {
      await tx.technicianProfile.update({
        where: { userId: targetUserId },
        data: { isAvailableNow: false },
      });

      await tx.bid.updateMany({
        where: { technicianId: targetUserId, status: "ACTIVE" },
        data: { status: "WITHDRAWN" },
      });
    }

    await tx.auditLog.create({
      data: {
        adminId,
        action: blocked ? "USER_BLOCKED" : "USER_UNBLOCKED",
        entityType: "User",
        entityId: targetUserId,
        details: { reason },
      },
    });

    return updatedUser;
  });
};

export const getJobs = async (
  filters: {
    status?: JobStatus;
    skill?: string;
    area?: string;
    customerId?: string;
    technicianId?: string;
    startDate?: string;
    endDate?: string;
  },
  page = 1,
  pageSize = 20,
) => {
  const skip = (page - 1) * pageSize;
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.skill) where.skill = filters.skill;
  if (filters.area) where.area = filters.area;
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.technicianId) where.technicianId = filters.technicianId;
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
  }

  const [items, total] = await Promise.all([
    prisma.job.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        technician: { select: { id: true, name: true, phone: true } },
      },
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.job.count({ where }),
  ]);

  return { items, total };
};

export const getReports = async (
  status: ReportStatus,
  page = 1,
  pageSize = 20,
) => {
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    prisma.report.findMany({
      where: { status },
      include: {
        job: { select: { id: true, status: true, skill: true, area: true } },
        reporter: { select: { id: true, name: true, role: true } },
      },
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.report.count({ where: { status } }),
  ]);

  return { items, total };
};

export const resolveReport = async (
  adminId: string,
  reportId: string,
  decision: "COMPLETE" | "CANCEL" | "DISMISS",
  resolution: string,
) => {
  return await prisma.$transaction(async (tx) => {
    const report = await tx.report.findUnique({
      where: { id: reportId },
      include: { job: true },
    });

    if (!report || report.status !== ReportStatus.OPEN) {
      throw new AppError(
        "INVALID_STATUS",
        "Report not found or already resolved",
      );
    }

    const updatedReport = await tx.report.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.RESOLVED,
        resolution,
        resolvedById: adminId,
        resolvedAt: new Date(),
      },
    });

    const otherOpenReportsCount = await tx.report.count({
      where: {
        jobId: report.jobId,
        status: ReportStatus.OPEN,
        id: { not: reportId },
      },
    });

    if (otherOpenReportsCount === 0) {
      let targetStatus: JobStatus =
        report.job.statusBeforeDispute || JobStatus.OPEN;
      let completedAtUpdate = {};

      if (decision === "COMPLETE") {
        targetStatus = JobStatus.COMPLETED;
        completedAtUpdate = {
          completedAt: report.job.completedAt || new Date(),
        };

        if (
          report.job.technicianId &&
          report.job.status !== JobStatus.COMPLETED
        ) {
          await tx.technicianProfile.update({
            where: { userId: report.job.technicianId },
            data: { completedJobs: { increment: 1 } },
          });
        }
      } else if (decision === "CANCEL") {
        targetStatus = JobStatus.CANCELLED;
      }

      await tx.job.update({
        where: { id: report.jobId },
        data: {
          status: targetStatus,
          statusBeforeDispute: null,
          ...completedAtUpdate,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        adminId,
        action: "REPORT_RESOLVED",
        entityType: "Report",
        entityId: reportId,
        details: { decision, resolution },
      },
    });

    return updatedReport;
  });
};

export const getAuditLogs = async (
  filters: {
    action?: string;
    entityType?: string;
    targetAdminId?: string;
    startDate?: string;
    endDate?: string;
  },
  page = 1,
  pageSize = 20,
) => {
  const skip = (page - 1) * pageSize;
  const where: any = {};
  if (filters.action) where.action = filters.action;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.targetAdminId) where.adminId = filters.targetAdminId;
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        admin: { select: { id: true, name: true, phone: true } },
      },
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total };
};

export const getStats = async () => {
  const [
    usersByRole,
    techniciansByVerifyStatus,
    jobsByStatus,
    openReportsCount,
    totalPaidSum,
    newUsersLast7Days,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], _count: { role: true } }),
    prisma.technicianProfile.groupBy({
      by: ["verifyStatus"],
      _count: { verifyStatus: true },
    }),
    prisma.job.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.report.count({ where: { status: ReportStatus.OPEN } }),
    prisma.payment.aggregate({
      where: { status: "SUCCESS" },
      _sum: { amount: true },
    }),
    prisma.user.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  return {
    usersByRole,
    techniciansByVerifyStatus,
    jobsByStatus,
    openReportsCount,
    totalPaidAmount: totalPaidSum._sum.amount || 0,
    newUsersLast7Days,
  };
};
