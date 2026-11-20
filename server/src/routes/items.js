import { Router } from 'express';
import Item from '../models/Item.js';
import Category from '../models/Category.js';
import Assignment, { CLOSED } from '../models/Assignment.js';
import Activity from '../models/Activity.js';
import { asyncHandler, HttpError, escapeRegex, pageParams, paged, pageArray } from '../utils/http.js';
import { diff, notify } from '../services/audit.js';
import { itemForm, removeUpload } from '../middleware/upload.js';
import { importRows, same, toDate, toNumber, txt } from '../utils/importRows.js';

// If saving fails, delete the image file that was just uploaded
const cleanup = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (req.file) removeUpload(req.body?.image);
    throw err;
  }
};

const ITEM_FIELDS = [
  ['name', 'Name'], ['category', 'Category'], ['subCategory', 'Sub-category'], ['brand', 'Brand'], ['model', 'Model'],
  ['specs', 'Specifications'], ['totalQuantity', 'Total quantity'], ['unit', 'Unit'], ['unitPrice', 'Unit price'],
  ['vendor', 'Vendor'], ['purchaseDate', 'Purchase date'], ['warrantyUntil', 'Warranty until'],
  ['description', 'Description'], ['image', 'Image', (v) => (v ? 'Image' : '—')], ['status', 'Status'],
];
const plain = (doc) => doc.toObject({ flattenMaps: true, virtuals: false });

const router = Router();

const pick = (b) => ({
  name: b.name,
  category: b.category,
  subCategory: b.subCategory,
  brand: b.brand,
  model: b.model,
  specs: b.specs,
  unit: b.unit,
  vendor: b.vendor,
  purchaseDate: b.purchaseDate || null,
  warrantyUntil: b.warrantyUntil || null,
  unitPrice: b.unitPrice === '' || b.unitPrice == null ? undefined : Number(b.unitPrice),
  description: b.description,
  image: b.image,
  status: ['Active', 'Inactive'].includes(b.status) ? b.status : undefined,
});

// Unit price is required: on create always; on edit whenever it is sent (it can't be cleared)
function checkPrice(b, creating) {
  const v = b.unitPrice;
  if (v === undefined && !creating) return;
  if (v === '' || v == null) throw new HttpError(400, 'Unit price is required');
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'Unit price must be a number (0 or more)');
}

// Category names (full details with sub-categories, brands and fields: GET /api/categories)
router.get(
  '/categories',
  asyncHandler(async (req, res) => res.json((await Category.find().sort({ order: 1, name: 1 }).lean()).map((c) => c.name)))
);

async function checkCategory(name) {
  if (name !== undefined && !(await Category.exists({ name })))
    throw new HttpError(400, `Category "${name}" does not exist — add it in Inventory → Manage Categories`);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search, category, status } = req.query;
    const filter = {};
    if (category && category !== 'All') filter.category = category;
    // status=Active | Inactive (leave out or "All" for both). Items saved before statuses existed count as Active.
    if (status === 'Active') filter.status = { $ne: 'Inactive' };
    else if (status === 'Inactive') filter.status = 'Inactive';
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: 'i' };
      filter.$or = [{ name: rx }, { brand: rx }, { model: rx }, { subCategory: rx }];
    }
    const p = pageParams(req.query);
    // All four queries run at the same time: one wait for the database instead of three in a row
    const [rows, total, usage, cats] = await Promise.all([
      // Newest item first
      p ? Item.find(filter).sort({ createdAt: -1, _id: -1 }).skip(p.skip).limit(p.limit) : Item.find(filter).sort({ createdAt: -1, _id: -1 }),
      p ? Item.countDocuments(filter) : 0,
      usageQuery(null),
      Category.find().lean(),
    ]);
    const out = await withUsage(rows, { usage, cats });
    res.json(p ? paged(out, total, p) : out);
  })
);

// Every item answer also carries "specDetails": its specs as { key, label, value } rows, in the order
// set in Manage Categories, so an app can show "Processor: Intel Core i5" without hard-coding labels.
export async function withDetails(items, preCats) {
  const one = !Array.isArray(items);
  const list = (one ? [items] : items).map((i) => (i.toJSON ? i.toJSON() : i));
  const cats = preCats || (await Category.find({ name: { $in: [...new Set(list.map((i) => i.category))] } }).lean());
  const byName = Object.fromEntries(cats.map((c) => [c.name, c]));
  const out = list.map((i) => {
    const specs = i.specs || {};
    const fields = (byName[i.category]?.fields || []).filter((f) => !f.appliesTo?.length || f.appliesTo.includes(i.subCategory));
    const known = new Set(fields.map((f) => f.key));
    const specDetails = [
      ...fields.map((f) => ({ key: f.key, label: f.label, value: specs[f.key] ?? '' })),
      // values saved under a field that was later removed from the category
      ...Object.keys(specs).filter((k) => !known.has(k)).map((k) => ({ key: k, label: k, value: specs[k] })),
    ];
    return { ...i, specDetails };
  });
  return one ? out[0] : out;
}

// Who has each item right now: number of employees and units per department
// Who holds what, per item and department. ids = null -> every item (so it can run at the same time as the item query)
const usageQuery = (ids) =>
  Assignment.aggregate([
    { $match: { ...(ids && { item: { $in: ids } }), status: { $nin: CLOSED } } },
    { $project: { item: 1, employee: 1, departmentName: 1, qty: { $subtract: ['$quantity', '$returnedQuantity'] } } },
    { $group: { _id: { item: '$item', dep: '$departmentName' }, quantity: { $sum: '$qty' }, employees: { $addToSet: '$employee' } } },
    { $sort: { quantity: -1 } },
  ]);

// pre = { usage, cats } already fetched in parallel by the caller (saves database trips)
async function withUsage(items, pre = {}) {
  if (!items.length) return [];
  const [usage, cats] = await Promise.all([
    pre.usage || usageQuery(items.map((i) => i._id)),
    pre.cats || Category.find({ name: { $in: [...new Set(items.map((i) => i.category))] } }).lean(),
  ]);
  const byItem = {};
  for (const u of usage) {
    const k = String(u._id.item);
    byItem[k] ??= { employees: new Set(), departments: [] };
    u.employees.forEach((e) => byItem[k].employees.add(String(e)));
    byItem[k].departments.push({ name: u._id.dep || '—', quantity: u.quantity, employees: u.employees.length });
  }
  return withDetails(
    items.map((i) => {
      const u = byItem[String(i._id)];
      return { ...i.toJSON(), usage: { employees: u ? u.employees.size : 0, departments: u ? u.departments : [] } };
    }),
    cats
  );
}

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await Item.findById(req.params.id);
    if (!item) throw new HttpError(404, 'Item not found');
    const [holders, detailed] = await Promise.all([
      Assignment.find({ item: item._id, status: { $nin: CLOSED } }).sort({ issueDate: -1 }),
      withDetails(item),
    ]);
    res.json({ item: detailed, holders });
  })
);

// Body: JSON, or multipart/form-data with the picture in field "image" (specs as a JSON string)
router.post(
  '/',
  itemForm,
  asyncHandler(cleanup(async (req, res) => {
    const total = Number(req.body.totalQuantity);
    if (!Number.isInteger(total) || total < 0) throw new HttpError(400, 'Total quantity must be a whole number');
    checkPrice(req.body, true);
    await checkCategory(req.body.category ?? '');
    const item = await Item.create({ ...pick(req.body), totalQuantity: total, assignedQuantity: 0 });
    await Activity.create({ type: 'STOCK_ADD', item: item._id, itemName: item.name, quantity: total, notes: 'Item created' });
    await notify(req, {
      action: 'created', entity: 'Item', entityId: item._id, entityName: item.name,
      message: `${req.user.name} added new item "${item.name}" (${item.category}) with ${total} ${item.unit}`,
      changes: diff({}, plain(item), ITEM_FIELDS),
    });
    res.status(201).json(await withDetails(item));
  }))
);

router.put(
  '/:id',
  itemForm,
  asyncHandler(cleanup(async (req, res) => {
    const item = await Item.findById(req.params.id);
    if (!item) throw new HttpError(404, 'Item not found');
    const before = plain(item);
    const report = async (updated) => {
      if (before.image !== updated.image) removeUpload(before.image); // picture replaced: delete the old file
      const changes = diff(before, plain(updated), ITEM_FIELDS);
      if (changes.length)
        await notify(req, {
          action: 'updated', entity: 'Item', entityId: item._id, entityName: updated.name,
          message: `${req.user.name} edited item "${updated.name}" (${changes.map((c) => c.field).join(', ')})`,
          changes,
        });
    };
    checkPrice(req.body, false);
    const update = pick(req.body);
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);
    if (update.category !== before.category) await checkCategory(update.category);

    if (req.body.totalQuantity !== undefined) {
      const total = Number(req.body.totalQuantity);
      if (!Number.isInteger(total) || total < 0) throw new HttpError(400, 'Total quantity must be a whole number');
      // Guarded update: total can never drop below what is currently assigned
      const updated = await Item.findOneAndUpdate(
        { _id: item._id, $expr: { $lte: [{ $add: ['$assignedQuantity', { $ifNull: ['$outOfServiceQuantity', 0] }] }, total] } },
        { $set: { ...update, totalQuantity: total } },
        { new: true, runValidators: true }
      );
      if (!updated) throw new HttpError(400, `Total cannot be less than assigned + in repair (${item.assignedQuantity + (item.outOfServiceQuantity || 0)})`);
      if (total !== item.totalQuantity) {
        await Activity.create({
          type: 'STOCK_UPDATE',
          item: item._id,
          itemName: updated.name,
          quantity: total - item.totalQuantity,
          notes: `Total changed ${item.totalQuantity} → ${total}`,
        });
      }
      await report(updated);
      return res.json(updated);
    }
    const updated = await Item.findByIdAndUpdate(item._id, { $set: update }, { new: true, runValidators: true });
    await report(updated);
    res.json(updated);
  }))
);

// Add stock (e.g. new purchase)
/* ---------- Bulk import: Excel / CSV (the app reads the file and sends the rows) ----------
   POST /api/items/import
   { rows: [{ name, category, subCategory, brand, model, totalQuantity, unit, unitPrice, vendor,
              purchaseDate, warrantyUntil, description, specs: { "<field label or key>": "value" }, row }],
     duplicates: 'skip' | 'addStock',   // an item with the same name already exists
     dryRun: true }                     // true = only check, save nothing (preview)
   Each row gets a result: created / updated (stock added) / skipped / error, with the reason. */
router.post(
  '/import',
  asyncHandler(async (req, res) => {
    const { rows, dryRun } = importRows(req.body);
    const addStock = req.body.duplicates === 'addStock';
    const [cats, existing] = await Promise.all([Category.find().lean(), Item.find().select('name totalQuantity unit').lean()]);
    const catBy = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
    const itemBy = new Map(existing.map((i) => [i.name.toLowerCase(), i]));

    const results = [];
    const creates = new Map(); // lower name -> doc to insert (same name twice in the file = one item, quantities added)
    const stockAdds = new Map(); // existing item id -> { item, qty }

    rows.forEach((r, i) => {
      const row = Number(r.row) || i + 2; // row number in the sheet (1 = header)
      const name = txt(r.name);
      try {
        if (!name) throw new Error('Item name is empty');
        const cat = catBy.get(txt(r.category).toLowerCase());
        if (!cat) throw new Error(txt(r.category) ? `Category "${txt(r.category)}" does not exist — add it first (Manage Categories or import categories)` : 'Category is empty');
        let sub = txt(r.subCategory);
        if (cat.subCategories.length) {
          const m = cat.subCategories.find((x) => same(x, sub));
          if (!m) throw new Error(`${sub ? `"${sub}" is not a sub-category of ${cat.name}` : 'Sub-category is empty'} — use one of: ${cat.subCategories.join(', ')}`);
          sub = m;
        }
        const qty = toNumber(r.totalQuantity);
        if (txt(r.totalQuantity) === '' || !Number.isInteger(qty) || qty < 0) throw new Error('Total quantity must be a whole number (0 or more)');
        if (txt(r.unitPrice) === '') throw new Error('Unit price is empty');
        const price = toNumber(r.unitPrice);
        if (!Number.isFinite(price) || price < 0) throw new Error(`Unit price "${txt(r.unitPrice)}" is not a number`);
        let brand = txt(r.brand);
        if (brand && cat.brands.length) {
          const m = cat.brands.find((b) => same(b, brand));
          if (!m) throw new Error(`Brand "${brand}" is not set up for ${cat.name} — use one of: ${cat.brands.join(', ')}`);
          brand = m;
        }
        // Spec columns: matched to this category's fields by label or key; columns of other categories are ignored
        const specs = {};
        const fields = cat.fields.filter((f) => !f.appliesTo?.length || f.appliesTo.includes(sub));
        for (const [col, raw] of Object.entries(r.specs || {})) {
          const value = txt(raw);
          if (!value) continue;
          const f = fields.find((x) => same(x.label, col) || same(x.key, col));
          if (!f) continue;
          if (f.type === 'select') {
            const opt = f.options.find((o) => same(o, value));
            if (!opt) throw new Error(`${f.label} "${value}" is not an option — use one of: ${f.options.join(', ')}`);
            specs[f.key] = opt;
          } else if (f.type === 'number' && !Number.isFinite(toNumber(value))) throw new Error(`${f.label} must be a number`);
          else specs[f.key] = value;
        }
        const doc = {
          name, category: cat.name, subCategory: sub, brand, model: txt(r.model), specs,
          totalQuantity: qty, assignedQuantity: 0, unit: txt(r.unit) || 'pcs', unitPrice: price,
          vendor: txt(r.vendor), purchaseDate: toDate(r.purchaseDate, 'Purchase date'),
          warrantyUntil: toDate(r.warrantyUntil, 'Warranty until'), description: txt(r.description),
        };

        const key = name.toLowerCase();
        const old = itemBy.get(key);
        if (old) {
          if (!addStock) return results.push({ row, name, status: 'skipped', message: 'Already in inventory — skipped' });
          const cur = stockAdds.get(String(old._id)) || { item: old, qty: 0 };
          cur.qty += qty;
          stockAdds.set(String(old._id), cur);
          return results.push({ row, name, status: 'updated', message: `${qty} ${old.unit} added to the existing item (Total ${old.totalQuantity} → ${old.totalQuantity + cur.qty})` });
        }
        if (creates.has(key)) {
          creates.get(key).totalQuantity += qty;
          return results.push({ row, name, status: 'created', message: `Same name as an earlier row — ${qty} added to it` });
        }
        creates.set(key, doc);
        results.push({ row, name, status: 'created', message: `New item · ${qty} ${doc.unit} · ₹${price.toLocaleString('en-IN')}` });
      } catch (err) {
        results.push({ row, name, status: 'error', message: err.message });
      }
    });

    const count = (s) => results.filter((x) => x.status === s).length;
    const summary = { dryRun, total: rows.length, created: creates.size, updated: stockAdds.size, skipped: count('skipped'), failed: count('error'), results };
    if (dryRun || (!creates.size && !stockAdds.size)) return res.json(summary);

    // Save: all new items in one go, then the stock additions
    const made = creates.size ? await Item.insertMany([...creates.values()]) : [];
    if (stockAdds.size)
      await Item.bulkWrite([...stockAdds.values()].map(({ item, qty }) => ({ updateOne: { filter: { _id: item._id }, update: { $inc: { totalQuantity: qty } } } })));
    await Activity.insertMany([
      ...made.map((it) => ({ type: 'STOCK_ADD', item: it._id, itemName: it.name, quantity: it.totalQuantity, notes: 'Imported from file' })),
      ...[...stockAdds.values()].map(({ item, qty }) => ({ type: 'STOCK_ADD', item: item._id, itemName: item.name, quantity: qty, notes: 'Stock added by import' })),
    ]);
    await notify(req, {
      action: 'created', entity: 'Item', entityName: 'Import',
      message: `${req.user.name} imported inventory from a file: ${made.length} new item(s)${stockAdds.size ? `, stock added to ${stockAdds.size}` : ''}${summary.skipped ? `, ${summary.skipped} skipped` : ''}${summary.failed ? `, ${summary.failed} row(s) with errors left out` : ''}`,
      changes: [
        { field: 'New items', from: '—', to: made.map((x) => x.name).slice(0, 20).join(', ') + (made.length > 20 ? ` … (+${made.length - 20})` : '') || '—' },
        ...(stockAdds.size ? [{ field: 'Stock added to', from: '—', to: [...stockAdds.values()].map((x) => `${x.item.name} (+${x.qty})`).slice(0, 20).join(', ') }] : []),
      ],
    });
    res.status(201).json(summary);
  })
);

router.post(
  '/:id/stock',
  asyncHandler(async (req, res) => {
    const qty = Number(req.body.quantity);
    if (!Number.isInteger(qty) || qty < 1) throw new HttpError(400, 'Quantity must be at least 1');
    const item = await Item.findByIdAndUpdate(req.params.id, { $inc: { totalQuantity: qty } }, { new: true });
    if (!item) throw new HttpError(404, 'Item not found');
    await Activity.create({ type: 'STOCK_ADD', item: item._id, itemName: item.name, quantity: qty, notes: req.body.notes || 'Stock added' });
    await notify(req, {
      action: 'stock_added', entity: 'Item', entityId: item._id, entityName: item.name,
      message: `${req.user.name} added ${qty} ${item.unit} to "${item.name}" (now Total ${item.totalQuantity})`,
      changes: [{ field: 'Total quantity', from: String(item.totalQuantity - qty), to: String(item.totalQuantity) }],
      meta: { notes: req.body.notes || '' },
    });
    res.json(await withDetails(item));
  })
);

// Activate / deactivate. Inventory items are never deleted — an Inactive item keeps its history
// but can't be assigned to anyone until it is made Active again.
router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const status = req.body.status;
    if (!['Active', 'Inactive'].includes(status)) throw new HttpError(400, 'status must be "Active" or "Inactive"');
    const item = await Item.findById(req.params.id);
    if (!item) throw new HttpError(404, 'Item not found');
    const before = item.status || 'Active';
    if (before === status) return res.json(await withDetails(item));
    item.status = status;
    await item.save();
    await notify(req, {
      action: 'updated', entity: 'Item', entityId: item._id, entityName: item.name,
      message: `${req.user.name} marked item "${item.name}" ${status}${status === 'Inactive' && item.assignedQuantity ? ` (${item.assignedQuantity} ${item.unit} still with employees)` : ''}`,
      changes: [{ field: 'Status', from: before, to: status }],
    });
    res.json(await withDetails(item));
  })
);

router.delete('/:id', (req, res) =>
  res.status(405).json({ message: 'Inventory items cannot be deleted. Mark the item Inactive instead: PATCH /api/items/:id/status {"status":"Inactive"}' })
);

export default router;
