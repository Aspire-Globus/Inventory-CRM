import { Router } from 'express';
import Employee from '../models/Employee.js';
import Assignment, { CLOSED } from '../models/Assignment.js';
import Activity from '../models/Activity.js';
import Department from '../models/Department.js';
import mongoose from 'mongoose';
import { asyncHandler, HttpError, escapeRegex, pageParams, paged, pageArray } from '../utils/http.js';
import { diff, moveToTrash, notify } from '../services/audit.js';

const EMP_FIELDS = [
  ['employeeId', 'Employee ID'], ['name', 'Name'], ['department', 'Department'], ['designation', 'Designation'],
  ['location', 'Location'], ['email', 'Email'], ['phone', 'Phone'], ['status', 'Status'],
];

const router = Router();

const pick = (b) => ({
  employeeId: b.employeeId,
  name: b.name,
  department: b.department,
  designation: b.designation,
  location: b.location,
  email: b.email,
  phone: b.phone,
  status: b.status,
});

// department may be sent as its _id, its name ("Information Technology") or its code ("IT")
async function resolveDepartment(data) {
  const v = typeof data.department === 'string' ? data.department.trim() : data.department;
  if (!v || mongoose.isValidObjectId(v)) return;
  const dep = await Department.findOne({
    $or: [{ name: new RegExp(`^${escapeRegex(v)}$`, 'i') }, { code: new RegExp(`^${escapeRegex(v)}$`, 'i') }],
  });
  if (!dep) throw new HttpError(400, `Department "${v}" not found. Send the department _id, name or code.`);
  data.department = dep._id;
}

async function nextEmployeeId() {
  const last = await Employee.find({ employeeId: /^EMP-\d+$/ }).sort({ employeeId: -1 }).limit(1);
  const n = last.length ? parseInt(last[0].employeeId.slice(4), 10) + 1 : 1;
  return `EMP-${String(n).padStart(5, '0')}`;
}

router.get('/next-id', asyncHandler(async (req, res) => res.json({ employeeId: await nextEmployeeId() })));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search, department, status } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (status) filter.status = status;
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: 'i' };
      filter.$or = [{ employeeId: rx }, { name: rx }];
    }
    const p = pageParams(req.query);
    const query = Employee.find(filter).populate('department', 'name').sort({ employeeId: 1 });
    const [employees, total] = await Promise.all([
      p ? query.skip(p.skip).limit(p.limit).lean() : query.lean(),
      p ? Employee.countDocuments(filter) : 0,
    ]);

    const counts = await Assignment.aggregate([
      { $match: { employee: { $in: employees.map((e) => e._id) }, status: { $nin: CLOSED } } },
      { $group: { _id: '$employee', count: { $sum: { $subtract: ['$quantity', '$returnedQuantity'] } } } },
    ]);
    const map = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
    const rows = employees.map((e) => ({ ...e, assignedCount: map[String(e._id)] || 0 }));
    res.json(p ? paged(rows, total, p) : rows);
  })
);

// Look up by Employee ID code (e.g. EMP-00125) or Mongo id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const query = /^[a-f\d]{24}$/i.test(id) ? { _id: id } : { employeeId: id.toUpperCase() };
    const employee = await Employee.findOne(query).populate('department', 'name');
    if (!employee) throw new HttpError(404, 'Employee not found');

    const [assignments, history] = await Promise.all([
      Assignment.find({ employee: employee._id }).sort({ issueDate: -1, createdAt: -1 }),
      Activity.find({ employee: employee._id }).sort({ date: -1, createdAt: -1 }),
    ]);
    res.json({ employee, assignments, history });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = pick(req.body);
    await resolveDepartment(data);
    if (!data.employeeId) data.employeeId = await nextEmployeeId();
    const emp = await Employee.create(data);
    await emp.populate('department', 'name');
    await notify(req, {
      action: 'created', entity: 'Employee', entityId: emp._id, entityName: `${emp.name} (${emp.employeeId})`,
      message: `${req.user.name} added employee ${emp.name} (${emp.employeeId}) to ${emp.department?.name}`,
      changes: diff({}, emp.toObject(), EMP_FIELDS),
    });
    res.status(201).json(emp);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = pick(req.body);
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    await resolveDepartment(data);
    const before = await Employee.findById(req.params.id).populate('department', 'name').lean();
    if (!before) throw new HttpError(404, 'Employee not found');
    const emp = await Employee.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true }).populate('department', 'name');
    const changes = diff(before, emp.toObject(), EMP_FIELDS);
    if (changes.length)
      await notify(req, {
        action: 'updated', entity: 'Employee', entityId: emp._id, entityName: `${emp.name} (${emp.employeeId})`,
        message: `${req.user.name} edited employee ${emp.name} (${emp.employeeId})`,
        changes,
      });
    res.json(emp);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const emp = await Employee.findById(req.params.id).populate('department', 'name');
    if (!emp) throw new HttpError(404, 'Employee not found');
    if (await Assignment.exists({ employee: emp._id, status: { $nin: CLOSED } }))
      throw new HttpError(400, `${emp.name} still holds company items — record the returns first`);
    await moveToTrash(req, 'Employee', emp, `${emp.name} (${emp.employeeId})`);
    await notify(req, {
      action: 'deleted', entity: 'Employee', entityId: emp._id, entityName: `${emp.name} (${emp.employeeId})`,
      message: `${req.user.name} deleted employee ${emp.name} (${emp.employeeId}, ${emp.department?.name}) — moved to Recycle Bin`,
    });
    res.json({ ok: true });
  })
);

export default router;
