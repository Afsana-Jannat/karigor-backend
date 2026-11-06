import { Prisma } from "../../../generated/prisma/client.js";
import { queryBkashPayment } from "../../../lib/bkash.js";
import { prisma } from "../../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { isBkashPaymentUnresolved, lockJobForPayment } from "./payment.lock.js";
import { hasValidBkashMerchantInvoice } from "./payment.verification.js";

type ReconciliationResult = {
  status: "PAID" | "FAILED" | "PENDING";
  paid: boolean;
};

export async function reconcileBkashPayment(
  jobId: string,
  customerId: string,
): Promise<ReconciliationResult> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      customerId: true,
      status: true,
      paidAt: true,
      payments: {
        where: { method: "BKASH" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          status: true,
          failureReason: true,
          bkashPaymentId: true,
        },
      },
    },
  });

  if (!job || job.customerId !== customerId) {
    throw new AppError("NOT_FOUND", "Job not found");
  }
  if (job.paidAt) return { status: "PAID", paid: true };

  const attempt = job.payments.find(isBkashPaymentUnresolved);
  if (!attempt) return { status: "FAILED", paid: false };
  if (
    job.status !== "AWAITING_CONFIRMATION" ||
    !attempt.bkashPaymentId
  ) {
    return { status: "PENDING", paid: false };
  }

  let verified: Awaited<ReturnType<typeof queryBkashPayment>>;
  try {
    verified = await queryBkashPayment(attempt.bkashPaymentId);
  } catch (error) {
    console.error("Could not reconcile bKash payment status", {
      jobId,
      paymentId: attempt.id,
      error,
    });
    return { status: "PENDING", paid: false };
  }

  const verifiedPaymentId = verified.paymentID ?? verified.paymentId;
  const transactionStatus = verified.transactionStatus?.toLowerCase();
  if (
    verifiedPaymentId === attempt.bkashPaymentId &&
    ["failed", "cancelled", "canceled"].includes(transactionStatus ?? "")
  ) {
    await prisma.payment.updateMany({
      where: {
        id: attempt.id,
        status: { in: ["INITIATED", "FAILED"] },
      },
      data: {
        status: transactionStatus === "failed" ? "FAILED" : "CANCELLED",
        failureReason: "bKash payment verified not completed",
      },
    });
    return { status: "FAILED", paid: false };
  }

  const trxId = verified.trxID ?? verified.trxId;
  const verifiedAmount = Number(verified.amount);
  if (
    verifiedPaymentId !== attempt.bkashPaymentId ||
    transactionStatus !== "completed" ||
    !trxId ||
    !Number.isFinite(verifiedAmount) ||
    verifiedAmount !== attempt.amount ||
    !hasValidBkashMerchantInvoice(
      verified.merchantInvoiceNumber,
      attempt.id,
    ) ||
    (verified.currency && verified.currency !== "BDT")
  ) {
    await prisma.payment.updateMany({
      where: { id: attempt.id, status: "INITIATED" },
      data: { failureReason: "bKash verification requires reconciliation" },
    });
    return { status: "PENDING", paid: false };
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        await lockJobForPayment(tx, jobId);

        const current = await tx.payment.findUnique({
          where: { id: attempt.id },
          select: {
            status: true,
            failureReason: true,
            bkashPaymentId: true,
          },
        });
        if (current?.status === "SUCCESS") return;
        if (
          !current ||
          !isBkashPaymentUnresolved(current) ||
          current.bkashPaymentId !== attempt.bkashPaymentId
        ) {
          throw new Error("Payment is no longer pending reconciliation");
        }

        const updatedPayment = await tx.payment.updateMany({
          where: {
            id: attempt.id,
            status: current.status,
            bkashPaymentId: attempt.bkashPaymentId,
          },
          data: { status: "SUCCESS", trxId, completedAt: new Date() },
        });
        if (updatedPayment.count !== 1) {
          throw new Error("Payment could not be claimed for reconciliation");
        }

        const updatedJob = await tx.job.updateMany({
          where: {
            id: jobId,
            status: "AWAITING_CONFIRMATION",
            paidAt: null,
          },
          data: { paymentMethod: "BKASH", paidAt: new Date() },
        });
        if (updatedJob.count !== 1) {
          throw new Error("Job was already paid or is no longer payable");
        }

        const currentJob = await tx.job.findUnique({
          where: { id: jobId },
          select: { technicianId: true },
        });
        if (currentJob?.technicianId) {
          await tx.notification.create({
            data: {
              userId: currentJob.technicianId,
              type: "PAYMENT_RECEIVED",
              jobId,
            },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    console.error("Could not finalize reconciled bKash payment", {
      jobId,
      paymentId: attempt.id,
      error,
    });
    return { status: "PENDING", paid: false };
  }

  return { status: "PAID", paid: true };
}
