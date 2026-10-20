import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { HttpError, asyncHandler } from '../lib/http';
import { HARD_CAP_BYTES, fitImage, storeImage } from '../lib/images';
import { requireAuth } from '../middleware/auth';

export const uploadsRouter = Router();

const TOO_BIG = 'Image must be 20 MB or smaller';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: HARD_CAP_BYTES, files: 1 } });

/** Runs multer and turns its errors into the API's error shape. */
function singleImage(req: Request, res: Response, next: NextFunction) {
  upload.single('image')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, TOO_BIG, { image: TOO_BIG }));
      return next(new HttpError(400, 'Upload one image in the "image" field', { image: 'Upload one image' }));
    }
    next(err);
  });
}

// upl-001: sign-in is checked before the body is read.
uploadsRouter.post(
  '/',
  requireAuth,
  singleImage,
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose an image to upload', { image: 'Choose an image to upload' });
    const image = await fitImage(req.file.buffer);
    const url = await storeImage(image);
    res.status(201).json({
      url,
      bytes: image.buffer.length,
      originalBytes: req.file.size,
      width: image.width,
      height: image.height,
      resized: image.resized,
    });
  }),
);
