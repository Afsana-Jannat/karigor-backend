import type { Prisma } from "../../../generated/prisma/client.js";

const retryableFailureReasons = new Set([
	"bKash payment initiation failed",
	"bKash payment verified not completed",
]);

export async function lockJobForPayment(
	tx: Prisma.TransactionClient,
	jobId: string,
) {
	await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Job" WHERE "id" = ${jobId} FOR UPDATE
  `;
}

export function isBkashPaymentUnresolved(payment: {
	status: string;
	failureReason?: string | null;
}) {
	return (
		payment.status === "INITIATED" ||
		payment.status === "SUCCESS" ||
		(payment.status === "FAILED" &&
			!retryableFailureReasons.has(payment.failureReason ?? ""))
	);
}
