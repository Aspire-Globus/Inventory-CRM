import { Router } from 'express';
import Trash from '../models/Trash.js';
import Item from '../models/Item.js';
import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import Category from '../models/Category.js';
import { asyncHandler, HttpError, pageParams } from '../utils/http.js';
import { notify, TRASH_DAYS } from '../services/audit.js';
import { requireAdmin } from '../middleware/auth.js';

// Mounted behind requireAuth + requirePerm(...)
const router = Router();
const MODELS = { Item, Department, Employee, User, Category };
const DAY = 24 * 60 * 60 * 1000;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = req.query.kind ? { kind: req.query.kind } : {};
    const p = pageParams(req.query);
    const query = Trash.find(filter).sort({ createdAt: -1 });
    const [list, total] = await Promise.all([
      (p ? query.skip(p.skip).limit(p.limit) : query).lean(),
      p ? Trash.countDocuments(filter) : 0,
    ]);
    const items = list.map(({ data, ...t }) => ({
      ...t,
      daysLeft: Math.max(0, Math.ceil((new Date(t.expiresAt) - Date.now()) / DAY)),
      summary: summarize(t.kind, data),
    }));
    // Paged: same shape plus page, limit, total, totalPages
    res.json(p
      ? { retentionDays: TRASH_DAYS, items, page: p.page, limit: p.limit, total, totalPages: Math.max(1, Math.ceil(total / p.limit)) }
      : { retentionDays: TRASH_DAYS, items });
  })
);

function summarize(kind, d = {}) {
  if (kind === 'Item') return [d.category, d.brand, d.model, `Total ${d.totalQuantity ?? 0}`].filter(Boolean).join(' · ');
  if (kind === 'Employee') return [d.employeeId, d.designation, d.location].filter(Boolean).join(' · ');
  if (kind === 'Department') return d.code || '';
  if (kind === 'User') return [d.email, d.role].filter(Boolean).join(' · ');
  if (kind === 'Category') return (d.subCategories || []).slice(0, 4).join(', ');
  return '';
}

router.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const t = await Trash.findById(req.params.id);
    if (!t) throw new HttpError(404, 'Not found in Recycle Bin (it may have expired)');
    const Model = MODELS[t.kind];
    if (await Model.exists({ _id: t.originalId })) throw new HttpError(409, `${t.kind} already exists`);

    if (t.kind === 'Employee' && t.data.department && !(await Department.exists({ _id: t.data.department })))
      throw new HttpError(400, 'This employee’s department was also deleted — restore the department first');

    // Insert the original document as-is (keeps the same _id so history links work)
    await Model.collection.insertOne({ ...t.data, updatedAt: new Date() });
    await t.deleteOne();

    await notify(req, {
      action: 'restored',
      entity: t.kind,
      entityId: t.originalId,
      entityName: t.name,
      message: `${req.user.name} restored ${t.kind.toLowerCase()} "${t.name}" from the Recycle Bin`,
      meta: { deletedBy: t.deletedBy?.name, deletedAt: t.createdAt },
    });
    res.json({ ok: true });
  })
);

// Permanently delete one entry — Administrators only (Staff can soft-delete and restore)
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const t = await Trash.findByIdAndDelete(req.params.id);
    if (!t) throw new HttpError(404, 'Not found in Recycle Bin');
    await notify(req, {
      action: 'purged',
      entity: t.kind,
      entityId: t.originalId,
      entityName: t.name,
      message: `${req.user.name} permanently deleted ${t.kind.toLowerCase()} "${t.name}"`,
    });
    res.json({ ok: true });
  })
);

// Empty the whole bin — Administrators only
router.delete(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { deletedCount } = await Trash.deleteMany({});
    if (deletedCount)
      await notify(req, {
        action: 'purged',
        entity: 'Recycle Bin',
        message: `${req.user.name} emptied the Recycle Bin (${deletedCount} record${deletedCount === 1 ? '' : 's'} permanently deleted)`,
      });
    res.json({ ok: true, deletedCount });
  })
);

export default router;
