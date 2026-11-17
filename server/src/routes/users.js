import { Router } from 'express';
import User, { ROLES, PERMISSIONS, ALL_PERMISSIONS } from '../models/User.js';
import { asyncHandler, HttpError, pageParams, paged, pageArray } from '../utils/http.js';
import { diff, moveToTrash, notify } from '../services/audit.js';

const USER_FIELDS = [
  ['name', 'Name'], ['email', 'Email'], ['role', 'Role'], ['status', 'Status'], ['designation', 'Designation'], ['phone', 'Phone'],
  ['permissions', 'Permissions', (v) => (v?.length ? v.join(', ') : 'None')],
];

const cleanPerms = (p) => (Array.isArray(p) ? [...new Set(p.filter((x) => ALL_PERMISSIONS.includes(x)))] : undefined);

// Only an Administrator can create Administrators or change an Administrator's account
const guardAdminChanges = (req, { targetRole, newRole }) => {
  if (req.user.role === 'Admin') return;
  if (targetRole === 'Admin' || newRole === 'Admin')
    throw new HttpError(403, 'Only an Administrator can create or change Administrator accounts');
};

// Mounted behind requireAuth + requirePerm('users')
const router = Router();

router.get('/permissions', (req, res) => res.json(PERMISSIONS));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const users = await User.find().sort({ role: 1, name: 1 });
    const p = pageParams(req.query);
    res.json(p ? pageArray(users, p) : users);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, email, password, role, phone, designation } = req.body;
    guardAdminChanges(req, { newRole: role });
    const permissions = cleanPerms(req.body.permissions);
    if (!password || String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    if (role && !ROLES.includes(role)) throw new HttpError(400, 'Invalid role');
    const user = await User.create({ name, email, password, role, phone, designation, ...(permissions && { permissions }) });
    await notify(req, {
      action: 'created', entity: 'User', entityId: user._id, entityName: user.name,
      message: `${req.user.name} created ${user.role} login for ${user.name} (${user.email})`,
      changes: diff({}, user.toObject(), USER_FIELDS),
    });
    res.status(201).json(user);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new HttpError(404, 'User not found');
    const { name, email, role, status, phone, designation, password } = req.body;
    guardAdminChanges(req, { targetRole: user.role, newRole: role });
    const permissions = cleanPerms(req.body.permissions);
    const isSelf = String(user._id) === String(req.user._id);
    const before = user.toObject();

    // Never let the last active admin lock everyone out
    const demoting = (role && role !== 'Admin') || status === 'Inactive';
    if (user.role === 'Admin' && demoting) {
      if (isSelf) throw new HttpError(400, 'You cannot remove your own admin access or disable yourself');
      const admins = await User.countDocuments({ role: 'Admin', status: 'Active' });
      if (admins <= 1) throw new HttpError(400, 'At least one active administrator is required');
    }

    Object.assign(user, {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(role !== undefined && { role }),
      ...(status !== undefined && { status }),
      ...(phone !== undefined && { phone }),
      ...(designation !== undefined && { designation }),
      ...(permissions && { permissions }),
    });
    if (password) {
      if (String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
      user.password = password; // hashed by the model
    }
    await user.save();
    const changes = diff(before, user.toObject(), USER_FIELDS);
    if (password) changes.push({ field: 'Password', from: '—', to: 'Reset by admin' });
    if (changes.length)
      await notify(req, {
        action: 'updated', entity: 'User', entityId: user._id, entityName: user.name,
        message: `${req.user.name} updated login for ${user.name} (${changes.map((c) => c.field).join(', ')})`,
        changes,
      });
    res.json(user);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (String(req.params.id) === String(req.user._id)) throw new HttpError(400, 'You cannot delete your own account');
    const user = await User.findById(req.params.id).select('+password'); // keep hash so a restore can log in again
    if (!user) throw new HttpError(404, 'User not found');
    guardAdminChanges(req, { targetRole: user.role });
    if (user.role === 'Admin' && (await User.countDocuments({ role: 'Admin', status: 'Active' })) <= 1)
      throw new HttpError(400, 'At least one active administrator is required');
    await moveToTrash(req, 'User', user, `${user.name} (${user.email})`);
    await notify(req, {
      action: 'deleted', entity: 'User', entityId: user._id, entityName: user.name,
      message: `${req.user.name} deleted login for ${user.name} (${user.email}) — moved to Recycle Bin`,
    });
    res.json({ ok: true });
  })
);

export default router;
