import multer from 'multer';
import { AppError } from '../errors/AppError.js';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// export const uploadPhoto = multer({
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 2 * 1024 * 1024 },
//   fileFilter: (_req, file, cb) => {
//     if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
//       cb(null, true);
//       return;
//     }
//     cb(new AppError('VALIDATION_ERROR', 'Only jpg, png or webp images are allowed'));
//   },
// }).single('photo');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new AppError('VALIDATION_ERROR', 'Only jpg, png or webp images are allowed'));
  },
});

export const uploadPhoto = upload.single('photo');
export const uploadVerificationFiles = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'nid', maxCount: 1 },
]);



const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/x-m4a',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'video/webm',
  'video/mp4',
];

export const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const type = file.mimetype.split(';')[0] ?? '';
    if (ALLOWED_AUDIO_TYPES.includes(type)) {
      cb(null, true);
      return;
    }
    cb(new AppError('VALIDATION_ERROR', 'Only webm, mp4, ogg, mp3 or wav audio is allowed'));
  },
}).single('audio');