
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
console.log(customer)
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

  // ১. ট্রানজেকশন (async tx) বাদ দিয়ে সরাসরি কুয়েরি দিয়ে এক্সপায়ার্ড জব ক্লিন করুন (Non-blocking)
  try {
    const expiredPendingJobs = await prisma.job.findMany({
      where: {
        status: 'CONTRACT_PENDING',
        updatedAt: { lte: contractExpiry },
      },
      select: { id: true },
    });

    await prisma.job.updateMany({
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

      await prisma.job.updateMany({
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

      await prisma.contract.updateMany({
        where: {
          jobId: { in: expiredIds },
          status: 'PENDING',
        },
        data: { status: 'VOID' },
      });
    }
  } catch (cleanupError) {
    // ক্লিনিং প্রসেস ফেইল করলেও যেন ইউজারের জবের লিস্ট লোড হওয়া আটকে না যায়
    console.error('🧹 Background job cleanup failed:', cleanupError);
  }

  // ২. ফিল্টার কন্ডিশন তৈরি
  const where: Prisma.JobWhereInput = {
    ...(role === 'CUSTOMER'
      ? { customerId: userId }
      : { technicianId: userId }),
    ...(query.status ? { status: query.status } : {}),
  };

  // ৩. ট্রানজেকশন স্কিপ করে সাধারণ Promise.all দিয়ে সমান্তরালভাবে ডেটা ও কাউন্ট রিড করুন
  const [jobs, total] = await Promise.all([
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

  // ৪. রেসপন্স ফরম্যাটিং
  const data = jobs.map((job) => ({
    id: job.id,
    skill: job.skill,
    area: job.area,
    status: job.status,
    preferredDate: job.preferredDate,
    agreedPrice: job.agreedPrice,
    createdAt: job.createdAt,
    bidCount: job.status === 'OPEN' ? job._count.bids : undefined,
    counterpart: role === 'CUSTOMER' ? job.technician : job.customer,
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




import type { OpenJobsQuery } from './jobs.validation.js';

export async function getOpenJobs(
  technicianId: string,
  query: OpenJobsQuery,
) {
  const now = new Date();
  const contractExpiry = new Date(
    now.getTime() - 48 * 60 * 60 * 1000,
  );

  // Lazy expiry: expire stale jobs without opening a transaction.
  await prisma.job.updateMany({
    where: {
      status: 'OPEN',
      expiresAt: { lte: now },
    },
    data: {
      status: 'CANCELLED',
      cancelReason: 'EXPIRED',
    },
  });

  const staleContracts = await prisma.job.findMany({
    where: {
      status: 'CONTRACT_PENDING',
      updatedAt: { lte: contractExpiry },
    },
    select: { id: true },
  });

  if (staleContracts.length > 0) {
    const staleJobIds = staleContracts.map((job) => job.id);

    await prisma.job.updateMany({
      where: {
        id: { in: staleJobIds },
        status: 'CONTRACT_PENDING',
        updatedAt: { lte: contractExpiry },
      },
      data: {
        status: 'CANCELLED',
        cancelReason: 'EXPIRED',
      },
    });

    await prisma.contract.updateMany({
      where: {
        jobId: { in: staleJobIds },
        status: 'PENDING',
      },
      data: { status: 'VOID' },
    });
  }

  const profile = await prisma.technicianProfile.findUnique({
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

  const where: Prisma.JobWhereInput = {
    status: 'OPEN',
    expiresAt: { gt: now },
    skill: { in: profile.skills },
    area: { in: profile.areas },
  };

  const [jobs, total] = await prisma.$transaction([
    prisma.job.findMany({
      where,
      orderBy: [
        { isEmergency: 'desc' },
        { createdAt: 'desc' },
      ],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        skill: true,
        area: true,
        description: true,
        preferredDate: true,
        isEmergency: true,
        expiresAt: true,
        createdAt: true,
        customer: {
          select: { name: true },
        },
        _count: {
          select: {
            bids: {
              where: { status: 'ACTIVE' },
            },
          },
        },
        bids: {
          where: { technicianId },
          select: {
            price: true,
            status: true,
          },
          take: 1,
        },
      },
    }),
    prisma.job.count({ where }),
  ]);

  return {
    data: jobs.map((job) => ({
      id: job.id,
      skill: job.skill,
      area: job.area,
      description: job.description,
      preferredDate: job.preferredDate,
      isEmergency: job.isEmergency,
      expiresAt: job.expiresAt,
      bidCount: job._count.bids,
      customerName: job.customer.name.split(' ')[0],
      myBid: job.bids[0] ?? null,
    })),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}
