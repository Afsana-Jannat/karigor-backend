
import type { Request, Response } from 'express';
import { AppError } from '../../errors/AppError.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { sendResponse } from '../../utils/sendResponse.js';
import { createJob, getMyJobs } from './jobs.service.js';
import type { ListJobsQuery } from './jobs.validation.js';

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    role: 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN';
  };
};

export const createJobController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const user = {id:"cmv59ex3s0000ssvbweozbmkn",
        role:"CUSTOMER"
    };

    if (!user) {
      throw new AppError('UNAUTHENTICATED', 'Please log in first');
    }

    if (user.role !== 'CUSTOMER') {
      throw new AppError('FORBIDDEN', 'Only customers can post jobs');
    }

    const result = await createJob(user.id, req.body);

    sendResponse(res, {
      statusCode: 201,
      data: result,
    });
  },
);

export const getMyJobsController = catchAsync(
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    if (!user) {
      throw new AppError('UNAUTHENTICATED', 'Please log in first');
    }

    if (user.role !== 'CUSTOMER' && user.role !== 'TECHNICIAN') {
      throw new AppError(
        'FORBIDDEN',
        'Only customers and technicians can view their jobs',
      );
    }

    const query = req.query as unknown as ListJobsQuery;
    const result = await getMyJobs(user.id, user.role, query);

    sendResponse(res, {
      data: result.data,
      meta: result.meta,
    });
  },
);
