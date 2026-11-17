import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { HttpError } from '../utils/http.js';

// Uploaded files live in server/uploads and are served at /uploads/...
export const UPLOAD_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
const ITEM_DIR = path.join(UPLOAD_ROOT, 'items');
fs.mkdirSync(ITEM_DIR, { recursive: true });

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const itemUpload = multer({
  storage: multer.diskStorage({
    destination: ITEM_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    EXT[file.mimetype] ? cb(null, true) : cb(new HttpError(400, 'Image must be JPG, PNG, WEBP or GIF')),
});

/**
 * Accepts an item as multipart/form-data (field "image" = the file) or as plain JSON.
 * Form data values are text, so "specs" is sent as a JSON string and parsed here.
 * After this, req.body.image is "/uploads/items/<file>" when a file was sent.
 */
export function itemForm(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  itemUpload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(400, 'Image is too large (max 5 MB)'));
      if (err instanceof multer.MulterError) return next(new HttpError(400, `Upload error: ${err.message}`));
      return next(err);
    }
    const b = req.body || {};
    if (typeof b.specs === 'string') {
      try {
        b.specs = b.specs ? JSON.parse(b.specs) : {};
      } catch {
        return next(new HttpError(400, 'specs must be JSON, e.g. {"ram":"16 GB"}'));
      }
    }
    if (req.file) b.image = `/uploads/items/${req.file.filename}`;
    else if (b.removeImage === 'true') b.image = '';
    else delete b.image; // keep the current image
    req.body = b;
    next();
  });
}

/** Delete an old uploaded file (only our own /uploads files, never data URLs or outside links). */
export function removeUpload(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
  const file = path.resolve(UPLOAD_ROOT, '.' + url.slice('/uploads'.length));
  if (!file.startsWith(UPLOAD_ROOT + path.sep)) return;
  fs.promises.unlink(file).catch(() => {});
}
