
import { Prisma } from '../../../generated/prisma/client.js';
import { prisma } from '../../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import type { CreateJobInput, ListJobsQuery } from './jobs.validation.js';

const MAX_OPEN_JOBS = 10;
const MAX_NOTIFICATIONS = 30;
const EMERGENCY_EXPIRY_HOURS = 6;
const NORMAL_EXPIRY_HOURS = 48;

function calculateExpiryDate(
  preferredDate: Date,
  isEmergency: boolean,
  now: Date,
): Date {
  if (isEmergency) {
    return new Date(now.getTime() + EMERGENCY_EXPIRY_HOURS * 60 * 60 * 1000);
  }

  const fortyEightHoursLater = new Date(
    now.getTime() + NORMAL_EXPIRY_HOURS * 60 * 60 * 1000,
  );

  const preferredDateEnd = new Date(preferredDate);
  preferredDateEnd.setHours(23, 59, 59, 999);

  return fortyEightHoursLater < preferredDateEnd
    ? fortyEightHoursLater
    : preferredDateEnd;
}

export async function createJob(customerId: string, input: CreateJobInput) {
  const now = new Date();
  console.log(customerId)
  const expiresAt = calculateExpiryDate(
    input.preferredDate,
    input.isEmergency,
    now,
  );

  try {
    return await prisma.$transaction(
      async (tx) => {
        const customer = await tx.user.findUnique({
          where: { id: customerId },
          select: { id: true, role: true, status: true },
        });

        if (
          !customer ||
          customer.role !== 'CUSTOMER' ||
          customer.status !== 'ACTIVE'
        ) {
          throw new AppError('FORBIDDEN', 'Only active customers can post jobs');
        }

        const openJobCount = await tx.job.count({
          where: {
            customerId,
            status: { in: ['OPEN', 'CONTRACT_PENDING'] },
          },
        });

        if (openJobCount >= MAX_OPEN_JOBS) {
          throw new AppError(
            'CONFLICT',
            'You can have at most 10 open jobs at a time',
          );
        }

        const job = await tx.job.create({
          data: {
            customerId,
            skill: input.skill,
            area: input.area,
            description: input.description,
            preferredDate: input.preferredDate,
            isEmergency: input.isEmergency,
            expiresAt,
            status: 'OPEN',
          },
        });

        const technicians = await tx.user.findMany({
          where: {
            role: 'TECHNICIAN',
            status: 'ACTIVE',
            technicianProfile: {
              is: {
                skills: { has: input.skill },
                areas: { has: input.area },
                ...(input.isEmergency ? { isAvailableNow: true } : {}),
              },
            },
          },
          select: {
            id: true,
            technicianProfile: {
              select: {
                verifyStatus: true,
                ratingAvg: true,
                completedJobs: true,
              },
            },
          },
        });

        technicians.sort((a, b) => {
          const aProfile = a.technicianProfile;
          const bProfile = b.technicianProfile;

          const aVerified = aProfile?.verifyStatus === 'VERIFIED' ? 1 : 0;
          const bVerified = bProfile?.verifyStatus === 'VERIFIED' ? 1 : 0;

          return (
            bVerified - aVerified ||
            (bProfile?.ratingAvg ?? 0) - (aProfile?.ratingAvg ?? 0) ||
            (bProfile?.completedJobs ?? 0) - (aProfile?.completedJobs ?? 0)
          );
        });

        const selectedTechnicians = technicians.slice(0, MAX_NOTIFICATIONS);

        if (selectedTechnicians.length > 0) {
          await tx.notification.createMany({
            data: selectedTechnicians.map((technician) => ({
              userId: technician.id,
              type: 'JOB_POSTED',
              jobId: job.id,
            })),
          });
        }

        return {
          job,
          notifiedCount: selectedTechnicians.length,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
        maxWait: 5000,
    },
    );
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw error;
  }
}

export async function getMyJobs(
  userId: string,
  role: 'CUSTOMER' | 'TECHNICIAN',
  query: ListJobsQuery,
) {
  const now = new Date();
  const contractExpiry = new Date(
    now.getTime() - NORMAL_EXPIRY_HOURS * 60 * 60 * 1000,
  );

  await prisma.$transaction(async (tx) => {
    const expiredPendingJobs = await tx.job.findMany({
      where: {
        status: 'CONTRACT_PENDING',
        updatedAt: { lte: contractExpiry },
      },
      select: { id: true },
    });

    await tx.job.updateMany({
      where: {
        status: 'OPEN',
        expiresAt: { lte: now },
      },
      data: {
        status: 'CANCELLED',
        cancelReason: 'EXPIRED',
      },
    });

    if (expiredPendingJobs.length > 0) {
      const expiredIds = expiredPendingJobs.map((job) => job.id);

      await tx.job.updateMany({
        where: {
          id: { in: expiredIds },
          status: 'CONTRACT_PENDING',
          updatedAt: { lte: contractExpiry },
        },
        data: {
          status: 'CANCELLED',
          cancelReason: 'EXPIRED',
        },
      });

      await tx.contract.updateMany({
        where: {
          jobId: { in: expiredIds },
          status: 'PENDING',
        },
        data: { status: 'VOID' },
      });
    }
  });

  const where: Prisma.JobWhereInput = {
    ...(role === 'CUSTOMER'
      ? { customerId: userId }
      : { technicianId: userId }),
    ...(query.status ? { status: query.status } : {}),
  };

  const [jobs, total] = await prisma.$transaction([
    prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        skill: true,
        area: true,
        status: true,
        preferredDate: true,
        agreedPrice: true,
        createdAt: true,
        customer: {
          select: { id: true, name: true },
        },
        technician: {
          select: { id: true, name: true },
        },
        _count: { select: { bids: true } },
      },
    }),
    prisma.job.count({ where }),
  ]);

  const data = jobs.map((job) => ({
    id: job.id,
    skill: job.skill,
    area: job.area,
    status: job.status,
    preferredDate: job.preferredDate,
    agreedPrice: job.agreedPrice,
    createdAt: job.createdAt,
    bidCount: job.status === 'OPEN' ? job._count.bids : undefined,
    counterpart:
      role === 'CUSTOMER'
        ? job.technician
        : job.customer,
  }));

  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}
