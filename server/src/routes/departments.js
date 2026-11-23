import { Router } from 'express';
import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import Assignment, { CLOSED } from '../models/Assignment.js';
import { asyncHandler, HttpError, pageParams, paged, pageArray } from '../utils/http.js';
import { blockWhenCrm } from '../services/crm.js';
import { diff, moveToTrash, notify } from '../services/audit.js';

const DEP_FIELDS = [['name', 'Name'], ['code', 'Code'], ['description', 'Description']];

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [departments, empCounts, itemCounts] = await Promise.all([
      Department.find().sort({ name: 1 }).lean(),
      Employee.aggregate([{ $group: { _id: '$department', count: { $sum: 1 } } }]),
      Assignment.aggregate([
        { $match: { status: { $nin: CLOSED } } },
        { $group: { _id: '$department', count: { $sum: { $subtract: ['$quantity', '$returnedQuantity'] } } } },
      ]),
    ]);
    const emp = Object.fromEntries(empCounts.map((e) => [String(e._id), e.count]));
    const items = Object.fromEntries(itemCounts.map((e) => [String(e._id), e.count]));
    const rows = departments.map((d) => ({ ...d, employeeCount: emp[String(d._id)] || 0, assignedItems: items[String(d._id)] || 0 }));
    const p = pageParams(req.query);
    res.json(p ? pageArray(rows, p) : rows);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    blockWhenCrm('Departments'); // managed in the CRM when the link is on
    const { name, code, description } = req.body;
    const dep = await Department.create({ name, code, description });
    await notify(req, {
      action: 'created', entity: 'Department', entityId: dep._id, entityName: dep.name,
      message: `${req.user.name} created department "${dep.name}"`,
      changes: diff({}, dep.toObject(), DEP_FIELDS),
    });
    res.status(201).json(dep);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    blockWhenCrm('Departments'); // managed in the CRM when the link is on
    const { name, code, description } = req.body;
    const before = await Department.findById(req.params.id).lean();
    if (!before) throw new HttpError(404, 'Department not found');
    const dep = await Department.findByIdAndUpdate(req.params.id, { name, code, description }, { new: true, runValidators: true });
    const changes = diff(before, dep.toObject(), DEP_FIELDS);
    if (changes.length)
      await notify(req, {
        action: 'updated', entity: 'Department', entityId: dep._id, entityName: dep.name,
        message: `${req.user.name} edited department "${dep.name}"`,
        changes,
      });
    res.json(dep);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    blockWhenCrm('Departments'); // managed in the CRM when the link is on
    if (await Employee.exists({ department: req.params.id }))
      throw new HttpError(400, 'Move or remove employees in this department first');
    const dep = await Department.findById(req.params.id);
    if (!dep) throw new HttpError(404, 'Department not found');
    await moveToTrash(req, 'Department', dep, dep.name);
    await notify(req, {
      action: 'deleted', entity: 'Department', entityId: dep._id, entityName: dep.name,
      message: `${req.user.name} deleted department "${dep.name}" (moved to Recycle Bin)`,
    });
    res.json({ ok: true });
  })
);

export default router;
