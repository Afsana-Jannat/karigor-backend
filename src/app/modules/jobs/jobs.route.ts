import { Router } from "express";
import { validateRequest } from "../../middlewares/validateRequest.js";
import {
  createJobController,
  confirmJobController,
  getJobDetailsController,
  getMyJobsController,
  getOpenJobsController,
} from "./jobs.controller.js";
import {
  createJobSchema,
  jobIdParamsSchema,
  listJobsQuerySchema,
  openJobsQuerySchema,
} from "./jobs.validation.js";
import { authenticate } from "../../middlewares/authenticate.js";

const router = Router();

router.post(
  "/",
  authenticate,
  validateRequest({ body: createJobSchema }),
  createJobController,
);

router.get(
  "/",
  authenticate,
  validateRequest({ query: listJobsQuerySchema }),
  getMyJobsController,
);

router.get(
  "/open",
  authenticate,
  validateRequest({ query: openJobsQuerySchema }),
  getOpenJobsController,
);

router.post(
  "/:id/confirm",
  authenticate,
  validateRequest({ params: jobIdParamsSchema }),
  confirmJobController,
);

router.get(
  "/:id",
  authenticate,
  validateRequest({ params: jobIdParamsSchema }),
  getJobDetailsController,
);

export const jobsRoutes = router;
