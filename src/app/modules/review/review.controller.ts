import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import type { AuthenticatedRequest } from "../../middlewares/authenticate.js";
import * as reviewService from "./review.service.js";

export const createReview = catchAsync(
  async (req: AuthenticatedRequest, res) => {
    const customerId = req.user!.id;
    const jobId = req.params.id as string;

    const review = await reviewService.createJobReview(
      customerId,
      jobId,
      req.body,
    );

    sendResponse(res, {
      statusCode: 201,
      data: review,
    });
  },
);
