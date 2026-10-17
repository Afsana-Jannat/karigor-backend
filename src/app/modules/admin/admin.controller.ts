import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse, buildMeta } from "../../utils/sendResponse.js";
import type { AuthenticatedRequest } from "../../middlewares/authenticate.js";
import * as adminService from "./admin.service.js";
import {
  VerifyStatus,
  Role,
  UserStatus,
  ReportStatus,
  JobStatus,
} from "../../../generated/prisma/client.js";

export const getVerificationQueue = catchAsync(
  async (req: AuthenticatedRequest, res) => {
    const { status, page, pageSize } = req.query as unknown as {
      status: VerifyStatus;
      page: number;
      pageSize: number;
    };
    const { items, total } = await adminService.getVerificationQueue(
      status,
      page,
      pageSize,
    );
    sendResponse(res, { data: items, meta: buildMeta(page, pageSize, total) });
  },
);

export const getVerificationDetail = catchAsync(
  async (req: AuthenticatedRequest, res) => {
    const technicianId = req.params.technicianId as string;
    const result = await adminService.getVerificationDetail(technicianId);
    sendResponse(res, { data: result });
  },
);

export const approveVerification = catchAsync(
  async (req: AuthenticatedRequest, res) => {
    const adminId = req.user!.id;
    const technicianId = req.params.technicianId as string;
    const result = await adminService.approveVerification(
      adminId,
      technicianId,
    );
    sendResponse(res, { data: result });
  },
);

export const rejectVerification = catchAsync(
  async (req: AuthenticatedRequest, res) => {
    const adminId = req.user!.id;
    const technicianId = req.params.technicianId as string;
    const { reason } = req.body;
    const result = await adminService.rejectVerification(
      adminId,
      technicianId,
      reason,
    );
    sendResponse(res, { data: result });
  },
);

export const getUsers = catchAsync(async (req: AuthenticatedRequest, res) => {
  const { role, status, q, page, pageSize } = req.query as unknown as {
    role?: Role;
    status?: UserStatus;
    q?: string;
    page: number;
    pageSize: number;
  };
  const { items, total } = await adminService.getUsers(
    role,
    status,
    q,
    page,
    pageSize,
  );
  sendResponse(res, { data: items, meta: buildMeta(page, pageSize, total) });
});

export const getUserDetail = catchAsync(
  async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const result = await adminService.getUserDetail(id);
    sendResponse(res, { data: result });
  },
);

export const blockUser = catchAsync(async (req: AuthenticatedRequest, res) => {
  const adminId = req.user!.id;
  const targetUserId = req.params.id as string;
  const { blocked, reason } = req.body;
  const result = await adminService.blockOrUnblockUser(
    adminId,
    targetUserId,
    blocked,
    reason,
  );
  sendResponse(res, { data: result });
});

export const getJobs = catchAsync(async (req: AuthenticatedRequest, res) => {
  const {
    status,
    skill,
    area,
    customerId,
    technicianId,
    startDate,
    endDate,
    page,
    pageSize,
  } = req.query as unknown as {
    status?: JobStatus;
    skill?: string;
    area?: string;
    customerId?: string;
    technicianId?: string;
    startDate?: string;
    endDate?: string;
    page: number;
    pageSize: number;
  };
  const { items, total } = await adminService.getJobs(
    { status, skill, area, customerId, technicianId, startDate, endDate },
    page,
    pageSize,
  );
  sendResponse(res, { data: items, meta: buildMeta(page, pageSize, total) });
});

export const getReports = catchAsync(async (req: AuthenticatedRequest, res) => {
  const { status, page, pageSize } = req.query as unknown as {
    status: ReportStatus;
    page: number;
    pageSize: number;
  };
  const { items, total } = await adminService.getReports(
    status,
    page,
    pageSize,
  );
  sendResponse(res, { data: items, meta: buildMeta(page, pageSize, total) });
});

export const resolveReport = catchAsync(
  async (req: AuthenticatedRequest, res) => {
    const adminId = req.user!.id;
    const reportId = req.params.id as string;
    const { decision, resolution } = req.body;
    const result = await adminService.resolveReport(
      adminId,
      reportId,
      decision,
      resolution,
    );
    sendResponse(res, { data: result });
  },
);

export const getAuditLogs = catchAsync(
  async (req: AuthenticatedRequest, res) => {
    const {
      action,
      entityType,
      targetAdminId,
      startDate,
      endDate,
      page,
      pageSize,
    } = req.query as unknown as {
      action?: string;
      entityType?: string;
      targetAdminId?: string;
      startDate?: string;
      endDate?: string;
      page: number;
      pageSize: number;
    };
    const { items, total } = await adminService.getAuditLogs(
      { action, entityType, targetAdminId, startDate, endDate },
      page,
      pageSize,
    );
    sendResponse(res, { data: items, meta: buildMeta(page, pageSize, total) });
  },
);

export const getStats = catchAsync(async (_req: AuthenticatedRequest, res) => {
  const result = await adminService.getStats();
  sendResponse(res, { data: result });
});
