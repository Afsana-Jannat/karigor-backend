import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";

let initialization: Promise<void> | undefined;

async function initializeServices() {
	if (!initialization) {
		initialization = (async () => {
			await prisma.$queryRaw`SELECT 1`;
			if (!redis.isReady) {
				if (!redis.isOpen) await redis.connect();
				else await redis.ping();
			}
		})().catch((error) => {
			initialization = undefined;
			throw error;
		});
	}
	await initialization;
}

export default async function handler(
	req: Parameters<typeof app>[0],
	res: Parameters<typeof app>[1],
) {
	await initializeServices();
	return app(req, res);
}
