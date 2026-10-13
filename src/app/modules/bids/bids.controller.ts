
import type { Request, Response } from 'express';
import { AppError } from '../../errors/AppError.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { sendResponse } from '../../utils/sendResponse.js';
import { createOrUpdateBid } from './bids.service.js';
import type { CreateBidInput } from './bids.validation.js';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN';
  };
}

export const createOrUpdateBidController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    console.log(user)
    if (!user) {
      throw new AppError(
        'UNAUTHENTICATED',
        'Please log in first',
      );
    }

    if (user.role !== 'TECHNICIAN') {
      throw new AppError(
        'FORBIDDEN',
        'Only technicians can submit bids',
      );
    }

    const { id } = req.params as { id: string };
    const input = req.body as CreateBidInput;

    const bid = await createOrUpdateBid(user.id, id, input);

    sendResponse(res, {
      statusCode: 200,
      data: bid,
    });
  },
);
