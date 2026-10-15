import type { Request } from 'express';
import { buildMeta, sendResponse } from '../../utils/sendResponse.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { extractAnswer, extractAnswerFromAudio, getMyProfileDB, getTechnicianByIdDB, getTechnicianReviewsDB, searchTechnicians, submitVerificationDB, updateAvailabilityDB, upsertProfileDB } from './technician.service.js';
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js';
import multer from 'multer';
import { AppError } from '../../errors/AppError.js';
import { OnboardingKey } from '../../../constants/index.js';


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


export const getMyProfile = catchAsync(async (req: Request, res) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) throw new AppError('UNAUTHENTICATED');

  const result = await getMyProfileDB(user.id);

  sendResponse(res, { data: result });
});

export const updateAvailability = catchAsync(async (req: Request, res) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) throw new AppError('UNAUTHENTICATED');

  const { isAvailableNow } = req.body as { isAvailableNow: boolean };
  const result = await updateAvailabilityDB(user.id, isAvailableNow);

  sendResponse(res, { data: result });
});



// export const signUpload = catchAsync(async (req: Request, res) => {
//   const { user } = req as AuthenticatedRequest;
//   if (!user) throw new AppError('UNAUTHENTICATED');

//   const { purpose } = req.body as { purpose: 'PHOTO' | 'NID' };
//   const result = signUploadDB(user.id, purpose);

//   sendResponse(res, { data: result });
// });



export const submitVerification = catchAsync(async (req: Request, res) => {
  const { user } = req as AuthenticatedRequest;
  if (!user) throw new AppError('UNAUTHENTICATED');

  const files = (req.files ?? {}) as {
    photo?: Express.Multer.File[];
    nid?: Express.Multer.File[];
  };

  const result = await submitVerificationDB(user.id, {
    photo: files.photo?.[0],
    nid: files.nid?.[0],
  });

  sendResponse(res, { data: result });
});



export const extractOnboardingAnswer = catchAsync(async (req: Request, res) => {
  const { questionKey, text } = req.body as { questionKey: OnboardingKey; text?: string };
  const audio = req.file;

  if ((text && audio) || (!text && !audio)) {
    throw new AppError('VALIDATION_ERROR', 'Send exactly one of text or audio');
  }

  const result = audio
    ? await extractAnswerFromAudio(questionKey, audio)
    : extractAnswer(questionKey, text ?? '');

  sendResponse(res, { data: result });
});