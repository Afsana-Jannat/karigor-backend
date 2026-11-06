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