import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from './notifications.controller.js';
import { notificationIdParams, notificationsQuery } from './notifications.validation.js';

const router = Router();

router.get('/', authenticate, validateRequest({ query: notificationsQuery }), getMyNotifications);
router.patch(
  '/:id/read',
  authenticate,
  validateRequest({ params: notificationIdParams }),
  markNotificationRead,
);

router.post('/read-all', authenticate, markAllNotificationsRead);
export const notificationsRoutes = router;