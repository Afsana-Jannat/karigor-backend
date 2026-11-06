import { createBkashPayment } from '../../../lib/bkash.js';
import { prisma } from '../../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import {
  isBkashPaymentUnresolved,
  lockJobForPayment,
} from './payment.lock.js';


export async function initiateBkashPayment(
  customerId: string,
  jobId: string,
) {
  const payment = await prisma.$transaction(
    async (tx) => {
      await lockJobForPayment(tx, jobId);

      const job = await tx.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          customerId: true,
          status: true,
          agreedPrice: true,
          paidAt: true,
          customer: {
            select: {
              phone: true,
            },
          },
        },
      });

      if (!job || job.customerId !== customerId) {
        throw new AppError('NOT_FOUND', 'Job not found');
      }

      if (
        job.status !== 'AWAITING_CONFIRMATION' ||
        job.agreedPrice === null ||
        job.paidAt !== null
      ) {
        throw new AppError(
          'INVALID_STATUS',
          'This job is not eligible for payment',
        );
      }

      const previousAttempts = await tx.payment.findMany({
        where: {
          jobId: job.id,
          method: 'BKASH',
        },
        select: { status: true, failureReason: true },
      });

      if (previousAttempts.some(isBkashPaymentUnresolved)) {
        throw new AppError(
          'CONFLICT',
          'A previous bKash payment is pending or needs verification. Confirm its status before trying again.',
        );
      }

      const newPayment = await tx.payment.create({
        data: {
          jobId: job.id,
          payerId: customerId,
          method: 'BKASH',
          amount: job.agreedPrice,
          status: 'INITIATED',
        },
        select: {
          id: true,
          amount: true,
        },
      });

      return {
        ...newPayment,
        phone: job.customer.phone,
      };
    },
    {
      isolationLevel: 'Serializable',
    },
  );

  try {
    const appUrl = process.env.APP_URL;

    if (!appUrl) {
      throw new Error('APP_URL is not configured');
    }

    const callbackURL =
      `${appUrl.replace(/\/$/, '')}/api/v1/payments/bkash/callback` +
      `?ref=${encodeURIComponent(payment.id)}`;

    const bkash = await createBkashPayment({
      paymentId: payment.id,
      amount: payment.amount,
      payerReference: payment.phone,
      callbackURL,
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        bkashPaymentId: bkash.paymentID,
      },
    });

    return {
      paymentId: payment.id,
      amount: payment.amount,
      bkashURL: bkash.bkashURL,
    };
  } catch {
    await prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: 'INITIATED',
      },
      data: {
        status: 'FAILED',
        failureReason: 'bKash payment initiation failed',
      },
    });

    // Replace with PAYMENT_FAILED once your AppError supports that code.
    throw new AppError(
      'INVALID_STATUS',
      'Could not initiate bKash payment. Please try again.',
    );
  }
}

export async function getJobPayments(
  jobId: string,
  userId: string,
  userRole: "CUSTOMER" | "TECHNICIAN" | "ADMIN",
) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      customerId: true,
      technicianId: true,
      status: true,
      agreedPrice: true,
      paymentMethod: true,
      paidAt: true,
      payments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          method: true,
          amount: true,
          status: true,
          trxId: true,
          failureReason: true,
          createdAt: true,
          completedAt: true,
        },
      },
    },
  });

  if (!job) throw new AppError("NOT_FOUND", "Job not found");

  const isAdmin = userRole === "ADMIN";
  const isCustomer = job.customerId === userId;
  const isAssignedTechnician = job.technicianId === userId;
  if (!isAdmin && !isCustomer && !isAssignedTechnician) {
    throw new AppError("NOT_FOUND", "Job not found");
  }

  const successfulPayment = job.payments.find(
    (payment) => payment.status === "SUCCESS",
  );
  const paid = job.paidAt !== null || Boolean(successfulPayment);
  const unresolvedBkash = job.payments.some(
    (payment) =>
      payment.method === "BKASH" && isBkashPaymentUnresolved(payment),
  );
  const payable =
    job.status === "AWAITING_CONFIRMATION" &&
    job.agreedPrice !== null &&
    !paid &&
    !unresolvedBkash;

  return {
    jobId: job.id,
    paid,
    paidAt: job.paidAt ?? successfulPayment?.completedAt ?? null,
    method: job.paymentMethod ?? successfulPayment?.method ?? null,
    amountDue: paid ? 0 : job.agreedPrice,
    paymentAttempts: job.payments,
    availableActions: {
      canPayWithBkash: !isAdmin && isCustomer && payable,
      canRecordCash: !isAdmin && isAssignedTechnician && payable,
    },
  };
}