import Item, { AVAILABLE_EXPR } from '../models/Item.js';
import Repair, { OPEN_REPAIR } from '../models/Repair.js';
import Employee from '../models/Employee.js';
import Assignment, { statusFor } from '../models/Assignment.js';
import Activity from '../models/Activity.js';
import Department from '../models/Department.js';
import { crmEnabled, employeeByCode } from './crm.js';
import { HttpError, toInt } from '../utils/http.js';

/**
 * Stock changes use atomic conditional updates so two admins assigning at the
 * same moment can never push Assigned above Total — works on a standalone
 * MongoDB (no replica set / transactions required).
 */

/**
 * Find the employee by Employee ID within the selected department.
 * If the ID doesn't exist yet, create the employee (employees are added from
 * the Assign screen — there is no separate "Add Employee" step).
 */
async function resolveEmployee({ employeeId, employeeCode, employeeName, departmentId, designation, location }) {
  if (employeeId) {
    const emp = await Employee.findById(employeeId).populate('department');
    if (!emp) throw new HttpError(404, 'Employee not found');
    return { employee: emp, created: false };
  }

  const code = String(employeeCode || '').trim().toUpperCase();
  if (!code) throw new HttpError(400, 'Employee ID is required');
  // CRM link on: the employee (and their department) comes from the CRM — no new employees are made here
  if (crmEnabled()) {
    const emp = await employeeByCode(code);
    if (!emp) throw new HttpError(404, `Employee ID ${code} was not found in the CRM`);
    if (emp.status !== 'Active') throw new HttpError(400, `${emp.name} (${code}) is inactive in the CRM`);
    return { employee: emp, created: false };
  }
  if (!departmentId) throw new HttpError(400, 'Department is required');
  const department = await Department.findById(departmentId);
  if (!department) throw new HttpError(400, 'Department not found');

  const existing = await Employee.findOne({ employeeId: code }).populate('department');
  if (existing) {
    if (String(existing.department?._id) !== String(department._id))
      throw new HttpError(400, `${code} (${existing.name}) belongs to ${existing.department?.name || 'another'} department`);
    return { employee: existing, created: false };
  }

  const name = String(employeeName || '').trim();
  if (!name) throw new HttpError(400, 'Employee name is required for a new Employee ID');
  const emp = await Employee.create({
    employeeId: code,
    name,
    department: department._id,
    designation: designation || '',
    location: location || '',
  });
  await emp.populate('department');
  return { employee: emp, created: true };
}

export async function assignItem({ itemId, quantity, issueDate, notes, transferredFrom, ...who }) {
  const qty = toInt(quantity, 'Quantity');

  // Check stock before creating any new employee record
  const check = await Item.findById(itemId);
  if (!check) throw new HttpError(404, 'Item not found');
  if (check.status === 'Inactive') throw new HttpError(400, `${check.name} is Inactive — make it Active before assigning it`);
  if (check.availableQuantity < qty)
    throw new HttpError(400, `Only ${check.availableQuantity} ${check.unit} of ${check.name} available`);

  const { employee, created } = await resolveEmployee(who);
  if (employee.status !== 'Active') throw new HttpError(400, 'Cannot assign items to an inactive employee');

  // Reserve stock only if enough is available (atomic)
  const item = await Item.findOneAndUpdate(
    { _id: itemId, $expr: { $gte: [AVAILABLE_EXPR, qty] } },
    { $inc: { assignedQuantity: qty } },
    { new: true }
  );
  if (!item) {
    if (created) await Employee.deleteOne({ _id: employee._id });
    const exists = await Item.findById(itemId);
    throw new HttpError(400, `Only ${exists.availableQuantity} ${exists.unit} of ${exists.name} available`);
  }

  try {
    const assignment = await Assignment.create({
      item: item._id,
      employee: employee._id,
      itemName: item.name,
      category: item.category,
      employeeCode: employee.employeeId,
      employeeName: employee.name,
      department: employee.department?._id,
      departmentName: employee.department?.name || '',
      quantity: qty,
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      notes: notes || '',
      ...(transferredFrom && { transferredFrom }),
    });
    await Activity.create({
      type: 'ASSIGN',
      item: item._id,
      itemName: item.name,
      employee: employee._id,
      employeeCode: employee.employeeId,
      employeeName: employee.name,
      departmentName: assignment.departmentName,
      assignment: assignment._id,
      quantity: qty,
      notes: assignment.notes,
      date: assignment.issueDate,
    });
    return { assignment, item, employee, employeeCreated: created };
  } catch (err) {
    // Roll back the reservation (and any new employee) if the record could not be saved
    await Item.updateOne({ _id: item._id }, { $inc: { assignedQuantity: -qty } });
    if (created) await Employee.deleteOne({ _id: employee._id });
    throw err;
  }
}

export async function returnItem({ assignmentId, quantity, returnDate, condition, notes, transfer }) {
  const qty = toInt(quantity, 'Return quantity');
  const entry = {
    quantity: qty,
    returnDate: returnDate ? new Date(returnDate) : new Date(),
    condition: condition || 'Good',
    notes: notes || '',
    ...(transfer && { transfer }),
  };

  // Only succeeds if the employee still holds at least `qty`
  const assignment = await Assignment.findOneAndUpdate(
    { _id: assignmentId, $expr: { $gte: [{ $subtract: ['$quantity', '$returnedQuantity'] }, qty] } },
    { $inc: { returnedQuantity: qty, ...(transfer && { transferredQuantity: qty }) }, $push: { returns: entry } },
    { new: true }
  );
  if (!assignment) {
    const exists = await Assignment.findById(assignmentId);
    if (!exists) throw new HttpError(404, 'Assignment not found');
    throw new HttpError(400, `Employee only holds ${exists.outstandingQuantity} of this item`);
  }

  // Stock back first, then the status — plain updates, so nothing can leave a half-finished return
  await Item.updateOne({ _id: assignment.item }, { $inc: { assignedQuantity: -qty } });
  assignment.status = statusFor(assignment);
  await Assignment.updateOne({ _id: assignment._id }, { $set: { status: assignment.status } });
  await Activity.create({
    type: 'RETURN',
    item: assignment.item,
    itemName: assignment.itemName,
    employee: assignment.employee,
    employeeCode: assignment.employeeCode,
    employeeName: assignment.employeeName,
    departmentName: assignment.departmentName,
    assignment: assignment._id,
    quantity: qty,
    notes: [entry.condition !== 'Good' ? entry.condition : '', entry.notes].filter(Boolean).join(' — '),
    date: entry.returnDate,
  });
  return assignment;
}

/** Undo the last return of an assignment (used when a reassignment can't be completed). */
export async function undoLastReturn(assignmentId) {
  const a = await Assignment.findById(assignmentId);
  const last = a?.returns[a.returns.length - 1];
  if (!last) return;
  const qty = last.quantity;
  // Take the units off the shelf again (only if still available)
  const ok = await Item.findOneAndUpdate(
    { _id: a.item, $expr: { $gte: [AVAILABLE_EXPR, qty] } },
    { $inc: { assignedQuantity: qty } }
  );
  if (!ok) return;
  a.returns.pop();
  a.returnedQuantity -= qty;
  if (last.transfer) a.transferredQuantity = Math.max(0, a.transferredQuantity - qty);
  a.status = statusFor(a);
  await a.save();
  await Activity.deleteOne({ assignment: a._id, type: 'RETURN', quantity: qty, date: last.returnDate });
}

/**
 * Startup check: makes every assignment's status match its numbers (e.g. "Assigned" with nothing
 * left becomes Returned / Transferred) and every item's Assigned count match what employees hold.
 */
export async function syncAssignments() {
  const all = await Assignment.find({}, { quantity: 1, returnedQuantity: 1, transferredQuantity: 1, status: 1, item: 1 }).lean();
  const fix = all
    .map((a) => ({ a, status: statusFor({ ...a, transferredQuantity: a.transferredQuantity || 0 }) }))
    .filter(({ a, status }) => a.status !== status || a.transferredQuantity === undefined)
    .map(({ a, status }) => ({ updateOne: { filter: { _id: a._id }, update: { $set: { status, transferredQuantity: a.transferredQuantity || 0 } } } }));
  if (fix.length) await Assignment.bulkWrite(fix);

  const held = {};
  all.forEach((a) => (held[a.item] = (held[a.item] || 0) + Math.max(0, a.quantity - a.returnedQuantity)));
  // Damaged + In repair units per item
  const broken = {};
  (await Repair.find({ status: { $in: OPEN_REPAIR } }, { item: 1, quantity: 1 }).lean()).forEach((r) => (broken[r.item] = (broken[r.item] || 0) + r.quantity));
  const items = await Item.find({}, { assignedQuantity: 1, outOfServiceQuantity: 1, name: 1 }).lean();
  const itemFix = items
    .filter((i) => (held[i._id] || 0) !== i.assignedQuantity || (broken[i._id] || 0) !== (i.outOfServiceQuantity ?? -1))
    .map((i) => ({ updateOne: { filter: { _id: i._id }, update: { $set: { assignedQuantity: held[i._id] || 0, outOfServiceQuantity: broken[i._id] || 0 } } } }));
  if (itemFix.length) await Item.bulkWrite(itemFix);

  if (fix.length || itemFix.length)
    console.log(`Synced ${fix.length} assignment status(es) and ${itemFix.length} item stock count(s)`);
}
