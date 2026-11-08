import cron, { type ScheduledTask } from "node-cron";
import { reindexAllTechnicians } from "../app/modules/chat/chat.indexer.js";

const REINDEX_SCHEDULE = "0 0 * * *";
const TIME_ZONE = "Asia/Dhaka";

export const startDailyTechnicianReindex = (): ScheduledTask => {
	const task = cron.schedule(
		REINDEX_SCHEDULE,
		async () => {
			console.log("[Cron] Starting daily technician reindex.");
			try {
				const count = await reindexAllTechnicians();
				console.log(`[Cron] Reindexed ${count} active verified technicians.`);
			} catch (error) {
				console.error("[Cron] Daily technician reindex failed:", error);
			}
		},
		{ timezone: TIME_ZONE },
	);

	console.log(
		`[Cron] Technician reindex scheduled daily at 12:00 AM (${TIME_ZONE}).`,
	);
	return task;
};
