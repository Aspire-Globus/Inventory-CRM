import Item, { AVAILABLE_EXPR } from '../models/Item.js';
import Repair, { DAMAGE_TYPES, OLD_DAMAGE_TYPES } from '../models/Repair.js';
import { HttpError, toInt } from '../utils/http.js';

const clean = (v) => String(v ?? '').trim();

export const isDamaged = (condition) => ['Damaged', 'Faulty'].includes(condition);

export function details(body, { needPhoto = false } = {}) {
  const damageType = clean(body.damageType);
  if (needPhoto && !body.photo) throw new HttpError(400, 'Add a photo of the damage');
  if (damageType && !DAMAGE_TYPES.includes(damageType) && !OLD_DAMAGE_TYPES.includes(damageType)) throw new HttpError(400, `Damage type must be one of: ${DAMAGE_TYPES.join(', ')}`);
  return {
    damageType,
    description: clean(body.description ?? body.notes),
    responsible: body.responsible === 'Employee' ? 'Employee' : 'Normal wear',
    photo: body.photo || '',
  };
}

/**
 * Called right after a return with condition Damaged/Faulty or Lost.
 * The units were just taken off the employee, so they are free on the item now.
 */
export async function recordFromReturn(assignment, ret, body = {}) {
  const lost = ret.condition === 'Lost';
  const qty = ret.quantity;
  const repair = await Repair.create({
    item: assignment.item,
    itemName: assignment.itemName,
    category: assignment.category,
    quantity: qty,
    assignment: assignment._id,
    employee: assignment.employee,
    employeeCode: assignment.employeeCode,
    employeeName: assignment.employeeName,
    department: assignment.department,
    departmentName: assignment.departmentName,
    ...details({ ...body, description: body.description ?? ret.notes }),
    reportedAt: ret.returnDate,
    status: lost ? 'Lost' : 'Damaged',
    ...(lost && { result: { outcome: 'Lost', date: ret.returnDate, notes: ret.notes } }),
  });
  await Item.updateOne({ _id: assignment.item }, lost ? { $inc: { totalQuantity: -qty } } : { $inc: { outOfServiceQuantity: qty } });
  return repair;
}

/** Damage / loss found in office stock (not with any employee). */
export async function recordFromStock({ itemId, quantity, lost, ...body }) {
  const qty = toInt(quantity, 'Quantity');
  const item = await Item.findOneAndUpdate(
    { _id: itemId, $expr: { $gte: [AVAILABLE_EXPR, qty] } },
    lost ? { $inc: { totalQuantity: -qty } } : { $inc: { outOfServiceQuantity: qty } },
    { new: true }
  );
  if (!item) {
    const exists = await Item.findById(itemId);
    if (!exists) throw new HttpError(404, 'Item not found');
    throw new HttpError(400, `Only ${exists.availableQuantity} ${exists.unit} of ${exists.name} on the shelf`);
  }
  const date = body.date ? new Date(body.date) : new Date();
  try {
    return await Repair.create({
      item: item._id,
      itemName: item.name,
      category: item.category,
      quantity: qty,
      ...details(body),
      reportedAt: date,
      status: lost ? 'Lost' : 'Damaged',
      ...(lost && { result: { outcome: 'Lost', date, notes: clean(body.description) } }),
    });
  } catch (err) {
    await Item.updateOne({ _id: item._id }, lost ? { $inc: { totalQuantity: qty } } : { $inc: { outOfServiceQuantity: -qty } });
    throw err;
  }
}

export async function sendToRepair(id, body) {
  const by = clean(body.by) || 'Outside vendor';
  const vendor = clean(body.vendor);
  if (!vendor) throw new HttpError(400, 'Vendor name is required');
  if (body.estimatedCost === '' || body.estimatedCost == null) throw new HttpError(400, 'Estimated cost is required');
  const cost = Number(body.estimatedCost);
  if (!(cost >= 0)) throw new HttpError(400, 'Estimated cost must be a number');
  const repair = {
    by, vendor, contact: clean(body.contact), jobNo: clean(body.jobNo), notes: clean(body.notes),
    sentAt: body.sentAt ? new Date(body.sentAt) : new Date(),
    expectedAt: body.expectedAt ? new Date(body.expectedAt) : undefined,
    estimatedCost: cost,
  };
  const r = await Repair.findOneAndUpdate({ _id: id, status: 'Damaged' }, { $set: { status: 'In repair', repair } }, { new: true });
  if (!r) throw await notOpen(id, 'Damaged', 'sent for repair');
  return r;
}

/**
 * Repaired -> back on the shelf. Scrapped -> written off (total goes down). Works from Damaged or In repair.
 * Not repaired -> the vendor gave it back unfixed: back to Damaged (send to another vendor or scrap later),
 * the try is kept in `attempts`.
 */
export async function closeRepair(id, body) {
  const cost = body.finalCost === '' || body.finalCost == null ? undefined : Number(body.finalCost);
  if (cost !== undefined && !(cost >= 0)) throw new HttpError(400, 'Amount must be a number');

  if (body.outcome === 'Not repaired') {
    const cur = await Repair.findOne({ _id: id, status: 'In repair' });
    if (!cur) throw await notOpen(id, 'In repair', 'marked not repaired');
    const attempt = {
      vendor: cur.repair?.vendor || cur.repair?.by, sentAt: cur.repair?.sentAt, expectedAt: cur.repair?.expectedAt,
      estimatedCost: cur.repair?.estimatedCost, returnedAt: body.date ? new Date(body.date) : new Date(), cost, notes: clean(body.notes),
    };
    const r = await Repair.findOneAndUpdate(
      { _id: id, status: 'In repair' },
      { $set: { status: 'Damaged' }, $unset: { repair: 1 }, $push: { attempts: attempt } },
      { new: true }
    );
    if (!r) throw await notOpen(id, 'In repair', 'marked not repaired');
    return r; // stock unchanged: still out of service
  }

  const outcome = body.outcome === 'Scrapped' ? 'Scrapped' : 'Repaired';
  const result = { outcome, date: body.date ? new Date(body.date) : new Date(), finalCost: cost, notes: clean(body.notes) };
  const from = outcome === 'Repaired' ? ['In repair', 'Damaged'] : ['Damaged', 'In repair'];
  const r = await Repair.findOneAndUpdate({ _id: id, status: { $in: from } }, { $set: { status: outcome, result } }, { new: true });
  if (!r) throw await notOpen(id, 'Damaged or In repair', outcome === 'Repaired' ? 'marked repaired' : 'scrapped');
  await Item.updateOne(
    { _id: r.item },
    { $inc: { outOfServiceQuantity: -r.quantity, ...(outcome === 'Scrapped' && { totalQuantity: -r.quantity }) } }
  );
  return r;
}

async function notOpen(id, need, verb) {
  const r = await Repair.findById(id);
  if (!r) return new HttpError(404, 'Repair record not found');
  return new HttpError(400, `This item is ${r.status} — only ${need} items can be ${verb}`);
}
