import { AppError } from "../../errors/AppError.js";
import type { AuthenticatedRequest } from "../../middlewares/authenticate.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { reindexAllTechnicians } from "./chat.indexer.js";
import type { ISendChatMessagePayload } from "./chat.interface.js";
import { sendChatMessage } from "./chat.service.js";

export const sendMessage = catchAsync(
	async (req: AuthenticatedRequest, res) => {
		if (!req.user) throw new AppError("UNAUTHENTICATED");
		const result = await sendChatMessage(
			req.body as ISendChatMessagePayload,
			req.user.id,
		);
		sendResponse(res, { data: result });
	},
);

export const reindexTechnicians = catchAsync(async (_req, res) => {
	const indexedCount = await reindexAllTechnicians();
	sendResponse(res, { data: { indexedCount } });
});
