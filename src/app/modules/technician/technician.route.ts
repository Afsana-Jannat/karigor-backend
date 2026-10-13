import { Router } from 'express';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { getTechnicianById, getTechnicianReviews, getTechnicians, upsertProfile } from './technician.controller.js';
import { reviewsQuery, searchTechniciansQuery, technicianIdParams, upsertProfileBody } from './technician.validation.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { uploadPhoto } from '../../middlewares/upload.js';
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

export const technicianRoutes = router;