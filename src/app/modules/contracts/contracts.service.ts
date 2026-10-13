
import { createHash } from 'node:crypto';

import { prisma } from '../../../lib/prisma.js';
import { AREAS, SKILLS } from '../../../constants';
import { AppError } from '../../errors/AppError.js';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(record[key])}`,
    )
    .join(',')}}`;
}

function getBanglaName(
  options: readonly {
    slug: string;
    nameBn?: string;
    bn?: string;
  }[],
  slug: string,
): string {
  const option = options.find((item) => item.slug === slug);
  const name = option?.nameBn ?? option?.bn;

  if (!name) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Missing Bangla label for configured slug: ${slug}`,
    );
  }

  return name;
}

export async function selectBidAndCreateContract(
  customerId: string,
  jobId: string,
  bidId: string,
) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // The customer must own an open, unexpired job.
    const job = await tx.job.findFirst({
      where: {
        id: jobId,
        customerId,
        status: 'OPEN',
        expiresAt: { gt: now },
        technicianId: null,
        agreedPrice: null,
      },
      select: {
        id: true,
        customerId: true,
        skill: true,
        area: true,
        description: true,
        preferredDate: true,
      },
    });

    if (!job) {
      throw new AppError(
        'INVALID_STATUS',
        'This job is unavailable for bid selection',
      );
    }

    const bid = await tx.bid.findFirst({
      where: {
        id: bidId,
        jobId,
        status: 'ACTIVE',
        technician: {
          status: 'ACTIVE',
          role: 'TECHNICIAN',
        },
      },
      select: {
        id: true,
        technicianId: true,
        price: true,
      },
    });

    if (!bid) {
      throw new AppError(
        'NOT_FOUND',
        'Active bid or technician not found',
      );
    }

    const [customer, technician] = await Promise.all([
      tx.user.findUnique({
        where: { id: customerId },
        select: { name: true },
      }),
      tx.user.findUnique({
        where: { id: bid.technicianId },
        select: { name: true },
      }),
    ]);

    if (!customer || !technician) {
      throw new AppError('NOT_FOUND', 'User not found');
    }

    const skillNameBn = getBanglaName(SKILLS, job.skill);
    const areaNameBn = getBanglaName(AREAS, job.area);

    // Only one concurrent request can successfully lock this job.
    const transition = await tx.job.updateMany({
      where: {
        id: job.id,
        customerId,
        status: 'OPEN',
        expiresAt: { gt: now },
        technicianId: null,
        agreedPrice: null,
      },
      data: {
        status: 'CONTRACT_PENDING',
        technicianId: bid.technicianId,
        agreedPrice: bid.price,
      },
    });

    if (transition.count !== 1) {
      throw new AppError(
        'INVALID_STATUS',
        'Another request has already selected a bid',
      );
    }

    // Recheck that the selected bid is still active.
    const selected = await tx.bid.updateMany({
      where: {
        id: bid.id,
        jobId,
        status: 'ACTIVE',
      },
      data: { status: 'SELECTED' },
    });

    if (selected.count !== 1) {
      throw new AppError(
        'INVALID_STATUS',
        'This bid is no longer active',
      );
    }

    const otherActiveBids = await tx.bid.findMany({
      where: {
        jobId,
        status: 'ACTIVE',
        id: { not: bid.id },
      },
      select: { technicianId: true },
    });

    await tx.bid.updateMany({
      where: {
        jobId,
        status: 'ACTIVE',
        id: { not: bid.id },
      },
      data: { status: 'REJECTED' },
    });

    // Store a frozen snapshot. Never include phone numbers.
    const content = {
      jobId: job.id,
      customerName: customer.name,
      technicianName: technician.name,
      skill: skillNameBn,
      area: areaNameBn,
      description: job.description,
      preferredDate: job.preferredDate.toISOString(),
      agreedPrice: bid.price,
    //   terms: [...CONTRACT_TERMS_BN],
      createdAt: now.toISOString(),
    };

    const contentHash = createHash('sha256')
      .update(stableStringify(content), 'utf8')
      .digest('hex');

    const contract = await tx.contract.create({
      data: {
        jobId: job.id,
        content,
        contentHash,
        status: 'PENDING',
      },
      select: {
        id: true,
        status: true,
        contentHash: true,
        createdAt: true,
      },
    });

    const notifications = [
      {
        userId: bid.technicianId,
        type: 'BID_SELECTED' as const,
        jobId,
      },
      ...otherActiveBids.map((otherBid) => ({
        userId: otherBid.technicianId,
        type: 'BID_REJECTED' as const,
        jobId,
      })),
    ];

    if (notifications.length > 0) {
      await tx.notification.createMany({
        data: notifications,
      });
    }

    return {
      job: {
        id: job.id,
        status: 'CONTRACT_PENDING' as const,
        technicianId: bid.technicianId,
        agreedPrice: bid.price,
      },
      contract,
    };
  });
}
