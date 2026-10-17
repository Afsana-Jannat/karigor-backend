import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { extractOnboardingAnswer, getMyProfile, getTechnicianById, getTechnicianReviews, getTechnicians, submitVerification, updateAvailability, upsertProfile } from './technician.controller.js';
import { availabilityBody, extractAnswerBody, reviewsQuery, searchTechniciansQuery, technicianIdParams, upsertProfileBody } from './technician.validation.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { uploadAudio, uploadPhoto, uploadVerificationFiles } from '../../middlewares/upload.js';
// add uploadPhoto to the controller imports

const router = Router();

// PUBLIC — no authenticate middleware needed
router.get('/', validateRequest({ query: searchTechniciansQuery }), getTechnicians);

router.get(
  '/:id',
  validateRequest({ params: technicianIdParams }),getTechnicianById,
);


router.get(
  '/:id/reviews',
  validateRequest({ params: technicianIdParams, query: reviewsQuery }),
  getTechnicianReviews,
);




// router.put('/me/profile',authenticate,uploadPhoto,validateRequest({ body: upsertProfileBody }),upsertProfile);


router.put(
  '/me/profile',
  authenticate,
  authorize('TECHNICIAN'),
  uploadPhoto,
  validateRequest({ body: upsertProfileBody }),
  upsertProfile,
);


router.get('/me/profile', authenticate, authorize('TECHNICIAN'), getMyProfile);

router.patch(
  '/me/availability',
  authenticate,
  authorize('TECHNICIAN'),
  validateRequest({ body: availabilityBody }),
  updateAvailability,
);



router.post(
  '/me/verification',
  authenticate,
  authorize('TECHNICIAN'),
  uploadVerificationFiles,
  submitVerification,
);




// FOR GEMINI
router.post(
  '/onboarding/extract',
  authenticate,
  authorize('TECHNICIAN'),
  uploadAudio,
  validateRequest({ body: extractAnswerBody }),
  extractOnboardingAnswer,
);






export const technicianRoutes = router;