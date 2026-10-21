

import { Prisma } from "../../../generated/prisma/client.js";
import { executeBkashPayment, queryBkashPayment } from "../../../lib/bkash.js";
import { prisma } from "../../../lib/prisma.js";


type CallbackStatus = "success" | "failure" | "cancel";

const clientUrl = () => {
  const url = process.env.CLIENT_URL;
  if (!url) throw new Error("CLIENT_URL is not configured");
  return url.replace(/\/$/, "");
};

function resultUrl(status: string, jobId?: string) {
  const params = new URLSearchParams({ status });
  if (jobId) params.set("jobId", jobId);
  return `${clientUrl()}/payment/result?${params.toString()}`;
}

export async function handleBkashCallback(
  paymentID: string | undefined,
  status: string | undefined,
  ref: string | undefined,
): Promise<string> {
  if (!paymentID || !ref) {
    return resultUrl("failure");
  }

  const payment = await prisma.payment.findUnique({
    where: { id: ref },
    select: {
      id: true,
      jobId: true,
      amount: true,
      status: true,
      bkashPaymentId: true,
    },
  });

  if (!payment) return resultUrl("failure");

  const failureUrl = resultUrl("failure", payment.jobId);
  const successUrl = resultUrl("success", payment.jobId);

  if (payment.bkashPaymentId !== paymentID) {
    return failureUrl;
  }

  // A repeated callback must not process a successful payment twice.
  if (payment.status === "SUCCESS") {
    return successUrl;
  }

  if (payment.status !== "INITIATED") {
    return failureUrl;
  }

  const callbackStatus = status?.toLowerCase() as
    | CallbackStatus
    | undefined;

  if (callbackStatus === "cancel" || callbackStatus === "failure") {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "INITIATED" },
      data: {
        status: callbackStatus === "cancel" ? "CANCELLED" : "FAILED",
        failureReason: `bKash callback: ${callbackStatus}`,
      },
    });

    return resultUrl(
      callbackStatus === "cancel" ? "cancel" : "failure",
      payment.jobId,
    );
  }

  if (callbackStatus !== "success") {
    return failureUrl;
  }

  try {
    // Execute the payment, then query bKash independently for verification.
    await executeBkashPayment(paymentID);
    const verified = await queryBkashPayment(paymentID);

    const verifiedPaymentID = verified.paymentID ?? verified.paymentId;
    const trxId = verified.trxID ?? verified.trxId;
    const verifiedAmount = Number(verified.amount);

    if (
      verifiedPaymentID !== paymentID ||
      verified.transactionStatus?.toLowerCase() !== "completed" ||
      !trxId ||
      !Number.isFinite(verifiedAmount) ||
      verifiedAmount !== payment.amount ||
      verified.merchantInvoiceNumber !== payment.id ||
      (verified.currency && verified.currency !== "BDT")
    ) {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: "INITIATED" },
        data: {
          status: "FAILED",
          failureReason: "bKash payment verification failed",
        },
      });

      return failureUrl;
    }

    await prisma.$transaction(
      async (tx) => {
        // Claim this payment only if it is still awaiting completion.
        const updatedPayment = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: "INITIATED",
            bkashPaymentId: paymentID,
          },
          data: {
            status: "SUCCESS",
            trxId,
            completedAt: new Date(),
          },
        });

        if (updatedPayment.count !== 1) {
          const latest = await tx.payment.findUnique({
            where: { id: payment.id },
            select: { status: true },
          });

          if (latest?.status === "SUCCESS") return;

          throw new Error("Payment is no longer pending");
        }

        // Only one payment method can settle the job.
        const updatedJob = await tx.job.updateMany({
          where: {
            id: payment.jobId,
            status: "AWAITING_CONFIRMATION",
            paidAt: null,
          },
          data: {
            paymentMethod: "BKASH",
            paidAt: new Date(),
          },
        });

        if (updatedJob.count !== 1) {
          throw new Error("Job was already paid or is no longer payable");
        }

        const job = await tx.job.findUnique({
          where: { id: payment.jobId },
          select: { technicianId: true },
        });

        if (job?.technicianId) {
          await tx.notification.create({
            data: {
              userId: job.technicianId,
              type: "PAYMENT_RECEIVED",
              jobId: payment.jobId,
            },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return successUrl;
  } catch {
    // Do not overwrite SUCCESS if another callback completed it.
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "INITIATED" },
      data: {
        status: "FAILED",
        failureReason: "Could not verify or finalize bKash payment",
      },
    });

    return failureUrl;
  }
}
