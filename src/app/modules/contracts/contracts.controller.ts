
import type { Request, Response } from 'express';

import { AppError } from '../../errors/AppError.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { sendResponse } from '../../utils/sendResponse.js';
import { selectBidAndCreateContract } from './contracts.service.js';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN';
  };
}

export const selectBidController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    if (!user) {
      throw new AppError('UNAUTHENTICATED', 'Please log in first');
    }

    if (user.role !== 'CUSTOMER') {
      throw new AppError(
        'FORBIDDEN',
        'Only customers can select a bid',
      );
    }

    const { id, bidId } = req.params as {
      id: string;
      bidId: string;
    };

    const result = await selectBidAndCreateContract(
      user.id,
      id,
      bidId,
    );

    sendResponse(res, {
      statusCode: 200,
      data: result,
    });
  },
);
