import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse, buildMeta } from "../../utils/sendResponse.js";
import type { AuthenticatedRequest } from "../../middlewares/authenticate.js";
import * as reportService from "./report.service.js";

export const createReport = catchAsync(
  async (req: AuthenticatedRequest, res: any) => {
    const reporterId = req.user!.id;
    const jobId = req.params.id as string;

    const report = await reportService.createJobReport(
      reporterId,
      jobId,
      req.body,
    );

    sendResponse(res, {
      statusCode: 201,
      data: report,
    });
  },
);

export const getMyReports = catchAsync(
  async (req: AuthenticatedRequest, res: any) => {
    const reporterId = req.user!.id;
    const { page, pageSize } = req.query as unknown as {
      page: number;
      pageSize: number;
    };

    const { items, total } = await reportService.getMyReports(
      reporterId,
      page,
      pageSize,
    );

    sendResponse(res, {
      data: items,
      meta: buildMeta(page, pageSize, total),
    });
  },
);
