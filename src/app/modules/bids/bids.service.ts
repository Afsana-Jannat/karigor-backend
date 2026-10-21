
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


type BidSort = 'price' | 'rating' | 'experience';

export const getJobBidsDB = async (customerId: string, jobId: string, sort: BidSort) => {
  // Only the customer who owns the job. Anyone else gets NOT_FOUND.
  const job = await prisma.job.findFirst({
    where: { id: jobId, customerId },
    select: { id: true, status: true, expiresAt: true },
  });

  if (!job) {
    throw new AppError('NOT_FOUND', 'Job not found');
  }

  const rows = await prisma.bid.findMany({
    where: {
      jobId,
      status: { in: ['ACTIVE', 'SELECTED'] },
      technician: { is: { status: 'ACTIVE' } },
    },
    select: {
      id: true,
      price: true,
      note: true,
      status: true,
      createdAt: true,
      technician: {
        select: {
          id: true,
          name: true,
          technicianProfile: {
            select: {
              photoUrl: true,
              verifyStatus: true,
              isAvailableNow: true,
              experienceYears: true,
              ratingAvg: true,
              ratingCount: true,
              completedJobs: true,
            },
          },
        },
      },
    },
  });

  const bids = rows.map((b) => {
    const p = b.technician.technicianProfile;
    return {
      bidId: b.id,
      price: b.price,
      note: b.note,
      status: b.status,
      createdAt: b.createdAt,
      technician: {
        id: b.technician.id,
        name: b.technician.name,
        photoUrl: p?.photoUrl ?? null,
        verified: p?.verifyStatus === 'VERIFIED',
        isAvailableNow: p?.isAvailableNow ?? false,
        experienceYears: p?.experienceYears ?? 0,
        ratingAvg: p?.ratingAvg ?? 0,
        ratingCount: p?.ratingCount ?? 0,
        completedJobs: p?.completedJobs ?? 0,
      },
    };
  });

  bids.sort((a, b) => {
    if (sort === 'rating') {
      return (
        b.technician.ratingAvg - a.technician.ratingAvg ||
        b.technician.ratingCount - a.technician.ratingCount ||
        a.price - b.price
      );
    }
    if (sort === 'experience') {
      return b.technician.experienceYears - a.technician.experienceYears || a.price - b.price;
    }
    return a.price - b.price || b.technician.ratingAvg - a.technician.ratingAvg;
  });

  return {
    job: { id: job.id, status: job.status, expiresAt: job.expiresAt, bidCount: bids.length },
    bids,
  };
};

export const withdrawBidDB = async (technicianId: string, jobId: string) => {
  const bid = await prisma.bid.findUnique({
    where: { jobId_technicianId: { jobId, technicianId } },
    select: { id: true },
  });

  if (!bid) {
    throw new AppError('NOT_FOUND', 'Bid not found');
  }

  // Conditional update: only an ACTIVE bid can be withdrawn.
  const result = await prisma.bid.updateMany({
    where: { id: bid.id, status: 'ACTIVE' },
    data: { status: 'WITHDRAWN' },
  });

  if (result.count === 0) {
    throw new AppError('INVALID_STATUS', 'This bid can no longer be withdrawn');
  }

  return { jobId, status: 'WITHDRAWN' as const };
};

export const getMyBidsDB = async (
  technicianId: string,
  query: {
    status?: 'ACTIVE' | 'SELECTED' | 'REJECTED' | 'WITHDRAWN';
    page: number;
    pageSize: number;
  },
) => {
  const { status, page, pageSize } = query;
  const where = { technicianId, ...(status ? { status } : {}) };

  const [rows, total] = await Promise.all([
    prisma.bid.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        price: true,
        note: true,
        status: true,
        updatedAt: true,
        job: {
          select: {
            id: true,
            skill: true,
            area: true,
            status: true,
            preferredDate: true,
            expiresAt: true,
          },
        },
      },
    }),
    prisma.bid.count({ where }),
  ]);

  return {
    items: rows.map((b) => ({
      bidId: b.id,
      price: b.price,
      note: b.note,
      status: b.status,
      updatedAt: b.updatedAt,
      job: b.job,
    })),
    total,
  };
};