import { Router } from "express";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { createReviewValidation } from "./review.validation.js";
import * as reviewController from "./review.controller.js";
import { authenticate } from "../../middlewares/authenticate.js";

const router = Router();

router.post(
  "/:id/review",
  authenticate,
  validateRequest({
    body: createReviewValidation.shape.body,
    params: createReviewValidation.shape.params,
  }),
  reviewController.createReview,
);

export const reviewRoutes = router;
