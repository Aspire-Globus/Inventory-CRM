import { Router } from 'express';
import Notification from '../models/Notification.js';
import { asyncHandler, pageParams, paged, pageArray } from '../utils/http.js';

// Mounted behind requireAuth + requirePerm(...)
const router = Router();

// You are never notified about your own changes: only other users' actions are listed / counted.
// (Changes made by "System" — no actor — are shown to everyone.)
const notMine = (me) => ({ 'actor.id': { $ne: me } });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = req.user._id;
    const { unread, entity, limit = 100 } = req.query;
    const filter = notMine(me);
    if (unread === 'true') filter.readBy = { $ne: me };
    if (entity) filter.entity = entity;
    const p = pageParams(req.query);
    const query = Notification.find(filter).sort({ createdAt: -1 });
    const [list, total] = await Promise.all([
      (p ? query.skip(p.skip).limit(p.limit) : query.limit(Math.min(Number(limit) || 100, 500))).lean(),
      p ? Notification.countDocuments(filter) : 0,
    ]);
    const rows = list.map(({ readBy, ...n }) => ({ ...n, read: readBy.some((id) => String(id) === String(me)) }));
    res.json(p ? paged(rows, total, p) : rows);
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ count: await Notification.countDocuments({ ...notMine(req.user._id), readBy: { $ne: req.user._id } }) });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ ...notMine(req.user._id), readBy: { $ne: req.user._id } }, { $addToSet: { readBy: req.user._id } });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await Notification.updateOne({ _id: req.params.id }, { $addToSet: { readBy: req.user._id } });
    res.json({ ok: true });
  })
);

export default router;
