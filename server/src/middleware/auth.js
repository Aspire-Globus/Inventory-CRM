import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { HttpError } from '../utils/http.js';

const SECRET = () => process.env.JWT_SECRET || 'change-this-secret-in-env';
const EXPIRES = () => process.env.JWT_EXPIRES || '7d';

export const signToken = (user) => jwt.sign({ id: user._id, role: user.role }, SECRET(), { expiresIn: EXPIRES() });

const USER_CACHE_MS = 20000;
const userCache = new Map();
/** Clear cached logins (after a user, password, permission or Recycle Bin change). */
export const forgetUsers = () => userCache.clear();

// Any logged-in, active user
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Please log in');
    let payload;
    try {
      payload = jwt.verify(token, SECRET());
    } catch {
      throw new HttpError(401, 'Session expired — please log in again');
    }
    // Signed-in user is kept in memory for a short time, so most requests skip one database trip.
    // Any change to users / logins clears this (see forgetUsers in index.js).
    const hit = userCache.get(payload.id);
    let user = hit && Date.now() - hit.at < USER_CACHE_MS ? hit.user : null;
    if (!user) {
      user = await User.findById(payload.id);
      if (user) userCache.set(payload.id, { user, at: Date.now() });
    }
    if (!user || user.status !== 'Active') throw new HttpError(401, 'Account not found or disabled');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'Admin') return next(new HttpError(403, 'Only administrators can do this'));
  next();
}

// Staff can read; only Admin can create / edit / delete
export function adminForWrites(req, res, next) {
  if (req.method === 'GET') return next();
  return requireAdmin(req, res, next);
}

// Require one permission for every request (e.g. users, recycle bin, notifications)
export const requirePerm = (perm) => (req, res, next) =>
  req.user?.can(perm) ? next() : next(new HttpError(403, 'You do not have permission to do this'));

// Reading is open to every logged-in user; changes need `perm`; deletes also need "delete"
export const writePerm = (perm) => (req, res, next) => {
  if (req.method === 'GET') return next();
  if (!req.user?.can(perm)) return next(new HttpError(403, 'You do not have permission to change this'));
  if (req.method === 'DELETE' && !req.user.can('delete')) return next(new HttpError(403, 'You do not have permission to delete'));
  next();
};
