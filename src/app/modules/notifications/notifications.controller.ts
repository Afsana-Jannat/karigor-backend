import type { Request } from 'express';
import { AppError } from '../../errors/AppError.js';
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { buildMeta, sendResponse } from '../../utils/sendResponse.js';
import { getMyNotificationsDB, markAllNotificationsReadDB, markNotificationReadDB } from './notifications.service.js';
import { getJobBidsDB } from '../bids/bids.service.js';

export const getMyNotifications = catchAsync(async (req: Request, res) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) throw new AppError('UNAUTHENTICATED');

  const query = req.query as unknown as {
    unreadOnly: boolean;
    page: number;
    pageSize: number;
  };

  const { items, total, unreadCount } = await getMyNotificationsDB(user.id, query);

  sendResponse(res, {
    data: { unreadCount, notifications: items },
    meta: buildMeta(query.page, query.pageSize, total),
  });
});


export const markNotificationRead = catchAsync(async (req: Request, res) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) throw new AppError('UNAUTHENTICATED');

  const { id } = req.params as { id: string };
  const result = await markNotificationReadDB(user.id, id);

  sendResponse(res, { data: result });
});


export const markAllNotificationsRead = catchAsync(async (req: Request, res) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) throw new AppError('UNAUTHENTICATED');

  const result = await markAllNotificationsReadDB(user.id);

  sendResponse(res, { data: result });
});



