import type { Request } from 'express';
import { AppError } from '../../errors/AppError.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { sendResponse } from '../../utils/sendResponse.js';
import { parseSearchQuery, parseVoiceQuery } from './search.service.js';

export const parseQuery = catchAsync(async (req: Request, res) => {
  const { query } = req.body as { query: string };

  sendResponse(res, { data: await parseSearchQuery(query) });
});

export const parseVoice = catchAsync(async (req: Request, res) => {
  const audio = req.file;
  if (!audio) throw new AppError('VALIDATION_ERROR', 'Audio file is required');

  sendResponse(res, { data: await parseVoiceQuery(audio) });
});