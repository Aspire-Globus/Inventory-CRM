import { Router } from 'express';
import Item, { AVAILABLE_EXPR } from '../models/Item.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Assignment, { CLOSED } from '../models/Assignment.js';
import Activity from '../models/Activity.js';
import { asyncHandler, pageParams, paged, pageArray } from '../utils/http.js';

const router = Router();

const LOW_LIMIT = 5; // "Running low" = this many or fewer on the shelf

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const LOW = { status: { $ne: 'Inactive' }, $expr: { $lte: [AVAILABLE_EXPR, LOW_LIMIT] } };
    const [byCategory, totals, employees, departments, activeAssignments, recent, lowStock, lowStockCount] = await Promise.all([
      Item.aggregate([
        { $match: { status: { $ne: 'Inactive' } } }, // retired (Inactive) items are not counted as stock
        { $group: { _id: '$category', total: { $sum: '$totalQuantity' }, assigned: { $sum: '$assignedQuantity' }, repair: { $sum: { $ifNull: ['$outOfServiceQuantity', 0] } } } },
        { $project: { _id: 0, category: '$_id', total: 1, assigned: 1, repair: 1, available: { $subtract: ['$total', { $add: ['$assigned', '$repair'] }] } } },
        { $sort: { category: 1 } },
      ]),
      Item.aggregate([
        { $match: { status: { $ne: 'Inactive' } } },
        { $group: { _id: null, total: { $sum: '$totalQuantity' }, assigned: { $sum: '$assignedQuantity' }, repair: { $sum: { $ifNull: ['$outOfServiceQuantity', 0] } }, items: { $sum: 1 } } },
      ]),
      Employee.countDocuments({ status: 'Active' }),
      Department.countDocuments(),
      Assignment.countDocuments({ status: { $nin: CLOSED } }),
      Activity.find({ type: { $in: ['ASSIGN', 'RETURN'] } }).sort({ date: -1, createdAt: -1 }).limit(8).lean(),
      Item.find(LOW).select('-image').sort({ name: 1 }).limit(10), // pictures are not needed in this list
      Item.countDocuments(LOW),
    ]);
    const t = totals[0] || { total: 0, assigned: 0, repair: 0, items: 0 };
    const available = t.total - t.assigned - (t.repair || 0);

    res.json({
      /* ---------- Clear keys: same numbers and labels as the portal Dashboard ---------- */

      // Top row of cards
      summary: {
        totalStock: t.total,               // "Total stock"
        withEmployees: t.assigned,         // "With employees"
        damagedOrInRepair: t.repair || 0,  // Damaged + In repair (not usable)
        onTheShelf: available,             // "On the shelf"
        openAssignments: activeAssignments, // "Open assignments"
        departments,                        // "Departments"
        activeEmployees: employees,
        itemTypes: t.items,                 // number of different items in Inventory
      },

      // Category cards, e.g. "Headset 73 of 75 on the shelf"
      categories: byCategory.map((c) => ({
        category: c.category,
        onTheShelf: c.available,
        total: c.total,
        withEmployees: c.assigned,
        damagedOrInRepair: c.repair || 0,
        isLow: c.available <= LOW_LIMIT,
      })),

      // "Running low" box, e.g. "LG 45 · Monitor · 1 left"
      runningLow: {
        count: lowStockCount,   // how many items are running low (all of them, not only the 10 listed)
        threshold: LOW_LIMIT,   // "5 or fewer on the shelf"
        items: lowStock.map((i) => ({
          _id: i._id,
          name: i.name,
          category: i.category,
          subCategory: i.subCategory,
          brand: i.brand,
          model: i.model,
          left: i.totalQuantity - i.assignedQuantity - (i.outOfServiceQuantity || 0), // "1 left"
          total: i.totalQuantity,
          withEmployees: i.assignedQuantity,
          unit: i.unit,
        })),
      },

      // "Recent Activity" list, e.g. "Returned 1 × Samsung 34rer from dfgrg"
      recentActivity: recent.map((a) => {
        const assigned = a.type === 'ASSIGN';
        return {
          _id: a._id,
          action: assigned ? 'Assigned' : 'Returned',
          text: `${assigned ? 'Assigned' : 'Returned'} ${a.quantity} × ${a.itemName} ${assigned ? 'to' : 'from'} ${a.employeeName}`,
          itemName: a.itemName,
          quantity: a.quantity,
          employeeName: a.employeeName,
          employeeCode: a.employeeCode,
          departmentName: a.departmentName,
          date: a.date,
        };
      }),

      /* ---------- Original keys (the web portal uses these; kept unchanged) ---------- */
      byCategory,
      totals: { ...t, available },
      employees,
      departments,
      activeAssignments,
      recent,
      lowStock,
      lowStockCount,
    });
  })
);

router.get(
  '/stock',
  asyncHandler(async (req, res) => {
    const items = await Item.find().sort({ category: 1, name: 1 });
    const p = pageParams(req.query);
    res.json(p ? pageArray(items, p) : items);
  })
);

router.get(
  '/by-department',
  asyncHandler(async (req, res) => {
    const rows = await Assignment.aggregate([
      { $match: { status: { $nin: CLOSED } } },
      {
        $group: {
          _id: { department: '$departmentName', category: '$category' },
          quantity: { $sum: { $subtract: ['$quantity', '$returnedQuantity'] } },
        },
      },
      { $project: { _id: 0, department: '$_id.department', category: '$_id.category', quantity: 1 } },
      { $sort: { department: 1, category: 1 } },
    ]);
    res.json(rows);
  })
);

router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const { from, to, type } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(`${to}T23:59:59.999`);
    }
    const p = pageParams(req.query);
    if (p) {
      const [rows, total] = await Promise.all([
        Activity.find(filter).sort({ date: -1, createdAt: -1 }).skip(p.skip).limit(p.limit),
        Activity.countDocuments(filter),
      ]);
      return res.json(paged(rows, total, p));
    }
    res.json(await Activity.find(filter).sort({ date: -1, createdAt: -1 }).limit(5000));
  })
);

export default router;
