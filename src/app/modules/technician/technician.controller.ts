import type { Request } from 'express';
import { buildMeta, sendResponse } from '../../utils/sendResponse.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { getTechnicianByIdDB, getTechnicianReviewsDB, searchTechnicians, upsertProfileDB } from './technician.service.js';
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js';
import multer from 'multer';
import { AppError } from '../../errors/AppError.js';


export const getTechnicians = catchAsync(async (req: Request, res) => {
  const q = req.query as unknown as {
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

  const { items, total } = await searchTechnicians(q);

  sendResponse(res, {
    data: items,
    meta: buildMeta(q.page, q.pageSize, total),
  });
});


export const getTechnicianById = catchAsync(async (req: Request, res) => {
  const { id } = req.params as { id: string };
  const result = await getTechnicianByIdDB(id);
  sendResponse(res, { data: result });
});

export const getTechnicianReviews = catchAsync(async (req: Request, res) => {
  const { id } = req.params as { id: string };
  const query = req.query as unknown as {
    rating?: number;
    page: number;
    pageSize: number;
  };

  const { summary, reviews, total } = await getTechnicianReviewsDB(id, query);

  sendResponse(res, {
    data: { summary, reviews },
    meta: buildMeta(query.page, query.pageSize, total),
  });
});




// const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
// export const uploadPhoto = upload.single('photo');

// export const upsertProfile = catchAsync(async (req: Request, res) => {
//   const request = req as AuthenticatedRequest;
//   const userId = request.user!.id;
//   const photoFile = req.file;

//   const result = await upsertProfileDB(userId, req.body, photoFile);

//   sendResponse(res, { statusCode: 200, data: result });
// });


export const upsertProfile = catchAsync(async (req: Request, res) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) throw new AppError('UNAUTHENTICATED');

  const result = await upsertProfileDB(user.id, req.body, req.file);

  sendResponse(res, { data: result });
});