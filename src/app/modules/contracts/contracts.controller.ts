
import type { Request, Response } from 'express';

import { AppError } from '../../errors/AppError.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { sendResponse } from '../../utils/sendResponse.js';
import { getJobContract, requestContractSignOtp, selectBidAndCreateContract, signContract } from './contracts.service.js';

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


export const getJobContractController = catchAsync(
  async (req, res) => {
        const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    if (!user) {
      throw new AppError('UNAUTHENTICATED', 'Please log in first');
    }
    const { id } = req.params;

    const contract = await getJobContract(
      id as string,
      user.id,
      user.role,
    );

    sendResponse(res, {
      statusCode: 200,
      data: contract,
    });
  },
);

export const requestContractSignOtpController = catchAsync(
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    if (!user) {
      throw new AppError(
        'UNAUTHENTICATED',
        'Please log in first',
      );
    }

    const { id } = req.params;

    const data = await requestContractSignOtp(id as string, user.id);

    sendResponse(res, {
      statusCode: 200,
      data,
    });
  },
);



export const signContractController = catchAsync(
  async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    if (!user) {
      throw new AppError(
        'UNAUTHENTICATED',
        'Please log in first',
      );
    }

    const { id } = req.params;
    const { otp } = req.body;

    const data = await signContract(id as string, user.id, otp);

    sendResponse(res, {
      statusCode: 200,
      data,
    });
  },
);
