import { Router } from "express";
import { healthRoutes } from "../modules/health/health.route.js";
import { metaRoutes } from "../modules/meta/meta.route.js";
import { authRoutes } from "../modules/auth/auth.route.js";
import { contractsRoutes } from "../modules/contracts/contracts.route.js";
import { paymentsRoutes } from "../modules/payment/payment.route.js";
import { technicianRoutes } from "../modules/technician/technician.route.js";
import { jobsRoutes } from "../modules/jobs/jobs.route.js";
import { bidsRoutes } from "../modules/bids/bids.route.js";
import { reviewRoutes } from "../modules/review/review.route.js";
import { reportRoutes } from "../modules/reports/report.route.js";
import { searchRoutes } from "../modules/search/search.route.js";
import { adminRoutes } from "../modules/admin/admin.route.js";

const router = Router();

// Add each module here, one line per module.
const moduleRoutes = [
  { path: "/health", route: healthRoutes },
  { path: "/meta", route: metaRoutes },
  { path: "/auth", route: authRoutes },
  { path: "/technicians", route: technicianRoutes },
  { path: "/jobs", route: jobsRoutes },
  { path: "/jobs", route: contractsRoutes },
  { path: "/jobs", route: reviewRoutes },
  { path: "/jobs", route: reportRoutes },
  { path: "/bids", route: bidsRoutes },
  { path: "/contracts", route: contractsRoutes },
  { path: "/payments", route: paymentsRoutes },
  { path: "/reports", route: reportRoutes },
  { path: "/search", route: searchRoutes },
  { path: "/admin", route: adminRoutes },
];

for (const { path, route } of moduleRoutes) {
  router.use(path, route);
}

export default router;