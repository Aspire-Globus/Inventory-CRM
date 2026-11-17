import { Router } from 'express';
import mongoose from 'mongoose';
import Repair, { DAMAGE_TYPES, REPAIR_BY } from '../models/Repair.js';
import Assignment from '../models/Assignment.js';
import { returnItem } from '../services/stock.js';
import { closeRepair, details, recordFromReturn, recordFromStock, sendToRepair } from '../services/repairs.js';
import { notify } from '../services/audit.js';
import { asyncHandler, escapeRegex, fmtDay, HttpError, pageParams, paged } from '../utils/http.js';

// Mounted at /api/repairs behind requireAuth + writePerm('inventory')
const router = Router();

const TABS = {
  Damaged: ['Damaged'],
  'In repair': ['In repair'],
  Repaired: ['Repaired'],
  Scrapped: ['Scrapped', 'Lost'], // everything written off
  Done: ['Repaired', 'Scrapped', 'Lost'], // board column 3
};
const money = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);
const lean = (r) => (r.toJSON ? r.toJSON() : r);

function listFilter({ status, search, department, item, from }) {
  const f = {};
  // from=YYYY-MM-DD: only records closed on/after that day (board "Done this month")
  if (from && !Number.isNaN(Date.parse(from))) f['result.date'] = { $gte: new Date(from) };
  if (status) {
    const s = TABS[status] || [status];
    f.status = { $in: s };
  }
  if (department && mongoose.isValidObjectId(department)) f.department = department;
  if (item && mongoose.isValidObjectId(item)) f.item = item;
  if (search) {
    const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
    f.$or = [{ itemName: rx }, { employeeName: rx }, { employeeCode: rx }, { 'repair.vendor': rx }, { damageType: rx }, { category: rx }];
  }
  return f;
}

// Options for the forms
router.get('/options', (req, res) => res.json({ damageTypes: DAMAGE_TYPES, repairBy: REPAIR_BY, responsible: ['Normal wear', 'Employee'] }));

// Counts for the cards on top of the Repairs page
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [byStatus, overdue, month, done] = await Promise.all([
      Repair.aggregate([{ $group: { _id: '$status', records: { $sum: 1 }, quantity: { $sum: '$quantity' } } }]),
      Repair.countDocuments({ status: 'In repair', 'repair.expectedAt': { $lt: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      Repair.aggregate([
        { $match: { status: 'Repaired', 'result.date': { $gte: monthStart } } },
        { $group: { _id: null, records: { $sum: 1 }, spent: { $sum: { $ifNull: ['$result.finalCost', 0] } } } },
      ]),
      Repair.countDocuments({ status: { $in: ['Repaired', 'Scrapped', 'Lost'] }, 'result.date': { $gte: monthStart } }),
    ]);
    const n = Object.fromEntries(byStatus.map((s) => [s._id, s.records]));
    res.json({
      damaged: n.Damaged || 0,        // waiting, not sent yet
      inRepair: n['In repair'] || 0,
      overdue,                         // in repair, past expected date
      repairedThisMonth: month[0]?.records || 0,
      spentThisMonth: month[0]?.spent || 0,
      repaired: n.Repaired || 0,
      scrapped: n.Scrapped || 0,
      lost: n.Lost || 0,
      writtenOff: (n.Scrapped || 0) + (n.Lost || 0),
      doneThisMonth: done,               // board column 3 (repaired + scrapped + lost this month)
      needsAction: (n.Damaged || 0) + (n['In repair'] || 0), // badge on the menu
    });
  })
);

// Vendors used before, most recent first (chips in "Send to repair")
router.get(
  '/vendors',
  asyncHandler(async (req, res) => {
    const rows = await Repair.aggregate([
      { $match: { 'repair.vendor': { $nin: [null, ''] } } },
      { $group: { _id: '$repair.vendor', last: { $max: '$repair.sentAt' }, times: { $sum: 1 } } },
      { $sort: { last: -1 } },
      { $limit: 12 },
    ]);
    res.json(rows.map((r) => ({ name: r._id, times: r.times, lastUsed: r.last })));
  })
);

// GET /api/repairs?status=Damaged|In repair|Repaired|Scrapped&department=<id>&search=&page=&limit=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = listFilter(req.query);
    const p = pageParams(req.query);
    // Photos are big: only sent with withPhoto=1 (the board shows them on open cards)
    const q = Repair.find(filter).select(req.query.withPhoto === '1' ? '' : '-photo').sort({ reportedAt: -1, createdAt: -1 });
    if (!p) return res.json((await q).map(lean));
    const [rows, total] = await Promise.all([q.skip(p.skip).limit(p.limit), Repair.countDocuments(filter)]);
    res.json(paged(rows.map(lean), total, p));
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const r = await Repair.findById(req.params.id);
    if (!r) throw new HttpError(404, 'Repair record not found');
    res.json(r);
  })
);

// Report damage / loss.
// With assignmentId: the employee still has it -> taken back now as Damaged (or Lost).
// With itemId: found damaged / missing in office stock.
// Body: { assignmentId | itemId, quantity, lost?, damageType?, description?, responsible?, photo?, date? }
router.post(
  '/report',
  asyncHandler(async (req, res) => {
    const { assignmentId, itemId, quantity, lost } = req.body;
    details(req.body, { needPhoto: !lost }); // photo required for damage
    let repair;
    if (assignmentId) {
      const a = await returnItem({
        assignmentId, quantity, returnDate: req.body.date, condition: lost ? 'Lost' : 'Damaged',
        notes: req.body.description || (lost ? 'Reported lost' : 'Reported damaged'),
      });
      repair = await recordFromReturn(a, a.returns[a.returns.length - 1], req.body);
    } else if (itemId) {
      repair = await recordFromStock({ ...req.body, itemId, lost: !!lost });
    } else throw new HttpError(400, 'Send assignmentId (item with an employee) or itemId (office stock)');

    const who = repair.employeeName ? `${repair.employeeName} (${repair.employeeCode})` : 'office stock';
    await notify(req, {
      action: lost ? 'lost' : 'damaged', entity: 'Repair', entityId: repair._id, entityName: repair.itemName,
      message: `${req.user.name} reported ${repair.quantity} × ${repair.itemName} ${lost ? 'lost' : 'damaged'} — from ${who}`,
      changes: [
        { field: 'Item', from: '—', to: `${repair.itemName} (${repair.category})` },
        { field: 'Quantity', from: '—', to: String(repair.quantity) },
        { field: 'From', from: '—', to: who },
        ...(repair.damageType ? [{ field: 'Damage type', from: '—', to: repair.damageType }] : []),
        { field: 'Responsible', from: '—', to: repair.responsible },
        { field: 'Status', from: assignmentId ? 'With employee' : 'In stock', to: lost ? 'Written off (lost)' : 'Damaged' },
        ...(repair.description ? [{ field: 'Notes', from: '—', to: repair.description }] : []),
      ],
    });
    res.status(201).json(repair);
  })
);

// Damaged -> In repair. Body: { by, vendor, contact?, jobNo?, sentAt?, expectedAt?, estimatedCost?, notes? }
router.post(
  '/:id/send',
  asyncHandler(async (req, res) => {
    const r = await sendToRepair(req.params.id, req.body);
    await notify(req, {
      action: 'sent_to_repair', entity: 'Repair', entityId: r._id, entityName: r.itemName,
      message: `${req.user.name} sent ${r.quantity} × ${r.itemName} for repair to ${r.repair.vendor || r.repair.by}`,
      changes: [
        { field: 'Status', from: 'Damaged', to: 'In repair' },
        { field: 'Repair by', from: '—', to: r.repair.vendor ? `${r.repair.vendor} (${r.repair.by})` : r.repair.by },
        { field: 'Expected back', from: '—', to: r.repair.expectedAt ? fmtDay(r.repair.expectedAt) : '—' },
        { field: 'Estimated cost', from: '—', to: money(r.repair.estimatedCost) },
        ...(r.repair.jobNo ? [{ field: 'Job / ticket no.', from: '—', to: r.repair.jobNo }] : []),
      ],
    });
    res.json(r);
  })
);

// In repair / Damaged -> Repaired (back in stock) or Scrapped (written off).
// Body: { outcome: 'Repaired' | 'Not repaired' | 'Scrapped', date?, finalCost?, notes? }
// Not repaired = vendor gave it back unfixed -> back to Damaged (send again or scrap)
router.post(
  '/:id/result',
  asyncHandler(async (req, res) => {
    const before = await Repair.findById(req.params.id).select('status');
    const r = await closeRepair(req.params.id, req.body);
    if (r.status === 'Damaged') {
      const t = r.attempts[r.attempts.length - 1];
      await notify(req, {
        action: 'not_repaired', entity: 'Repair', entityId: r._id, entityName: r.itemName,
        message: `${req.user.name} got ${r.quantity} × ${r.itemName} back from ${t.vendor} NOT repaired — back to Damaged`,
        changes: [
          { field: 'Status', from: 'In repair', to: 'Damaged (not repaired)' },
          { field: 'Vendor', from: '—', to: t.vendor || '—' },
          ...(t.cost != null ? [{ field: 'Amount paid', from: '—', to: money(t.cost) }] : []),
          ...(t.notes ? [{ field: 'Notes', from: '—', to: t.notes }] : []),
        ],
      });
      return res.json(r);
    }
    const fixed = r.status === 'Repaired';
    await notify(req, {
      action: fixed ? 'repaired' : 'scrapped', entity: 'Repair', entityId: r._id, entityName: r.itemName,
      message: `${req.user.name} marked ${r.quantity} × ${r.itemName} ${fixed ? 'repaired — back in stock' : 'scrapped — written off'}`,
      changes: [
        { field: 'Status', from: before?.status || '—', to: r.status },
        { field: 'Stock', from: 'Not usable', to: fixed ? `${r.quantity} back in stock` : `${r.quantity} removed from total` },
        ...(r.result.finalCost != null ? [{ field: 'Final cost', from: money(r.repair?.estimatedCost), to: money(r.result.finalCost) }] : []),
        ...(r.result.notes ? [{ field: 'Notes', from: '—', to: r.result.notes }] : []),
      ],
    });
    res.json(r);
  })
);

export default router;
