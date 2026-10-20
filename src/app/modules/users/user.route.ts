import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import {
  deleteCurrentUserController,
  updateCurrentUserController,
} from "./user.controller.js";
import { deleteUserSchema, updateUserSchema } from "./user.validation.js";

const router = Router();

// Update current user's profile (Name only)
router.patch(
  "/me",
  authenticate,
  validateRequest({ body: updateUserSchema.shape.body }),
  updateCurrentUserController
);

// Delete current user's account
router.delete(
  "/me",
  authenticate,
  validateRequest({ body: deleteUserSchema.shape.body }),
  deleteCurrentUserController
);

export const userRoutes = router;