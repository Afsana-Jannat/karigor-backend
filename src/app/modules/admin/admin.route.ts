import { Router } from "express";
import { validateRequest } from "../../middlewares/validateRequest.js";
import {
  verificationQueueQueryValidation,
  rejectVerificationValidation,
  userListQueryValidation,
  blockUserValidation,
  jobListQueryValidation,
  reportListQueryValidation,
  resolveReportValidation,
  auditLogQueryValidation,
} from "./admin.validation.js";
import * as adminController from "./admin.controller.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { Role } from "../../../generated/prisma/client.js";

const router = Router();

// Shob admin route-er jonno authentication ebong ADMIN role mandatory
router.use(authenticate, authorize(Role.ADMIN));

router.get(
  "/verifications",
  validateRequest({ query: verificationQueueQueryValidation.shape.query }),
  adminController.getVerificationQueue,
);

router.get(
  "/verifications/:technicianId",
  adminController.getVerificationDetail,
);

router.post(
  "/verifications/:technicianId/approve",
  adminController.approveVerification,
);

router.post(
  "/verifications/:technicianId/reject",
  validateRequest({
    body: rejectVerificationValidation.shape.body,
    params: rejectVerificationValidation.shape.params,
  }),
  adminController.rejectVerification,
);

router.get(
  "/users",
  validateRequest({ query: userListQueryValidation.shape.query }),
  adminController.getUsers,
);

router.get("/users/:id", adminController.getUserDetail);

router.patch(
  "/users/:id/block",
  validateRequest({
    body: blockUserValidation.shape.body,
    params: blockUserValidation.shape.params,
  }),
  adminController.blockUser,
);

router.get(
  "/jobs",
  validateRequest({ query: jobListQueryValidation.shape.query }),
  adminController.getJobs,
);

router.get(
  "/reports",
  validateRequest({ query: reportListQueryValidation.shape.query }),
  adminController.getReports,
);

router.post(
  "/reports/:id/resolve",
  validateRequest({
    body: resolveReportValidation.shape.body,
    params: resolveReportValidation.shape.params,
  }),
  adminController.resolveReport,
);

router.get(
  "/audit-logs",
  validateRequest({ query: auditLogQueryValidation.shape.query }),
  adminController.getAuditLogs,
);

router.get("/stats", adminController.getStats);

export const adminRoutes = router;
