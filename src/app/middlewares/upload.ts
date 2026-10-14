import multer from 'multer';
import { AppError } from '../errors/AppError.js';

const ALLOWED_IMAGE_TYPES = ['image/jpg','image/jpeg', 'image/png', 'image/webp'];

export const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new AppError('VALIDATION_ERROR', 'Only jpg, png or webp images are allowed'));
  },
}).single('photo');