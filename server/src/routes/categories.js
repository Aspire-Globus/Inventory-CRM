import { Router } from 'express';
import Category from '../models/Category.js';
import Item from '../models/Item.js';
import Assignment from '../models/Assignment.js';
import { DEFAULT_CATEGORIES } from '../models/categoryDefaults.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { moveToTrash, notify } from '../services/audit.js';
import { importRows, same, splitList, txt } from '../utils/importRows.js';

// Mounted behind requireAuth + writePerm('inventory'): everyone can read, the "inventory"
// permission is needed to add / edit, and "delete" as well to delete.
const router = Router();

export const ICONS = ['System', 'Monitor', 'Mouse', 'Keyboard', 'Headset', 'Printer', 'Networking', 'Mobile', 'Other'];

/* ---------- helpers ---------- */
const clean = (v) => String(v ?? '').trim();
// Trim, drop blanks and case-insensitive duplicates, keep the order typed
const list = (arr) => {
  const seen = new Set();
  return (Array.isArray(arr) ? arr : String(arr || '').split(','))
    .map(clean)
    .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
};
// "Operating System" -> "operatingSystem"
const toKey = (label) =>
  clean(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[^a-z]+/, '') || 'field';

export function normalize(body, existing) {
  const name = clean(body.name ?? existing?.name);
  if (!name) throw new HttpError(400, 'Category name is required');
  const subCategories = list(body.subCategories ?? existing?.subCategories);
  if (!subCategories.length) throw new HttpError(400, 'Add at least one sub-category');

  const keys = new Set();
  const fields = (body.fields ?? existing?.fields ?? []).map((f, i) => {
    const label = clean(f.label);
    if (!label) throw new HttpError(400, `Field ${i + 1}: label is required`);
    const type = ['select', 'text', 'number'].includes(f.type) ? f.type : 'select';
    const options = type === 'select' ? list(f.options) : [];
    if (type === 'select' && !options.length) throw new HttpError(400, `"${label}": add at least one dropdown option`);
    let key = clean(f.key) || toKey(label);
    while (keys.has(key)) key += '2';
    keys.add(key);
    const appliesTo = list(f.appliesTo).filter((s) => subCategories.includes(s));
    return { key, label, type, options, placeholder: clean(f.placeholder), appliesTo };
  });

  return {
    name,
    icon: ICONS.includes(body.icon) ? body.icon : existing?.icon || 'Other',
    subCategories,
    brands: list(body.brands ?? existing?.brands),
    fields,
    order: Number.isFinite(Number(body.order)) ? Number(body.order) : existing?.order ?? 0,
  };
}

const nameTaken = (name, exceptId) =>
  Category.exists({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), ...(exceptId && { _id: { $ne: exceptId } }) });

/** First run: copy the built-in categories (and any category already used by items) into the database. */
export async function ensureCategories() {
  if (await Category.exists({})) return;
  const docs = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i }));
  const known = new Set(docs.map((c) => c.name));
  const used = await Item.distinct('category');
  used.filter((n) => n && !known.has(n)).forEach((name) => docs.push({ name, icon: 'Other', subCategories: ['General'], order: docs.length }));
  await Category.insertMany(docs);
  console.log(`Created ${docs.length} inventory categories (edit them in Inventory → Manage Categories)`);
}

/* ---------- routes ---------- */

// All categories with everything the Add Item form needs (+ how many items use each)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [cats, counts] = await Promise.all([
      Category.find().sort({ order: 1, name: 1 }).lean(),
      Item.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }]),
    ]);
    const n = Object.fromEntries(counts.map((c) => [c._id, c.n]));
    res.json(cats.map((c) => ({ ...c, itemCount: n[c.name] || 0 })));
  })
);

router.get('/icons', (req, res) => res.json(ICONS));

/* ---------- Simple endpoints for the mobile app (Add Item form) ----------
   Step 1: GET /api/categories/list                                   -> Category dropdown
   Step 2: GET /api/categories/form?category=Camera                   -> Sub-category + Brand dropdowns
   Step 3: GET /api/categories/form?category=Camera&subCategory=CCTV  -> the spec fields for that sub-category */
const INPUT = { select: 'dropdown', text: 'text', number: 'number' };

router.get(
  '/list',
  asyncHandler(async (req, res) => {
    const [cats, counts] = await Promise.all([
      Category.find().sort({ order: 1, name: 1 }).select('name icon subCategories').lean(),
      Item.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }]),
    ]);
    const n = Object.fromEntries(counts.map((c) => [c._id, c.n]));
    res.json(cats.map((c) => ({ _id: c._id, name: c.name, icon: c.icon, subCategoryCount: c.subCategories.length, itemCount: n[c.name] || 0 })));
  })
);

// Everything the app needs in ONE call: an array of categories, each with its own brands and
// sub-categories, and each sub-category with the exact fields to show. No filtering needed in the app.
// GET /api/categories/forms            -> all categories
// GET /api/categories/forms?category=X -> just that one (still an array)
router.get(
  '/forms',
  asyncHandler(async (req, res) => {
    const name = clean(req.query.category);
    const filter = name ? { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } : {};
    const cats = await Category.find(filter).sort({ order: 1, name: 1 }).lean();
    if (name && !cats.length) throw new HttpError(404, `Category "${name}" not found — see GET /api/categories/list`);
    const field = (f) => ({
      key: f.key,
      label: f.label,
      input: INPUT[f.type] || 'text',
      options: f.type === 'select' ? f.options : [],
      placeholder: f.placeholder || '',
    });
    res.json(
      cats.map((c) => ({
        _id: c._id,
        name: c.name,
        icon: c.icon,
        brands: c.brands,
        brandInput: c.brands.length ? 'dropdown' : 'text',
        subCategories: c.subCategories.map((sub) => ({
          name: sub,
          fields: c.fields.filter((f) => !f.appliesTo?.length || f.appliesTo.includes(sub)).map(field),
        })),
      }))
    );
  })
);

router.get(
  '/form',
  asyncHandler(async (req, res) => {
    const name = clean(req.query.category);
    if (!name) throw new HttpError(400, 'Send ?category=<name>, e.g. /api/categories/form?category=Camera');
    const cat = await Category.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
    if (!cat) throw new HttpError(404, `Category "${name}" not found — see GET /api/categories/list`);

    const sub = clean(req.query.subCategory);
    if (sub && !cat.subCategories.includes(sub))
      throw new HttpError(400, `"${sub}" is not a sub-category of ${cat.name}. Use one of: ${cat.subCategories.join(', ')}`);

    // With a sub-category: only the fields for it. Without: every field, each saying where it shows.
    const fields = cat.fields
      .filter((f) => !sub || !f.appliesTo?.length || f.appliesTo.includes(sub))
      .map((f) => ({
        key: f.key,
        label: f.label,
        input: INPUT[f.type] || 'text',
        options: f.type === 'select' ? f.options : [],
        placeholder: f.placeholder || '',
        ...(!sub && { showFor: f.appliesTo?.length ? f.appliesTo : 'all' }),
      }));

    res.json({
      category: cat.name,
      subCategory: sub || null,
      subCategories: cat.subCategories,               // Sub-category dropdown
      brands: cat.brands,                             // Brand dropdown
      brandInput: cat.brands.length ? 'dropdown' : 'text', // no brands set up = free text box
      fields,                                         // one input per field
      specsTemplate: Object.fromEntries(fields.map((f) => [f.key, ''])), // fill this in and send as "specs" in POST /api/items
    });
  })
);

/* ---------- Bulk import: Excel / CSV ----------
   POST /api/categories/import
   { rows: [{ name, icon, subCategories: "Laptop, Desktop", brands: "Dell, HP",
              fields: "RAM: 8 GB | 16 GB; Storage: 256 GB | 512 GB; Battery [Laptop]: 4 hr | 8 hr; Serial No", row }],
     duplicates: 'skip' | 'merge',   // merge = add the new sub-categories, brands and fields to an existing category
     dryRun: true }
   Fields: "Label: option | option" = dropdown · "Label" alone = text box · "Label [Sub1, Sub2]: …" = only for those sub-categories */
export function parseFields(v) {
  if (Array.isArray(v)) return v;
  return String(v ?? '')
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^([^:[\]]+?)\s*(?:\[([^\]]*)\])?\s*(?::\s*(.*))?$/);
      if (!m) throw new Error(`Field "${part}" — write it as  Label: option | option`);
      const options = (m[3] || '').split('|').map((o) => o.trim()).filter(Boolean);
      return { label: m[1].trim(), type: options.length ? 'select' : 'text', options, appliesTo: splitList(m[2] || '') };
    });
}

router.post(
  '/import',
  asyncHandler(async (req, res) => {
    const { rows, dryRun } = importRows(req.body);
    const merge = req.body.duplicates === 'merge';
    const existing = await Category.find();
    const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));
    const results = [];
    const creates = new Map(); // lower name -> data
    const updates = new Map(); // lower name -> { cat, data }
    let order = existing.length;

    rows.forEach((r, i) => {
      const row = Number(r.row) || i + 2;
      const name = txt(r.name);
      try {
        if (!name) throw new Error('Category name is empty');
        const icon = txt(r.icon);
        const iconOk = ICONS.find((x) => same(x, icon));
        if (icon && !iconOk) throw new Error(`Icon "${icon}" — use one of: ${ICONS.join(', ')}`);
        const input = { name, icon: iconOk, subCategories: splitList(r.subCategories), brands: splitList(r.brands), fields: parseFields(r.fields) };
        const key = name.toLowerCase();
        const old = byName.get(key) || null;
        if ((old || creates.has(key) || updates.has(key)) && !merge)
          return results.push({ row, name, status: 'skipped', message: old ? 'Category already exists — skipped' : 'Same name as an earlier row — skipped' });

        // Merge = keep what is there, add what is new (sub-categories, brands, fields by label)
        const base = updates.get(key)?.data || creates.get(key) || (old && old.toObject());
        const data = normalize(
          base
            ? {
                name: base.name,
                icon: input.icon || base.icon,
                order: base.order,
                subCategories: [...base.subCategories, ...input.subCategories],
                brands: [...base.brands, ...input.brands],
                fields: [...base.fields, ...input.fields.filter((f) => !base.fields.some((x) => same(x.label, f.label)))],
              }
            : input
        );
        if (old || updates.has(key)) {
          const cat = old || updates.get(key).cat;
          const added = data.subCategories.length - cat.subCategories.length + (data.brands.length - cat.brands.length) + (data.fields.length - cat.fields.length);
          updates.set(key, { cat, data });
          return results.push({ row, name, status: 'updated', message: added ? `Merged into the existing category (${data.subCategories.length} sub-categories, ${data.brands.length} brands, ${data.fields.length} fields)` : 'Already has all of this — nothing new' });
        }
        if (!creates.has(key)) data.order = ++order;
        creates.set(key, data);
        results.push({ row, name, status: 'created', message: `New · ${data.subCategories.length} sub-categories · ${data.brands.length} brands · ${data.fields.length} fields` });
      } catch (err) {
        results.push({ row, name, status: 'error', message: err.message });
      }
    });

    const count = (s) => results.filter((x) => x.status === s).length;
    const summary = { dryRun, total: rows.length, created: creates.size, updated: updates.size, skipped: count('skipped'), failed: count('error'), results };
    if (dryRun || (!creates.size && !updates.size)) return res.json(summary);

    const made = creates.size ? await Category.insertMany([...creates.values()]) : [];
    for (const { cat, data } of updates.values()) {
      cat.set(data);
      await cat.save();
    }
    await notify(req, {
      action: 'created', entity: 'Category', entityName: 'Import',
      message: `${req.user.name} imported categories from a file: ${made.length} new${updates.size ? `, ${updates.size} updated` : ''}${summary.failed ? `, ${summary.failed} row(s) with errors left out` : ''}`,
      changes: [
        ...(made.length ? [{ field: 'New categories', from: '—', to: made.map((c) => c.name).join(', ') }] : []),
        ...(updates.size ? [{ field: 'Updated', from: '—', to: [...updates.values()].map((u) => u.cat.name).join(', ') }] : []),
      ],
    });
    res.status(201).json(summary);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const cat = await Category.findById(req.params.id).lean();
    if (!cat) throw new HttpError(404, 'Category not found');
    res.json({ ...cat, itemCount: await Item.countDocuments({ category: cat.name }) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = normalize(req.body);
    if (await nameTaken(data.name)) throw new HttpError(409, `Category "${data.name}" already exists`);
    if (req.body.order === undefined) data.order = (await Category.countDocuments()) + 1;
    const cat = await Category.create(data);
    await notify(req, {
      action: 'created', entity: 'Category', entityId: cat._id, entityName: cat.name,
      message: `${req.user.name} added inventory category "${cat.name}" (${cat.subCategories.length} sub-categories, ${cat.fields.length} fields)`,
    });
    res.status(201).json(cat);
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const cat = await Category.findById(req.params.id);
    if (!cat) throw new HttpError(404, 'Category not found');
    const before = cat.toObject();
    const data = normalize(req.body, before);
    if (data.name !== before.name && (await nameTaken(data.name, cat._id)))
      throw new HttpError(409, `Category "${data.name}" already exists`);

    cat.set(data);
    await cat.save();

    // Renamed? Move existing items (and their assignment records) to the new name
    let moved = 0;
    if (data.name !== before.name) {
      moved = (await Item.updateMany({ category: before.name }, { category: data.name })).modifiedCount;
      await Assignment.updateMany({ category: before.name }, { category: data.name });
    }

    const changes = [];
    const show = (a) => (a?.length ? a.join(', ') : '—');
    if (before.name !== cat.name) changes.push({ field: 'Name', from: before.name, to: cat.name });
    if (before.icon !== cat.icon) changes.push({ field: 'Icon', from: before.icon, to: cat.icon });
    if (show(before.subCategories) !== show(cat.subCategories)) changes.push({ field: 'Sub-categories', from: show(before.subCategories), to: show(cat.subCategories) });
    if (show(before.brands) !== show(cat.brands)) changes.push({ field: 'Brands', from: show(before.brands), to: show(cat.brands) });
    const fl = (f) => show(f?.map((x) => x.label));
    if (JSON.stringify(before.fields) !== JSON.stringify(cat.toObject().fields)) changes.push({ field: 'Fields', from: fl(before.fields), to: fl(cat.fields) });
    if (changes.length)
      await notify(req, {
        action: 'updated', entity: 'Category', entityId: cat._id, entityName: cat.name,
        message: `${req.user.name} edited inventory category "${cat.name}"${moved ? ` (${moved} items renamed)` : ''}`,
        changes,
      });
    res.json(cat);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const cat = await Category.findById(req.params.id);
    if (!cat) throw new HttpError(404, 'Category not found');
    const used = await Item.countDocuments({ category: cat.name });
    if (used) throw new HttpError(400, `${used} item(s) use "${cat.name}" — move or delete them first`);
    await moveToTrash(req, 'Category', cat, cat.name);
    await notify(req, {
      action: 'deleted', entity: 'Category', entityId: cat._id, entityName: cat.name,
      message: `${req.user.name} deleted inventory category "${cat.name}" (moved to Recycle Bin)`,
    });
    res.json({ ok: true });
  })
);

export default router;
