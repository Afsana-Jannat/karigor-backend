import { Router } from "express";
import { authRoutes } from "../modules/auth/auth.route.js";
import { healthRoutes } from "../modules/health/health.route.js";
import { reviewRoutes } from "../modules/review/review.route.js";

const router = Router();

// Add each module here, one line per module, for example:
// { path: '/technicians', route: technicianRoutes },
const moduleRoutes = [
  { path: "/health", route: healthRoutes },
  { path: "/auth", route: authRoutes },
  { path: "/review", route: reviewRoutes },
];

for (const { path, route } of moduleRoutes) {
  router.use(path, route);
}

export default router;
