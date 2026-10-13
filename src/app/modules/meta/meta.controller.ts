import { catchAsync } from '../../utils/catchAsync.js';
import { sendResponse } from '../../utils/sendResponse.js';
import { getOptions } from './meta.service.js';

export const getMetaOptions = catchAsync(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  sendResponse(res, { data: getOptions() });
});