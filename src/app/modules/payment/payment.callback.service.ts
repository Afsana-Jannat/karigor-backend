

import { Prisma } from "../../../generated/prisma/client.js";
import { executeBkashPayment, queryBkashPayment } from "../../../lib/bkash.js";
import { prisma } from "../../../lib/prisma.js";
import {
  isBkashPaymentUnresolved,
  lockJobForPayment,
} from "./payment.lock.js";


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

async function repairJobForSuccessfulPayment(paymentId: string, jobId: string) {
  await prisma.$transaction(async (tx) => {
    await lockJobForPayment(tx, jobId);

    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { status: true, method: true, completedAt: true },
    });

    if (payment?.status !== "SUCCESS" || payment.method !== "BKASH") return;

    const updatedJob = await tx.job.updateMany({
      where: {
        id: jobId,
        status: "AWAITING_CONFIRMATION",
        paidAt: null,
      },
      data: {
        paymentMethod: "BKASH",
        paidAt: payment.completedAt ?? new Date(),
      },
    });

    if (updatedJob.count !== 1) return;

    const job = await tx.job.findUnique({
      where: { id: jobId },
      select: { technicianId: true },
    });

    if (job?.technicianId) {
      await tx.notification.create({
        data: {
          userId: job.technicianId,
          type: "PAYMENT_RECEIVED",
          jobId,
        },
      });
    }
  });
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
      failureReason: true,
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
    await repairJobForSuccessfulPayment(payment.id, payment.jobId);
    return successUrl;
  }

  if (!isBkashPaymentUnresolved(payment)) {
    return failureUrl;
  }

  const callbackStatus = status?.toLowerCase() as
    | CallbackStatus
    | undefined;

  if (
    callbackStatus !== "success" &&
    callbackStatus !== "failure" &&
    callbackStatus !== "cancel"
  ) {
    return failureUrl;
  }

  try {
    // Execute the payment, then query bKash independently for verification.
    if (callbackStatus === "success") {
      try {
        await executeBkashPayment(paymentID);
      } catch (error) {
        console.warn(
          "bKash execute call did not complete; checking transaction status",
          { paymentId: payment.id, error },
        );
      }
    }

    const verified = await queryBkashPayment(paymentID);

    const verifiedPaymentID = verified.paymentID ?? verified.paymentId;
    const trxId = verified.trxID ?? verified.trxId;
    const verifiedAmount = Number(verified.amount);
    const transactionStatus = verified.transactionStatus?.toLowerCase();
    const transactionFailed = ["failed", "cancelled", "canceled"].includes(
      transactionStatus ?? "",
    );

    if (
      callbackStatus !== "success" &&
      transactionFailed &&
      verifiedPaymentID === paymentID
    ) {
      await prisma.payment.updateMany({
        where: {
          id: payment.id,
          status: { in: ["INITIATED", "FAILED"] },
        },
        data: {
          status: callbackStatus === "cancel" ? "CANCELLED" : "FAILED",
          failureReason: "bKash payment verified not completed",
        },
      });

      return resultUrl(
        callbackStatus === "cancel" ? "cancel" : "failure",
        payment.jobId,
      );
    }

    if (
      verifiedPaymentID !== paymentID ||
      transactionStatus !== "completed" ||
      !trxId ||
      !Number.isFinite(verifiedAmount) ||
      verifiedAmount !== payment.amount ||
      verified.merchantInvoiceNumber !== payment.id ||
      (verified.currency && verified.currency !== "BDT")
    ) {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: "INITIATED" },
        data: {
          failureReason: "bKash payment verification failed",
        },
      });

      return failureUrl;
    }

    await prisma.$transaction(
      async (tx) => {
        await lockJobForPayment(tx, payment.jobId);

        const currentPayment = await tx.payment.findUnique({
          where: { id: payment.id },
          select: { status: true, bkashPaymentId: true, failureReason: true },
        });

        if (currentPayment?.status === "SUCCESS") return;
        if (
          !currentPayment ||
          !isBkashPaymentUnresolved(currentPayment) ||
          currentPayment.bkashPaymentId !== paymentID
        ) {
          throw new Error("Payment is no longer pending");
        }

        // Claim this payment only if it is still awaiting completion.
        const updatedPayment = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: currentPayment.status,
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
  } catch (error) {
    console.error("Could not verify or finalize bKash payment", {
      paymentId: payment.id,
      error,
    });

    await prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: ["INITIATED", "FAILED"] },
      },
      data: {
        failureReason: "bKash verification requires reconciliation",
      },
    });

    return failureUrl;
  }
}
