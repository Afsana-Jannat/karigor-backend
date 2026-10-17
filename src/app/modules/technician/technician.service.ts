import { env } from '../../../config/env.js';
import { AREA_SLUGS, AREAS, SKILL_SLUGS, SKILLS } from '../../../constants/index.js';
import {ALLOWED_FORMATS, signUploadParams, uploadPrivateImage, uploadToCloudinary } from '../../../lib/cloudinary.js';
import { prisma } from '../../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';
import { matchSlugs, parseAge, parseExperience, parseRange } from '../../../lib/text.js';
import type { OnboardingKey } from '../../../constants/index.js';
import { askGeminiWithAudio } from '../../../lib/gemini.js';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Simple slug matcher: checks names and aliases for a search term.
// fuse.js is better but not installed yet. This covers the common cases.
function findMatchingSlugs(
  q: string,
  list: typeof SKILLS | typeof AREAS,
): string[] {
  const term = q.toLowerCase().trim();
  const matches: string[] = [];
  for (const item of list) {
    const names = [item.en, item.bn, ...item.aliases].map((s) => s.toLowerCase());
    if (names.some((n) => n.includes(term) || term.includes(n))) {
      matches.push(item.slug);
    }
  }
  return matches;
}

// Relevance score used when sort=relevance.
// ratingAvg*2 + ln(1+completedJobs) + 2 if VERIFIED + 1.5 if available now.
function score(t: {
  ratingAvg: number;
  completedJobs: number;
  verifyStatus: string;
  isAvailableNow: boolean;
}): number {
  return (
    t.ratingAvg * 2 +
    Math.log(1 + t.completedJobs) +
    (t.verifyStatus === 'VERIFIED' ? 2 : 0) +
    (t.isAvailableNow ? 1.5 : 0)
  );
}

// ---------------------------------------------------------------------------
// Public search
// ---------------------------------------------------------------------------

export type SearchParams = {
  skill?: string;
  area?: string;
  q?: string;
  verifiedOnly: boolean;
  availableNow: boolean;
  minRating?: number;
  maxRate?: number;
  sort: 'relevance' | 'rating' | 'experience' | 'rate';
  page: number;
  pageSize: number;
};

export async function searchTechnicians(params: SearchParams) {
  const {
    skill,
    area,
    q,
    verifiedOnly,
    availableNow,
    minRating,
    maxRate,
    sort,
    page,
    pageSize,
  } = params;

  // If q is given and skill/area were not supplied directly, try to infer them.
  let resolvedSkill = skill;
  let resolvedArea = area;

  if (q) {
    if (!resolvedSkill) {
      const slugs = findMatchingSlugs(q, SKILLS);
      if (slugs.length > 0) resolvedSkill = slugs[0];
    }
    if (!resolvedArea) {
      const slugs = findMatchingSlugs(q, AREAS);
      if (slugs.length > 0) resolvedArea = slugs[0];
    }
  }

  // Build the Prisma where clause.
  const where = {
    user: { status: 'ACTIVE' as const },
    ...(resolvedSkill ? { skills: { has: resolvedSkill } } : {}),
    ...(resolvedArea ? { areas: { has: resolvedArea } } : {}),
    ...(verifiedOnly ? { verifyStatus: 'VERIFIED' as const } : {}),
    ...(availableNow ? { isAvailableNow: true } : {}),
    ...(minRating !== undefined ? { ratingAvg: { gte: minRating } } : {}),
    ...(maxRate !== undefined ? { rateMin: { lte: maxRate } } : {}),
  };

  // For relevance sort we load up to 200 matches and sort in code.
  // For other sorts we can let Prisma sort and paginate directly.
  if (sort === 'relevance') {
    const rows = await prisma.technicianProfile.findMany({
      where,
      take: 200,
      include: { user: { select: { id: true, name: true } } },
    });

    rows.sort((a, b) => score(b) - score(a));

    const total = rows.length;
    const paginated = rows.slice((page - 1) * pageSize, page * pageSize);

    return { items: paginated.map(formatRow), total };
  }

  const orderBy =
    sort === 'rating'
      ? [{ ratingAvg: 'desc' as const }, { ratingCount: 'desc' as const }]
      : sort === 'experience'
        ? [{ experienceYears: 'desc' as const }]
        : [{ rateMin: 'asc' as const }]; // rate

  const [rows, total] = await Promise.all([
    prisma.technicianProfile.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.technicianProfile.count({ where }),
  ]);

  return { items: rows.map(formatRow), total };
}

// Shape the response: id is the user id, no phone, no nidPublicId.
function formatRow(row: {
  userId: string;
  user: { id: string; name: string };
  age: number;
  experienceYears: number;
  skills: string[];
  areas: string[];
  rateMin: number | null;
  rateMax: number | null;
  isAvailableNow: boolean;
  photoUrl: string | null;
  verifyStatus: string;
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
}) {
  return {
    id: row.userId,
    name: row.user.name,
    photoUrl: row.photoUrl,
    verified: row.verifyStatus === 'VERIFIED',
    isAvailableNow: row.isAvailableNow,
    age: row.age,
    experienceYears: row.experienceYears,
    rateMin: row.rateMin,
    rateMax: row.rateMax,
    skills: row.skills,
    areas: row.areas,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    completedJobs: row.completedJobs,
  };
}



export const getTechnicianByIdDB = async (technicianId: string) => {
  const profile = await prisma.technicianProfile.findUnique({
    where: { userId: technicianId },
    include: { user: { select: { id: true, name: true, status: true } } },
  });

  if (!profile || profile.user.status !== 'ACTIVE') {
    throw new AppError('NOT_FOUND', 'Technician not found');
  }

  const { user, ...rest } = profile;

  return {
    id: profile.userId,
    name: user.name,
    photoUrl: rest.photoUrl,
    bio: rest.bio,
    verified: rest.verifyStatus === 'VERIFIED',
    isAvailableNow: rest.isAvailableNow,
    age: rest.age,
    experienceYears: rest.experienceYears,
    rateMin: rest.rateMin,
    rateMax: rest.rateMax,
    skills: rest.skills,
    areas: rest.areas,
    ratingAvg: rest.ratingAvg,
    ratingCount: rest.ratingCount,
    completedJobs: rest.completedJobs,
    profileUrl: `${process.env.CLIENT_URL}/technicians/${profile.userId}`,
  };
};



export const getTechnicianReviewsDB = async(technicianId:string, query:{rating?:number; page:number; pageSize:number})=>{
      const {rating, page, pageSize} = query;
      
      const profile = await prisma.technicianProfile.findUnique({
        where:{
            userId: technicianId
        },
        select:{
            ratingAvg: true,
            ratingCount: true,
            user: {
                select:{status:true}
            }
        }
      })
 
      if(!profile || profile.user.status!=="ACTIVE"){
        throw new AppError("NOT_FOUND", "Technician not found")
      }
      const where = {
        technicianId,
        ...(rating !== undefined? {rating} : {})
      }

const [reviews, total, groups] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.groupBy({
      by: ['rating'],
      where: { technicianId },
      _count: { _all: true },
    }),
  ]);

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const g of groups) {
    distribution[g.rating] = g._count._all;
  }

  return {
    summary: {
      ratingAvg: profile.ratingAvg,
      ratingCount: profile.ratingCount,
      distribution,
    },
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      customerName: r.customer.name.trim().split(/\s+/)[0],
      createdAt: r.createdAt,
    })),
    total,
  };


}



export const upsertProfileDB = async (
  userId: string,
  body: {
    name?: string;
    age: number;
    bio?: string;
    experienceYears: number;
    skills: string[];
    areas: string[];
    rateMin?: number;
    rateMax?: number;
  },
  photoFile?: Express.Multer.File,
) => {
  const { name, ...profileData } = body;

  let photoUrl: string | undefined;
  if (photoFile) {
    photoUrl = await uploadToCloudinary(photoFile.buffer, `karigor/PHOTO/${userId}`);
  }

  await prisma.$transaction(async (tx) => {
    if (name) {
      await tx.user.update({ where: { id: userId }, data: { name } });
    }

    await tx.technicianProfile.upsert({
      where: { userId },
      update: { ...profileData, ...(photoUrl ? { photoUrl } : {}) },
      create: { userId, ...profileData, ...(photoUrl ? { photoUrl } : {}) },
    });
  });

  return getMyProfileDB(userId);
};




// export const upsertProfileDB = async (
//   userId: string,
//   body: {
//     age: number;
//     bio?: string;
//     experienceYears: number;
//     skills: string[];
//     areas: string[];
//     rateMin?: number;
//     rateMax?: number;
//   },
//   photoFile?: Express.Multer.File,
// ) => {
//   let photoUrl: string | undefined;

//   if (photoFile) {
//     photoUrl = await uploadToCloudinary(photoFile.buffer, `karigor/photos/${userId}`);
//   }

//   const profile = await prisma.technicianProfile.upsert({
//     where: { userId },
//     update: {
//       ...body,
//       ...(photoUrl ? { photoUrl } : {}),
//     },
//     create: {
//       userId,
//       ...body,
//       ...(photoUrl ? { photoUrl } : {}),
//     },
//   });

//   return profile;
// };



export const getMyProfileDB = async(userId:string)=>{
    const profile = await prisma.technicianProfile.findUnique({
         where:{userId},
         include:{
          user:{select:{name:true, phone:true} }
         }
    })

   if(!profile){
    throw new AppError("NOT_FOUND","Technician profile not found")
   }

 return {
    name: profile.user.name,
    phone: profile.user.phone,
    age: profile.age,
    bio: profile.bio,
    experienceYears: profile.experienceYears,
    skills: profile.skills,
    areas: profile.areas,
    rateMin: profile.rateMin,
    rateMax: profile.rateMax,
    isAvailableNow: profile.isAvailableNow,
    photoUrl: profile.photoUrl,
    verifyStatus: profile.verifyStatus,
    rejectReason: profile.rejectReason,
    ratingAvg: profile.ratingAvg,
    ratingCount: profile.ratingCount,
    completedJobs: profile.completedJobs,
  };
  

}


export const updateAvailabilityDB = async (userId: string, isAvailableNow: boolean) => {
  const result = await prisma.technicianProfile.updateMany({
    where: { userId },
    data: { isAvailableNow },
  });

  if (result.count === 0) {
    throw new AppError('NOT_FOUND', 'Technician profile not found');
  }

  return { isAvailableNow };
};


const MAX_BYTES = 2 * 1024 * 1024;

// export const signUploadDB = (userId: string, purpose: 'PHOTO' | 'NID') => {
//   const cloudName = env.CLOUDINARY_CLOUD_NAME;
//   const apiKey = env.CLOUDINARY_API_KEY;
//   const apiSecret = env.CLOUDINARY_API_SECRET;

//   if (!cloudName || !apiKey || !apiSecret) {
//     throw new AppError('INTERNAL', 'Image upload is not configured.');
//   }

//   const folder = `karigor/${purpose}/${userId}`;
//   const type = purpose === 'NID' ? 'authenticated' : 'upload';
//   const timestamp = Math.floor(Date.now() / 1000);

//   const signature = signUploadParams(
//     { allowed_formats: ALLOWED_FORMATS, folder, timestamp, type },
//     apiSecret,
//   );

//   return {
//     cloudName,
//     apiKey,
//     timestamp,
//     signature,
//     folder,
//     type,
//     uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
//     maxBytes: MAX_BYTES,
//     allowedFormats: ALLOWED_FORMATS,
//   };
// };



export const submitVerificationDB = async (
  userId: string,
  files: { photo?: Express.Multer.File; nid?: Express.Multer.File },
) => {
  const profile = await prisma.technicianProfile.findUnique({
    where: { userId },
    select: { verifyStatus: true, photoUrl: true },
  });

  if (!profile) {
    throw new AppError('CONFLICT', 'Create your profile first');
  }
  if (profile.verifyStatus === 'VERIFIED' || profile.verifyStatus === 'PENDING') {
    throw new AppError('CONFLICT', `Verification is already ${profile.verifyStatus.toLowerCase()}`);
  }
  if (!files.nid) {
    throw new AppError('VALIDATION_ERROR', 'NID image is required');
  }
  if (!files.photo && !profile.photoUrl) {
    throw new AppError('VALIDATION_ERROR', 'A profile photo is required');
  }

  const nidPublicId = await uploadPrivateImage(files.nid.buffer, `karigor/NID/${userId}`);
  const photoUrl = files.photo
    ? await uploadToCloudinary(files.photo.buffer, `karigor/PHOTO/${userId}`)
    : undefined;

  const result = await prisma.technicianProfile.updateMany({
    where: { userId, verifyStatus: { in: ['NONE', 'REJECTED'] } },
    data: {
      nidPublicId,
      ...(photoUrl ? { photoUrl } : {}),
      verifyStatus: 'PENDING',
      rejectReason: null,
    },
  });

  if (result.count === 0) {
    throw new AppError('INVALID_STATUS');
  }

  return { verifyStatus: 'PENDING' as const };
};




//  FOR GEMINI

export const extractAnswer = (questionKey: OnboardingKey, text: string) => {
  let value: unknown = null;
  let unmatched: string[] = [];

  switch (questionKey) {
    case 'age':
      value = parseAge(text);
      break;
    case 'experience':
      value = parseExperience(text);
      break;
    case 'charge':
      value = parseRange(text);
      break;
    case 'skills':
    case 'areas': {
      const result = matchSlugs(text, questionKey === 'skills' ? SKILLS : AREAS);
      value = result.slugs.length > 0 ? result.slugs : null;
      unmatched = result.unmatched;
      break;
    }
  }

  return { questionKey, transcript: null, value, unmatched, usedAi: false };
};





const QUESTION_HINTS: Record<OnboardingKey, string> = {
  age: 'The worker says their age in years. value = the age as an integer, or null.',
  experience: 'The worker says how many years they have worked. value = whole years as an integer, or null.',
  skills: 'The worker says what work they do. value = an array of slugs from the allowed list, or null.',
  areas: 'The worker says which areas of Dhaka they can work in. value = an array of slugs from the allowed list, or null.',
  charge:
    'The worker says their usual charge in taka. value = {"rateMin": integer, "rateMax": integer}. One number means both are equal. Use null if unclear.',
};

const slugListText = (
  list: readonly { slug: string; en: string; bn: string; aliases: readonly string[] }[],
) => list.map((i) => `${i.slug}: ${[i.bn, i.en, ...i.aliases].join(', ')}`).join('\n');

const buildPrompt = (key: OnboardingKey) => {
  const allowed =
    key === 'skills'
      ? `Allowed slugs and the names workers use:\n${slugListText(SKILLS)}`
      : key === 'areas'
        ? `Allowed slugs and the names workers use:\n${slugListText(AREAS)}`
        : '';

  return [
    'You hear a short voice answer, usually in Bangla, from a worker in Bangladesh.',
    QUESTION_HINTS[key],
    'Reply with ONLY this JSON: {"transcript": "<what the worker said>", "value": <the extracted value or null>}.',
    'Convert numbers spoken in words into digits. If you are not sure, use null for value. Never invent slugs.',
    allowed,
  ].join('\n');
};

const toInt = (raw: unknown): number | null => {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw)
        : Number.NaN;
  return Number.isInteger(n) ? n : null;
};

// Never trust the AI output: check ranges and drop any slug that does not exist.
const cleanAiValue = (key: OnboardingKey, raw: unknown): unknown => {
  switch (key) {
    case 'age': {
      const n = toInt(raw);
      return n !== null && n >= 16 && n <= 80 ? n : null;
    }
    case 'experience': {
      const n = toInt(raw);
      return n !== null && n >= 0 && n <= 60 ? n : null;
    }
    case 'charge': {
      if (typeof raw !== 'object' || raw === null) return null;
      const { rateMin, rateMax } = raw as { rateMin?: unknown; rateMax?: unknown };
      const a = toInt(rateMin) ?? toInt(rateMax);
      const b = toInt(rateMax) ?? a;
      if (a === null || b === null) return null;
      const min = Math.min(a, b);
      const max = Math.max(a, b);
      return min >= 0 && max <= 1000000 ? { rateMin: min, rateMax: max } : null;
    }
    case 'skills':
    case 'areas': {
      const allowed = key === 'skills' ? SKILL_SLUGS : AREA_SLUGS;
      if (!Array.isArray(raw)) return null;
      const slugs = [
        ...new Set(
          raw.filter((s): s is string => typeof s === 'string' && allowed.includes(s)),
        ),
      ];
      return slugs.length > 0 ? slugs : null;
    }
  }
};


// Audio recorded in a browser is often labelled video/*. Tell Gemini it is audio.
const toAudioMime = (mime: string): string => {
  const base = mime.split(';')[0] ?? mime;
  if (base === 'video/mp4') return 'audio/mp4';
  if (base === 'video/webm') return 'audio/webm';
  return base;
};



export const extractAnswerFromAudio = async (
  questionKey: OnboardingKey,
  file: Express.Multer.File,
) => {
  const failed = {
    questionKey,
    transcript: null,
    value: null,
    unmatched: [] as string[],
    usedAi: false,
  };

  const ai = await askGeminiWithAudio({
    audio: file.buffer,
     mimeType: toAudioMime(file.mimetype),
    prompt: buildPrompt(questionKey),
  });

  if (typeof ai !== 'object' || ai === null) return failed;

  const { transcript, value: aiValue } = ai as { transcript?: unknown; value?: unknown };
  const heard =
    typeof transcript === 'string' && transcript.trim() !== '' ? transcript.trim() : null;

  // Code matching on the transcript wins over the AI value.
  const fromCode = heard ? extractAnswer(questionKey, heard) : null;
  if (fromCode && fromCode.value !== null) {
    return {
      questionKey,
      transcript: heard,
      value: fromCode.value,
      unmatched: fromCode.unmatched,
      usedAi: true,
    };
  }

  return {
    questionKey,
    transcript: heard,
    value: cleanAiValue(questionKey, aiValue),
    unmatched: fromCode?.unmatched ?? [],
    usedAi: true,
  };
};


//  END GEMINI


const DASHBOARD_JOB_STATUSES = [
  'IN_PROGRESS',
  'AWAITING_CONFIRMATION',
  'COMPLETED',
  'DISPUTED',
] as const;

export const getDashboardDB = async (userId: string) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const contractExpiry = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const profile = await prisma.technicianProfile.findUnique({
    where: { userId },
    select: {
      skills: true,
      areas: true,
      verifyStatus: true,
      isAvailableNow: true,
      ratingAvg: true,
      ratingCount: true,
    },
  });

  if (!profile) {
    throw new AppError('NOT_FOUND', 'Technician profile not found');
  }

  const [statusGroups, awaitingSignature, activeBids, newJobs, earningsAll, earningsRecent, reviews] =
    await Promise.all([
      prisma.job.groupBy({
        by: ['status'],
        where: { technicianId: userId, status: { in: [...DASHBOARD_JOB_STATUSES] } },
        _count: { _all: true },
      }),
      prisma.job.count({
        where: { technicianId: userId, status: 'CONTRACT_PENDING', updatedAt: { gt: contractExpiry } },
      }),
      prisma.bid.count({
        where: {
          technicianId: userId,
          status: 'ACTIVE',
          job: { status: 'OPEN', expiresAt: { gt: now } },
        },
      }),
      prisma.job.count({
        where: {
          status: 'OPEN',
          expiresAt: { gt: now },
          skill: { in: profile.skills },
          area: { in: profile.areas },
          bids: { none: { technicianId: userId } },
        },
      }),
      prisma.job.aggregate({
        where: { technicianId: userId, paidAt: { not: null } },
        _sum: { agreedPrice: true },
      }),
      prisma.job.aggregate({
        where: { technicianId: userId, paidAt: { gte: thirtyDaysAgo } },
        _sum: { agreedPrice: true },
      }),
      prisma.review.findMany({
        where: { technicianId: userId },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
    ]);

  const byStatus = new Map(statusGroups.map((g) => [g.status, g._count._all]));
  const countOf = (status: (typeof DASHBOARD_JOB_STATUSES)[number]) => byStatus.get(status) ?? 0;

  return {
    counts: {
      newJobs,
      activeBids,
      awaitingSignature,
      active: countOf('IN_PROGRESS') + countOf('AWAITING_CONFIRMATION'),
      completed: countOf('COMPLETED'),
      disputed: countOf('DISPUTED'),
    },
    earnings: {
      total: earningsAll._sum.agreedPrice ?? 0,
      last30Days: earningsRecent._sum.agreedPrice ?? 0,
    },
    rating: { avg: profile.ratingAvg, count: profile.ratingCount },
    verifyStatus: profile.verifyStatus,
    isAvailableNow: profile.isAvailableNow,
    recentReviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      customerName: r.customer.name.trim().split(/\s+/)[0],
      createdAt: r.createdAt,
    })),
  };
};