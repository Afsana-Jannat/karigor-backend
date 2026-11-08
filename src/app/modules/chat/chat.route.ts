import { Router } from "express";
import {
	type AuthenticatedRequest,
	authenticate,
} from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { rateLimit } from "../../middlewares/rateLimit.js";
import { validateRequest } from "../../middlewares/validateRequest.js";
import { reindexTechnicians, sendMessage } from "./chat.controller.js";
import { sendChatMessageSchema } from "./chat.validation.js";

const router = Router();

const chatRateLimit = rateLimit({
	windowMs: 60_000,
	max: 10,
	key: (req) => (req as AuthenticatedRequest).user?.id ?? req.ip ?? "unknown",
});

router.post(
	"/",
	authenticate,
	authorize("CUSTOMER"),
	chatRateLimit,
	validateRequest({ body: sendChatMessageSchema }),
	sendMessage,
);

router.post("/reindex", authenticate, authorize("ADMIN"), reindexTechnicians);

export const chatRoutes = router;
