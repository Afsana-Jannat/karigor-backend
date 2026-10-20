
import type { Request, Response } from 'express';
import { AppError } from '../../errors/AppError.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { buildMeta, sendResponse } from '../../utils/sendResponse.js';
import { createOrUpdateBid, getJobBidsDB, getMyBidsDB, withdrawBidDB } from './bids.service.js';
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

export const getJobBids = catchAsync(async (req: Request, res) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) throw new AppError('UNAUTHENTICATED');

  const { id } = req.params as { id: string };
  const { sort } = req.query as unknown as { sort: 'price' | 'rating' | 'experience' };

  sendResponse(res, { data: await getJobBidsDB(user.id, id, sort) });
});

export const withdrawBid = catchAsync(async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) throw new AppError('UNAUTHENTICATED');

  const { id } = req.params as { id: string };

  sendResponse(res, { data: await withdrawBidDB(user.id, id) });
});

export const getMyBids = catchAsync(async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) throw new AppError('UNAUTHENTICATED');

  const query = req.query as unknown as {
    status?: 'ACTIVE' | 'SELECTED' | 'REJECTED' | 'WITHDRAWN';
    page: number;
    pageSize: number;
  };

  const { items, total } = await getMyBidsDB(user.id, query);

  sendResponse(res, {
    data: items,
    meta: buildMeta(query.page, query.pageSize, total),
  });
});