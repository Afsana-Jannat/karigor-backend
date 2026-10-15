import { Router } from 'express';
import { healthRoutes } from '../modules/health/health.route.js';
import { jobsRoutes } from '../modules/jobs/jobs.route.js';
import { bidsRoutes } from '../modules/bids/bids.route.js';
import { authRoutes } from "../modules/auth/auth.route.js";
import { contractsRoutes } from '../modules/contracts/contracts.route.js';
import { paymentsRoutes } from '../modules/payment/payment.route.js';


const router = Router();

// Add each module here, one line per module, for example:
// { path: '/technicians', route: technicianRoutes },
const moduleRoutes = [
  { path: '/health', route: healthRoutes },
  { path: '/jobs', route: jobsRoutes },
  {path: "/bids", route: bidsRoutes},
	{ path: "/health", route: healthRoutes },
	{ path: "/auth", route: authRoutes },
  { path: '/jobs', route: contractsRoutes },
  { path: '/contracts', route: contractsRoutes },
  { path: '/payments', route: paymentsRoutes,},
  { path: "/payments", route: paymentsRoutes }
 

];

for (const { path, route } of moduleRoutes) {
	router.use(path, route);
}

export default router;
