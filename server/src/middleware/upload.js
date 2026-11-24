import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { HttpError } from '../utils/http.js';
import { toStoredPath, UPLOAD_ROOT } from '../utils/urls.js';

// Uploaded files live in server/uploads and are served at /uploads/...
// Where pictures are saved. On a live server set UPLOAD_DIR to a folder OUTSIDE the app folder,
// so pictures survive redeploys (e.g. UPLOAD_DIR=/home/<user>/aspire-uploads).
export { UPLOAD_ROOT };
const ITEM_DIR = path.join(UPLOAD_ROOT, 'items');
const REPAIR_DIR = path.join(UPLOAD_ROOT, 'repairs');
fs.mkdirSync(ITEM_DIR, { recursive: true });
fs.mkdirSync(REPAIR_DIR, { recursive: true });
const newName = (ext) => `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const uploader = (dir) => multer({
  storage: multer.diskStorage({
    destination: dir,
    filename: (req, file, cb) => cb(null, newName(EXT[file.mimetype])),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    EXT[file.mimetype] ? cb(null, true) : cb(new HttpError(400, 'Image must be JPG, PNG, WEBP or GIF')),
});
const itemUpload = uploader(ITEM_DIR);
const repairUpload = uploader(REPAIR_DIR);

/**
 * A picture sent as text (data URL "data:image/jpeg;base64,...") is saved as a file.
 * Returns the stored path "/uploads/<folder>/<file>". Other values (paths, links, '') are returned unchanged.
 */
export function saveDataUrl(value, folder) {
  if (typeof value !== 'string' || !value.startsWith('data:')) return toStoredPath(value);
  const m = value.match(/^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,(.+)$/s);
  if (!m) throw new HttpError(400, 'Picture must be a JPG, PNG, WEBP or GIF image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) throw new HttpError(400, 'Picture is too large (max 5 MB)');
  const file = newName(EXT[m[1].replace('jpg', 'jpeg')]);
  fs.writeFileSync(path.join(folder === 'repairs' ? REPAIR_DIR : ITEM_DIR, file), buf);
  return `/uploads/${folder}/${file}`;
}

// If the request fails after a new picture was saved, delete that picture again
function cleanupOnError(res, url) {
  res.on('finish', () => { if (res.statusCode >= 400) removeUpload(url); });
}

/**
 * Accepts an item as multipart/form-data (field "image" = the file) or as plain JSON.
 * Form data values are text, so "specs" is sent as a JSON string and parsed here.
 * After this, req.body.image is "/uploads/items/<file>" when a file was sent.
 */
export function itemForm(req, res, next) {
  if (!req.is('multipart/form-data')) {
    // JSON: the picture may come as a data URL (saved as a file) or as a full link to our own file
    try {
      if (req.body && 'image' in req.body) {
        const before = req.body.image;
        req.body.image = saveDataUrl(before, 'items');
        if (req.body.image !== before && String(before).startsWith('data:')) cleanupOnError(res, req.body.image);
      }
    } catch (err) { return next(err); }
    return next();
  }
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

/**
 * Damage photo for POST /api/repairs/report and POST /api/assignments/:id/return.
 * Accepts multipart/form-data (file in field "photo") or JSON with photo as a data URL.
 * Either way the photo is saved in uploads/repairs and req.body.photo becomes "/uploads/repairs/<file>".
 */
export function repairPhoto(req, res, next) {
  const done = (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(400, 'Photo is too large (max 5 MB)'));
      if (err instanceof multer.MulterError) return next(new HttpError(400, `Upload error: ${err.message}`));
      return next(err);
    }
    try {
      const b = req.body || {};
      if (req.file) b.photo = `/uploads/repairs/${req.file.filename}`;
      else if (b.photo) b.photo = saveDataUrl(b.photo, 'repairs');
      if (b.photo && b.photo.startsWith('/uploads/repairs/')) cleanupOnError(res, b.photo);
      req.body = b;
      next();
    } catch (e) { next(e); }
  };
  if (req.is('multipart/form-data')) repairUpload.single('photo')(req, res, done);
  else done();
}
