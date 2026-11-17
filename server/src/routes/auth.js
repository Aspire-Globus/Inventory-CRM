import { Router } from 'express';
import User from '../models/User.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) throw new HttpError(400, 'Email and password are required');

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.checkPassword(password))) throw new HttpError(401, 'Invalid email or password');
    if (user.status !== 'Active') throw new HttpError(403, 'Your account is disabled — contact an administrator');

    user.lastLogin = new Date();
    await user.save();
    res.json({ token: signToken(user), user });
  })
);

router.get('/me', requireAuth, (req, res) => res.json(req.user));

// Users can edit their own basic profile (not role/status/email)
router.put(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, phone, designation } = req.body;
    if (name !== undefined && !String(name).trim()) throw new HttpError(400, 'Name is required');
    Object.assign(req.user, {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
      ...(designation !== undefined && { designation }),
    });
    await req.user.save();
    res.json(req.user);
  })
);

router.put(
  '/me/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) throw new HttpError(400, 'New password must be at least 6 characters');
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.checkPassword(String(currentPassword || '')))) throw new HttpError(400, 'Current password is incorrect');
    user.password = newPassword;
    await user.save();
    res.json({ ok: true });
  })
);

export default router;