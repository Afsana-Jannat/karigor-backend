import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import * as reportController from "./report.controller.js";

const router = Router();

// Endpoint 38: POST /api/v1/jobs/:id/report
router.post("/:id/report", authenticate, reportController.createReport);

// Endpoint 39: GET /api/v1/reports/mine
router.get("/mine", authenticate, reportController.getMyReports);

export const reportRoutes = router;
