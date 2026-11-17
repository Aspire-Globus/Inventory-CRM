import { Router } from 'express';
import Assignment, { CLOSED } from '../models/Assignment.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Item from '../models/Item.js';
import mongoose from 'mongoose';
import { isDamaged, details, recordFromReturn } from '../services/repairs.js';
import { asyncHandler, HttpError, escapeRegex, pageParams, paged, pageArray } from '../utils/http.js';
import { assignItem, returnItem, undoLastReturn } from '../services/stock.js';
import { notify } from '../services/audit.js';
import { fmtDay } from '../utils/http.js';

const router = Router();

// Filters shared by the list and the summary
// status: Active (still with the employee) | Assigned | Partially Returned | Returned
function listFilter({ status, search, item, department, category, employee }) {
  const filter = {};
  if (status === 'Active') filter.$expr = { $gt: ['$quantity', '$returnedQuantity'] }; // still holding something
  else if (status) filter.status = status;
  if (item && mongoose.isValidObjectId(item)) filter.item = new mongoose.Types.ObjectId(item);
  if (department && mongoose.isValidObjectId(department)) filter.department = new mongoose.Types.ObjectId(department);
  if (employee && mongoose.isValidObjectId(employee)) filter.employee = new mongoose.Types.ObjectId(employee);
  if (category) filter.category = category;
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ employeeCode: rx }, { employeeName: rx }, { itemName: rx }];
  }
  return filter;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { limit = 2000 } = req.query;
    const filter = listFilter(req.query);
    const p = pageParams(req.query);
    if (p) {
      const [rows, total] = await Promise.all([
        Assignment.find(filter).sort({ issueDate: -1, createdAt: -1 }).skip(p.skip).limit(p.limit),
        Assignment.countDocuments(filter),
      ]);
      return res.json(paged(rows, total, p));
    }
    res.json(await Assignment.find(filter).sort({ issueDate: -1, createdAt: -1 }).limit(Math.min(Number(limit) || 2000, 5000)));
  })
);

// Per department: how many units are out, to how many employees (same filters as the list)
//   GET /api/assignments/summary?status=Active&category=System
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { department, ...rest } = req.query; // the summary always covers every department
    const match = listFilter({ status: 'Active', ...rest });
    const rows = await Assignment.aggregate([
      { $match: match },
      { $project: { department: 1, departmentName: 1, employee: 1, out: { $subtract: ['$quantity', '$returnedQuantity'] } } },
      { $group: { _id: { id: '$department', name: '$departmentName' }, quantity: { $sum: '$out' }, employees: { $addToSet: '$employee' }, assignments: { $sum: 1 } } },
      { $project: { _id: 0, departmentId: '$_id.id', department: '$_id.name', quantity: 1, employees: { $size: '$employees' }, assignments: 1 } },
      { $sort: { quantity: -1, department: 1 } },
    ]);
    const allEmployees = await Assignment.distinct('employee', match);
    res.json({
      total: {
        quantity: rows.reduce((n, r) => n + r.quantity, 0),
        employees: allEmployees.length,
        assignments: rows.reduce((n, r) => n + r.assignments, 0),
        departments: rows.length,
      },
      departments: rows,
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const a = await Assignment.findById(req.params.id);
    if (!a) throw new HttpError(404, 'Assignment not found');
    res.json(a);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { itemId, employeeId, employeeCode, employeeName, departmentId, designation, location, quantity, issueDate, notes } = req.body;
    if (!itemId) throw new HttpError(400, 'Item is required');
    if (!employeeId && !employeeCode) throw new HttpError(400, 'Employee ID is required');
    const result = await assignItem({
      itemId, employeeId, employeeCode, employeeName, departmentId, designation, location, quantity, issueDate, notes,
    });
    const a = result.assignment;
    await notify(req, {
      action: 'assigned', entity: 'Assignment', entityId: a._id, entityName: a.itemName,
      message: `${req.user.name} assigned ${a.quantity} × ${a.itemName} to ${a.employeeName} (${a.employeeCode}, ${a.departmentName})`,
      changes: [
        { field: 'Item', from: '—', to: `${a.itemName} (${a.category})` },
        { field: 'Quantity', from: '—', to: String(a.quantity) },
        { field: 'Employee', from: '—', to: `${a.employeeName} (${a.employeeCode})` },
        { field: 'Department', from: '—', to: a.departmentName },
        { field: 'Issue date', from: '—', to: fmtDay(a.issueDate) },
        { field: 'Stock available', from: String(result.item.availableQuantity + a.quantity), to: String(result.item.availableQuantity) },
        ...(a.notes ? [{ field: 'Notes', from: '—', to: a.notes }] : []),
      ],
      meta: { newEmployeeCreated: result.employeeCreated },
    });
    if (result.employeeCreated)
      await notify(req, {
        action: 'created', entity: 'Employee', entityId: result.employee._id, entityName: `${a.employeeName} (${a.employeeCode})`,
        message: `${req.user.name} added new employee ${a.employeeName} (${a.employeeCode}) to ${a.departmentName} while assigning`,
      });
    res.status(201).json(result);
  })
);

router.post(
  '/:id/return',
  asyncHandler(async (req, res) => {
    const { quantity, returnDate, condition, notes } = req.body;
    if (condition && !['Good', 'Damaged', 'Faulty', 'Lost'].includes(condition)) throw new HttpError(400, 'Condition must be Good, Damaged or Lost');
    if (isDamaged(condition)) details(req.body, { needPhoto: true }); // check damage details (photo required) before anything changes
    const a = await returnItem({ assignmentId: req.params.id, quantity, returnDate, condition, notes });
    const r = a.returns[a.returns.length - 1];
    // Damaged -> Repairs page (not back on the shelf). Lost -> written off.
    const repair = isDamaged(r.condition) || r.condition === 'Lost' ? await recordFromReturn(a, r, req.body) : null;
    await notify(req, {
      action: 'returned', entity: 'Assignment', entityId: a._id, entityName: a.itemName,
      message: `${req.user.name} recorded return of ${r.quantity} × ${a.itemName} from ${a.employeeName} (${a.employeeCode})${r.condition !== 'Good' ? ` — ${r.condition}` : ''}`,
      changes: [
        { field: 'Returned quantity', from: '—', to: String(r.quantity) },
        { field: 'Condition', from: '—', to: r.condition },
        { field: 'Still holding', from: String(a.outstandingQuantity + r.quantity), to: String(a.outstandingQuantity) },
        { field: 'Return date', from: '—', to: fmtDay(r.returnDate) },
        ...(repair?.damageType ? [{ field: 'Damage type', from: '—', to: repair.damageType }] : []),
        ...(repair ? [{ field: 'Goes to', from: '—', to: repair.status === 'Lost' ? 'Written off (lost)' : 'Repairs → Damaged (not back in stock)' }] : []),
        ...(r.notes ? [{ field: 'Notes', from: '—', to: r.notes }] : []),
      ],
    });
    res.json(repair ? { ...a.toJSON(), repair } : a);
  })
);

// Move an item straight from one employee to another (no separate return + assign).
// Body: { quantity?, employeeId }  or  { quantity?, employeeCode, departmentId, employeeName? (new ID) }, date?, notes?
router.post(
  '/:id/reassign',
  asyncHandler(async (req, res) => {
    const { employeeId, employeeCode, employeeName, departmentId, designation, location, date, notes } = req.body;
    const from = await Assignment.findById(req.params.id);
    if (!from) throw new HttpError(404, 'Assignment not found');
    const holding = from.quantity - from.returnedQuantity;
    if (holding < 1) throw new HttpError(400, 'This assignment is already fully returned');
    const qty = req.body.quantity === undefined || req.body.quantity === '' ? holding : Number(req.body.quantity);
    if (!Number.isInteger(qty) || qty < 1) throw new HttpError(400, 'Quantity must be a whole number of 1 or more');
    if (qty > holding) throw new HttpError(400, `${from.employeeName} only holds ${holding}`);

    const item = await Item.findById(from.item);
    if (!item) throw new HttpError(404, 'Item not found');
    if (item.status === 'Inactive') throw new HttpError(400, `${item.name} is Inactive — return it instead, or make it Active first`);

    // Check the new employee before touching any stock
    let target;
    if (employeeId) {
      target = await Employee.findById(employeeId).populate('department');
      if (!target) throw new HttpError(404, 'New employee not found');
    } else {
      const code = String(employeeCode || '').trim().toUpperCase();
      if (!code) throw new HttpError(400, 'Choose the employee to reassign to');
      target = await Employee.findOne({ employeeId: code }).populate('department');
      if (!target) {
        if (!departmentId || !(await Department.exists({ _id: departmentId }))) throw new HttpError(400, 'Department is required for a new Employee ID');
        if (!String(employeeName || '').trim()) throw new HttpError(400, 'Employee name is required for a new Employee ID');
      }
    }
    if (target) {
      if (String(target._id) === String(from.employee)) throw new HttpError(400, `${target.name} already has this item`);
      if (target.status !== 'Active') throw new HttpError(400, `${target.name} is inactive`);
    }

    const day = date || new Date().toISOString().slice(0, 10);
    const newDept = target ? target.department?.name || '' : (await Department.findById(departmentId))?.name || '';
    const to = {
      employee: target?._id,
      employeeCode: target ? target.employeeId : String(employeeCode).trim().toUpperCase(),
      employeeName: target ? target.name : String(employeeName).trim(),
      departmentName: newDept,
    };
    const toLabel = `${to.employeeName} (${to.employeeCode})`;
    const fromLabel = `${from.employeeName} (${from.employeeCode})`;

    // 1) take it back from the current holder, marked as a transfer (status → Transferred / Partially Returned)
    await returnItem({
      assignmentId: from._id, quantity: qty, returnDate: day, condition: 'Good',
      notes: `Reassigned to ${toLabel}${notes ? ` — ${notes}` : ''}`, transfer: to,
    });
    // 2) give it to the new employee, remembering where it came from
    let result;
    try {
      result = await assignItem({
        itemId: from.item, quantity: qty, issueDate: day, notes: `Reassigned from ${fromLabel}${notes ? ` — ${notes}` : ''}`,
        transferredFrom: { assignment: from._id, employee: from.employee, employeeCode: from.employeeCode, employeeName: from.employeeName, departmentName: from.departmentName },
        ...(target ? { employeeId: target._id } : { employeeCode, employeeName, departmentId, designation, location }),
      });
    } catch (err) {
      await undoLastReturn(from._id); // nothing changes for the current holder
      throw err;
    }
    // Link the transfer to the new assignment
    await Assignment.updateOne(
      { _id: from._id },
      { $set: { 'returns.$[r].transfer.assignment': result.assignment._id, 'returns.$[r].transfer.employee': result.employee._id } },
      { arrayFilters: [{ 'r.transfer.employeeCode': to.employeeCode, 'r.transfer.assignment': { $exists: false } }] }
    );

    const a = result.assignment;
    await notify(req, {
      action: 'reassigned', entity: 'Assignment', entityId: a._id, entityName: a.itemName,
      message: `${req.user.name} reassigned ${qty} × ${a.itemName} from ${fromLabel} to ${a.employeeName} (${a.employeeCode})`,
      changes: [
        { field: 'Item', from: a.itemName, to: a.itemName },
        { field: 'Quantity', from: String(qty), to: String(qty) },
        { field: 'Employee', from: fromLabel, to: `${a.employeeName} (${a.employeeCode})` },
        { field: 'Department', from: from.departmentName, to: a.departmentName },
        { field: 'Date', from: '—', to: fmtDay(a.issueDate) },
        ...(notes ? [{ field: 'Notes', from: '—', to: notes }] : []),
      ],
    });
    res.status(201).json({ from: await Assignment.findById(from._id), to: a, employee: result.employee, employeeCreated: result.employeeCreated });
  })
);

export default router;
