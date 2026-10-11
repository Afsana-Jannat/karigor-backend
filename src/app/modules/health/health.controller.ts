import { AppError } from '../../errors/AppError.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { sendResponse } from '../../utils/sendResponse.js';
import { isDatabaseUp } from './health.service.js';

export const getHealth = catchAsync(async (_req, res) => {
  const up = await isDatabaseUp();
  if (!up) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Database is unreachable');
  }
  sendResponse(res, { data: { status: 'ok', time: new Date().toISOString() } });
});