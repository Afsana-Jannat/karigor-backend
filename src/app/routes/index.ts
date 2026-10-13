import { Router } from 'express';
import { healthRoutes } from '../modules/health/health.route.js';
import { metaRoutes } from '../modules/meta/meta.route.js';
import { authRoutes } from '../modules/auth/auth.route.js';
import { technicianRoutes } from '../modules/technician/technician.route.js';
import { jobsRoutes } from '../modules/jobs/jobs.route.js';
import { bidsRoutes } from '../modules/bids/bids.route.js';

const router = Router();

// Add each module here, one line per module.
const moduleRoutes = [
  { path: '/health', route: healthRoutes },
  { path: '/meta', route: metaRoutes },
  { path: '/auth', route: authRoutes },
  { path: '/technicians', route: technicianRoutes },
  { path: '/jobs', route: jobsRoutes },
  { path: '/bids', route: bidsRoutes },
];

for (const { path, route } of moduleRoutes) {
  router.use(path, route);
}

export default router;