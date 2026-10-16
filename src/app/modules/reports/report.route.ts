import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import * as reportController from "./report.controller.js";

const router = Router();

// Endpoint 38: POST /api/v1/jobs/:id/report
// (Eta /jobs mount korar karone path automatically /api/v1/jobs/:id/report hoye jabe)
router.post("/:id/report", authenticate, reportController.createReport);

// Endpoint 39: GET /api/v1/reports/mine
// (Eta /reports mount korar karone path automatically /api/v1/reports/mine hoye jabe)
router.get("/mine", authenticate, reportController.getMyReports);

export const reportRoutes = router;
