import { Router } from 'express';
import { healthRoutes } from '../modules/health/health.route.js';
import { metaRoutes } from '../modules/meta/meta.route.js';
const router = Router();

// Add each module here, one line per module, for example:
// { path: '/technicians', route: technicianRoutes },
const moduleRoutes = [
  { path: '/health', route: healthRoutes },
  { path: '/meta', route: metaRoutes },
];

for (const { path, route } of moduleRoutes) {
  router.use(path, route);
}

export default router;