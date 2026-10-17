import { z } from "zod";
import {
  VerifyStatus,
  Role,
  UserStatus,
  ReportStatus,
  JobStatus,
} from "../../../generated/prisma/client.js";

export const verificationQueueQueryValidation = z.object({
  query: z.object({
    status: z.nativeEnum(VerifyStatus).default(VerifyStatus.PENDING),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

export const rejectVerificationValidation = z.object({
  params: z.object({
    technicianId: z.string().min(1),
  }),
  body: z.object({
    reason: z
      .string()
      .min(5, "Reason must be at least 5 characters")
      .max(200, "Reason cannot exceed 200 characters"),
  }),
});

export const userListQueryValidation = z.object({
  query: z.object({
    role: z.nativeEnum(Role).optional(),
    status: z.nativeEnum(UserStatus).optional(),
    q: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

export const blockUserValidation = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    blocked: z.boolean(),
    reason: z
      .string()
      .min(5, "Reason must be at least 5 characters")
      .max(200, "Reason cannot exceed 200 characters"),
  }),
});

export const jobListQueryValidation = z.object({
  query: z.object({
    status: z.nativeEnum(JobStatus).optional(),
    skill: z.string().optional(),
    area: z.string().optional(),
    customerId: z.string().optional(),
    technicianId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

export const reportListQueryValidation = z.object({
  query: z.object({
    status: z.nativeEnum(ReportStatus).default(ReportStatus.OPEN),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

export const resolveReportValidation = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    decision: z.enum(["COMPLETE", "CANCEL", "DISMISS"]),
    resolution: z
      .string()
      .min(5, "Resolution must be at least 5 characters")
      .max(300, "Resolution cannot exceed 300 characters"),
  }),
});

export const auditLogQueryValidation = z.object({
  query: z.object({
    action: z.string().optional(),
    entityType: z.string().optional(),
    adminId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  }),
});
