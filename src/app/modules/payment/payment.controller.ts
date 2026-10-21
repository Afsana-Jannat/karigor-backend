import type { Request, Response } from 'express';

import { AppError } from '../../errors/AppError.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { sendResponse } from '../../utils/sendResponse.js';
import { initiateBkashPayment } from './payment.service.js';
import { handleBkashCallback } from './payment.callback.service.js';


interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN';
  };
}

export const initiateBkashPaymentController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    if (!user) {
      throw new AppError('UNAUTHENTICATED', 'Please log in first');
    }

    if (user.role !== 'CUSTOMER') {
      throw new AppError(
        'FORBIDDEN',
        'Only customers can initiate bKash payments',
      );
    }

    const { jobId } = req.body as { jobId: string };

    const data = await initiateBkashPayment(user.id, jobId);

    sendResponse(res, {
      statusCode: 200,
      data,
    });
  },
);


// Add this export to the existing controller file.
export const bkashCallback = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const paymentID =
      typeof req.query.paymentID === "string"
        ? req.query.paymentID
        : undefined;

    const status =
      typeof req.query.status === "string"
        ? req.query.status
        : undefined;

    const ref =
      typeof req.query.ref === "string"
        ? req.query.ref
        : undefined;

    const redirectUrl = await handleBkashCallback(
      paymentID,
      status,
      ref,
    );

    res.redirect(303, redirectUrl);
  } catch (error) {
    console.error("bKash callback processing failed:", error);

    const clientUrl = process.env.CLIENT_URL?.replace(/\/$/, "");

    if (!clientUrl) {
      res.status(500).send("Payment callback could not be processed.");
      return;
    }

    res.redirect(
      303,
      `${clientUrl}/payment/result?status=failure`,
    );
  }
};
