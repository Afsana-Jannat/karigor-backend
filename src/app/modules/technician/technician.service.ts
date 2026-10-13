import { AREAS, SKILLS } from '../../../constants/index.js';
import {uploadToCloudinary } from '../../../lib/cloudinary.js';
import { prisma } from '../../../lib/prisma.js';
import { AppError } from '../../errors/AppError.js';

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


  return prisma.$transaction(async (tx) => {
    if (name) {
      await tx.user.update({ where: { id: userId }, data: { name } });
    }

   const profile = await tx.technicianProfile.upsert({
    where: { userId },
    update: { ...profileData, ...(photoUrl ? { photoUrl } : {}) },
    create: { userId, ...profileData, ...(photoUrl ? { photoUrl } : {}) },
    include: { user: { select: { name: true } } },
  });

  const { user, ...rest } = profile;
  return { name: user.name, ...rest };
  });
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