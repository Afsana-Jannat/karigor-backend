
import { createHash } from 'node:crypto';

import { prisma } from '../../../lib/prisma.js';
import { AREAS, SKILLS } from '../../../constants';
import { AppError } from '../../errors/AppError.js';
import { issueContractOtp, verifyContractOtp } from './contracts.otp.js';
import { redis } from '../../../lib/redis.js';
import { hashContract } from './contracts.hash.js';



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

const contentHash = hashContract(content);

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


export const getJobContract = async (
  jobId: string,
  userId: string,
  userRole: "CUSTOMER" | "TECHNICIAN" | "ADMIN",
) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      customerId: true,
      technicianId: true,
      contract: {
        select: {
          id: true,
          content: true,
          contentHash: true,
          status: true,
          customerSignedAt: true,
          technicianSignedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!job) {
    throw new AppError("NOT_FOUND", "Job not found");
  }

  const isParty =
    job.customerId === userId ||
    job.technicianId === userId;

  if (userRole !== "ADMIN" && !isParty) {
    throw new AppError("NOT_FOUND", "Contract not found");
  }

  if (!job.contract) {
    throw new AppError("NOT_FOUND", "Contract not found");
  }

  return job.contract;
};


export const requestContractSignOtp = async (
  contractId: string,
  userId: string,
) => {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      status: true,
      customerSignedAt: true,
      technicianSignedAt: true,
      job: {
        select: {
          customerId: true,
          technicianId: true,
          customer: {
            select: { phone: true },
          },
          technician: {
            select: { phone: true },
          },
        },
      },
    },
  });

  if (!contract) {
    throw new AppError('NOT_FOUND', 'Contract not found');
  }

  const { job } = contract;

  const isCustomer = job.customerId === userId;
  const isTechnician = job.technicianId === userId;

  if (!isCustomer && !isTechnician) {
    throw new AppError('NOT_FOUND', 'Contract not found');
  }

  if (contract.status !== 'PENDING') {
    throw new AppError('INVALID_STATUS', 'Contract is not pending');
  }

  if (
    (isCustomer && contract.customerSignedAt) ||
    (isTechnician && contract.technicianSignedAt)
  ) {
    throw new AppError('CONFLICT', 'You have already signed this contract');
  }

  const phone = isCustomer
    ? job.customer.phone
    : job.technician?.phone;

  if (!phone) {
    throw new AppError('NOT_FOUND', 'Phone number not found');
  }

  return issueContractOtp({
    contractId,
    phone,
  });
};



export async function signContract(
  contractId: string,
  userId: string,
  otp: string,
) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      status: true,
      customerSignedAt: true,
      technicianSignedAt: true,
      job: {
        select: {
          customerId: true,
          technicianId: true,
          customer: { select: { phone: true } },
          technician: { select: { phone: true } },
        },
      },
    },
  });

  if (!contract) {
    throw new AppError('NOT_FOUND', 'Contract not found');
  }

  const { job } = contract;
  const isCustomer = job.customerId === userId;
  const isTechnician = job.technicianId === userId;

  if (!isCustomer && !isTechnician) {
    throw new AppError('NOT_FOUND', 'Contract not found');
  }

  if (contract.status !== 'PENDING') {
    throw new AppError('INVALID_STATUS', 'Contract is not pending');
  }

  if (
    (isCustomer && contract.customerSignedAt) ||
    (isTechnician && contract.technicianSignedAt)
  ) {
    throw new AppError(
      'CONFLICT',
      'You have already signed this contract',
    );
  }

  const phone = isCustomer
    ? job.customer.phone
    : job.technician?.phone;

  if (!phone) {
    throw new AppError('NOT_FOUND', 'Phone number not found');
  }

  const otpKey = `otp:CONTRACT:${contractId}:${phone}`;

  await verifyContractOtp(contractId, phone, otp);

  const result = await prisma.$transaction(async (tx) => {
    // Lock the contract row to prevent concurrent signature updates.
    await tx.$queryRaw`
      SELECT "id"
      FROM "Contract"
      WHERE "id" = ${contractId}
      FOR UPDATE
    `;

    const current = await tx.contract.findUnique({
      where: { id: contractId },
      select: {
        status: true,
        customerSignedAt: true,
        technicianSignedAt: true,
        job: {
          select: {
            id: true,
            customerId: true,
            technicianId: true,
            status: true,
          },
        },
      },
    });

    if (!current || current.status !== 'PENDING') {
      throw new AppError(
        'INVALID_STATUS',
        'Contract is no longer pending',
      );
    }

    if (
      current.job.customerId !== userId &&
      current.job.technicianId !== userId
    ) {
      throw new AppError('FORBIDDEN', 'You cannot sign this contract');
    }

    if (
      (isCustomer && current.customerSignedAt) ||
      (isTechnician && current.technicianSignedAt)
    ) {
      throw new AppError(
        'CONFLICT',
        'You have already signed this contract',
      );
    }

    if (current.job.status !== 'CONTRACT_PENDING') {
      throw new AppError(
        'INVALID_STATUS',
        'Job is not awaiting contract signatures',
      );
    }

    const signedAt = new Date();

    if (isCustomer) {
      await tx.contract.update({
        where: { id: contractId },
        data: { customerSignedAt: signedAt },
      });
    } else {
      await tx.contract.update({
        where: { id: contractId },
        data: { technicianSignedAt: signedAt },
      });
    }

    const bothSigned = Boolean(
      (isCustomer ? signedAt : current.customerSignedAt) &&
      (isTechnician ? signedAt : current.technicianSignedAt),
    );

    if (bothSigned) {
      await tx.contract.update({
        where: { id: contractId },
        data: { status: 'SIGNED' },
      });

      const jobUpdate = await tx.job.updateMany({
        where: {
          id: current.job.id,
          status: 'CONTRACT_PENDING',
        },
        data: { status: 'IN_PROGRESS' },
      });

      if (jobUpdate.count !== 1) {
        throw new AppError(
          'CONFLICT',
          'Job status changed. Please try again',
        );
      }

      await tx.notification.createMany({
        data: [
          {
            userId: current.job.customerId,
            jobId: current.job.id,
            type: 'CONTRACT_SIGNED',
          },
          ...(current.job.technicianId
            ? [{
                userId: current.job.technicianId,
                jobId: current.job.id,
                type: 'CONTRACT_SIGNED' as const,
              }]
            : []),
        ],
      });
    }

    return {
      contractId,
      signed: true,
      contractStatus: bothSigned ? 'SIGNED' : 'PENDING',
      jobStatus: bothSigned ? 'IN_PROGRESS' : 'CONTRACT_PENDING',
      bothPartiesSigned: bothSigned,
    };
  });

  // Consume the OTP after the database transaction succeeds.
  await redis.del(otpKey);

  return result;
}



export async function verifyContract(
  contractId: string,
  userId: string,
  userRole: 'CUSTOMER' | 'TECHNICIAN' | 'ADMIN',
) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      content: true,
      contentHash: true,
      job: {
        select: {
          customerId: true,
          technicianId: true,
        },
      },
    },
  });

  if (!contract) {
    throw new AppError('NOT_FOUND', 'Contract not found');
  }

  const isParty =
    contract.job.customerId === userId ||
    contract.job.technicianId === userId;

  if (userRole !== 'ADMIN' && !isParty) {
    throw new AppError('NOT_FOUND', 'Contract not found');
  }

  const hash = hashContract(contract.content);

  return {
    valid: hash === contract.contentHash,
    hash,
  };
}
