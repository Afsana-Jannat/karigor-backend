import { Router } from 'express';
import { healthRoutes } from '../modules/health/health.route.js';
import { metaRoutes } from '../modules/meta/meta.route.js';
import { authRoutes } from "../modules/auth/auth.route.js";
import { technicianRoutes } from '../modules/technician/technician.route.js';


const router = Router();

// Add each module here, one line per module, for example:
// { path: '/technicians', route: technicianRoutes },
const moduleRoutes = [
  { path: '/health', route: healthRoutes },
  { path: '/meta', route: metaRoutes },
	{ path: "/auth", route: authRoutes },
	{ path: '/technicians', route: technicianRoutes },
	
];

for (const { path, route } of moduleRoutes) {
	router.use(path, route);
}

export default router;
