
import { prisma } from '../../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import type { CreateBidInput } from './bids.validation.js';

export async function createOrUpdateBid(
  technicianId: string,
  jobId: string,
  input: CreateBidInput,
) {
  return prisma.$transaction(async (tx) => {
    // Lock this job so bid submissions for it are serialized.
    const lockedJobs = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Job"
      WHERE "id" = ${jobId}
      FOR UPDATE
    `;

    if (lockedJobs.length === 0) {
      throw new AppError('NOT_FOUND', 'Job not found');
    }

    // Check technician profile.
    const profile = await tx.technicianProfile.findUnique({
      where: { userId: technicianId },
      select: {
        skills: true,
        areas: true,
      },
    });

    if (!profile) {
      throw new AppError(
        'CONFLICT',
        'Please create your technician profile first',
      );
    }

    // Load the job after acquiring the lock.
    const job = await tx.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        customerId: true,
        skill: true,
        area: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!job) {
      throw new AppError('NOT_FOUND', 'Job not found');
    }

    if (job.customerId === technicianId) {
      throw new AppError(
        'FORBIDDEN',
        'You cannot bid on your own job',
      );
    }

    if (job.status !== 'OPEN' || job.expiresAt <= new Date()) {
      throw new AppError(
        'INVALID_STATUS',
        'This job is no longer accepting bids',
      );
    }

    if (
      !profile.skills.includes(job.skill) ||
      !profile.areas.includes(job.area)
    ) {
      throw new AppError(
        'FORBIDDEN',
        'Your skills and areas do not match this job',
      );
    }

    // Find an existing bid by this technician.
    const existingBid = await tx.bid.findUnique({
      where: {
        jobId_technicianId: {
          jobId,
          technicianId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (
      existingBid &&
      existingBid.status !== 'ACTIVE' &&
      existingBid.status !== 'WITHDRAWN'
    ) {
      throw new AppError(
        'CONFLICT',
        'You cannot update this bid',
      );
    }

    const isNewActiveBid =
      !existingBid || existingBid.status === 'WITHDRAWN';

    // Only new or reactivated bids consume an additional active slot.
    if (isNewActiveBid) {
      const activeBidCount = await tx.bid.count({
        where: {
          jobId,
          status: 'ACTIVE',
        },
      });

      if (activeBidCount >= 20) {
        throw new AppError(
          'CONFLICT',
          'This job has reached its maximum of 20 active bids',
        );
      }
    }

    // Create a bid or update/reactivate the existing one.
    const bid = await tx.bid.upsert({
      where: {
        jobId_technicianId: {
          jobId,
          technicianId,
        },
      },
      create: {
        jobId,
        technicianId,
        price: input.price,
        note: input.note,
        status: 'ACTIVE',
      },
      update: {
        price: input.price,
        ...(input.note !== undefined
          ? { note: input.note }
          : {}),
        status: 'ACTIVE',
      },
      select: {
        id: true,
        jobId: true,
        technicianId: true,
        price: true,
        note: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Notify the customer only for a new or reactivated bid.
    if (isNewActiveBid) {
      await tx.notification.create({
        data: {
          userId: job.customerId,
          type: 'BID_RECEIVED',
          jobId,
        },
      });
    }

    return bid;
  });
}
