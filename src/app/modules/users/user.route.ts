import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import {
  deleteCurrentUserController,
  updateCurrentUserController,
} from "./user.controller.js";
import { deleteUserSchema, updateUserSchema } from "./user.validation.js";

const router = Router();


router.patch(
  "/me",
  authenticate,
  validateRequest({ body: updateUserSchema.shape.body }),
  updateCurrentUserController
);


router.delete(
  "/me",
  authenticate,
  validateRequest({ body: deleteUserSchema.shape.body }),
  deleteCurrentUserController
);

export const userRoutes = router;