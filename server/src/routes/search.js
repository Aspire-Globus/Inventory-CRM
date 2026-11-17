import { Router } from 'express';
import Employee from '../models/Employee.js';
import Item from '../models/Item.js';
import Assignment from '../models/Assignment.js';
import Repair from '../models/Repair.js';
import Department from '../models/Department.js';
import Category from '../models/Category.js';
import User from '../models/User.js';
import { asyncHandler, escapeRegex } from '../utils/http.js';

// GET /api/search?q=dell&limit=5
// One search across the whole system (top search bar). Results are grouped by type;
// every result has a `link` (page in the web app) to open it.
const router = Router();

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB').replace(/\//g, '-') : '');

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 5));
    if (q.length < 2) return res.json({ query: q, total: 0, groups: [] });
    const rx = new RegExp(escapeRegex(q), 'i');
    const any = (...fields) => ({ $or: fields.map((f) => ({ [f]: rx })) });

    // Departments first: employees can also be found by their department's name
    const deptFilter = any('name', 'code', 'description');
    const matchedDepts = await Department.find(deptFilter).select('_id').lean();
    const deptIds = matchedDepts.map((d) => d._id);

    const specs = [
      {
        type: 'employees', label: 'Employees',
        filter: { $or: [...any('employeeId', 'name', 'email', 'phone', 'designation', 'location').$or, ...(deptIds.length ? [{ department: { $in: deptIds } }] : [])] },
        model: Employee,
        find: (f) => Employee.find(f).populate('department', 'name').sort({ name: 1 }),
        map: (e) => ({
          id: e._id, title: e.name, subtitle: [e.employeeId, e.department?.name, e.designation].filter(Boolean).join(' · '),
          badge: e.status === 'Inactive' ? 'Inactive' : '', link: `/employees/${e.employeeId}`,
        }),
        more: `/employees?search=${encodeURIComponent(q)}`,
      },
      {
        type: 'items', label: 'Inventory',
        filter: any('name', 'brand', 'model', 'category', 'subCategory', 'vendor', 'description'),
        model: Item,
        find: (f) => Item.find(f).select('-image').sort({ name: 1 }),
        map: (i) => ({
          id: i._id, title: i.name,
          subtitle: [i.category, i.subCategory, `${i.availableQuantity} of ${i.totalQuantity} available`].filter(Boolean).join(' · '),
          badge: i.status === 'Inactive' ? 'Inactive' : '', link: `/inventory?search=${encodeURIComponent(i.name)}`,
        }),
        more: `/inventory?search=${encodeURIComponent(q)}`,
      },
      {
        type: 'assignments', label: 'Assignments',
        filter: any('itemName', 'employeeName', 'employeeCode', 'departmentName', 'category', 'notes'),
        model: Assignment,
        find: (f) => Assignment.find(f).sort({ issueDate: -1 }),
        map: (a) => {
          const holding = a.quantity - a.returnedQuantity;
          return {
            id: a._id, title: `${a.quantity > 1 ? `${a.quantity} × ` : ''}${a.itemName} → ${a.employeeName}`,
            subtitle: [a.employeeCode, a.departmentName, `issued ${fmt(a.issueDate)}`].filter(Boolean).join(' · '),
            badge: holding > 0 ? 'Assigned' : (a.transferredQuantity || 0) >= a.returnedQuantity ? 'Transferred' : 'Returned',
            link: `/employees/${a.employeeCode}`,
          };
        },
        more: `/assignments?search=${encodeURIComponent(q)}`,
      },
      {
        type: 'repairs', label: 'Repairs',
        filter: any('itemName', 'employeeName', 'employeeCode', 'damageType', 'description', 'repair.vendor', 'category'),
        model: Repair,
        find: (f) => Repair.find(f).select('-photo').sort({ reportedAt: -1 }),
        map: (r) => ({
          id: r._id, title: `${r.quantity > 1 ? `${r.quantity} × ` : ''}${r.itemName}`,
          subtitle: [r.damageType, r.employeeName ? `from ${r.employeeName}` : 'office stock', r.repair?.vendor].filter(Boolean).join(' · '),
          badge: r.status, link: `/repairs?search=${encodeURIComponent(r.itemName)}`,
        }),
        more: `/repairs?search=${encodeURIComponent(q)}`,
      },
      {
        type: 'departments', label: 'Departments',
        filter: deptFilter,
        model: Department,
        find: (f) => Department.find(f).sort({ name: 1 }),
        map: (d) => ({ id: d._id, title: d.name, subtitle: [d.code, d.description].filter(Boolean).join(' · '), link: `/employees?department=${d._id}` }),
        more: '/departments',
      },
      {
        type: 'categories', label: 'Categories',
        filter: any('name', 'subCategories', 'brands'),
        model: Category,
        find: (f) => Category.find(f).sort({ order: 1, name: 1 }),
        map: (c) => ({ id: c._id, title: c.name, subtitle: c.subCategories.slice(0, 5).join(', '), link: `/inventory?category=${encodeURIComponent(c.name)}` }),
        more: '/inventory',
      },
    ];
    // Login accounts only for people allowed to manage them
    if (req.user.can('users'))
      specs.push({
        type: 'users', label: 'Users',
        filter: any('name', 'email', 'designation'),
        model: User,
        find: (f) => User.find(f).sort({ name: 1 }),
        map: (u) => ({ id: u._id, title: u.name, subtitle: [u.email, u.role === 'Admin' ? 'Administrator' : 'Staff'].join(' · '), badge: u.status === 'Inactive' ? 'Inactive' : '', link: '/users' }),
        more: '/users',
      });

    const groups = await Promise.all(
      specs.map(async (s) => {
        const [rows, total] = await Promise.all([s.find(s.filter).limit(limit), s.model.countDocuments(s.filter)]);
        return { type: s.type, label: s.label, total, more: s.more, results: rows.map(s.map) };
      })
    );
    const found = groups.filter((g) => g.total > 0);
    res.json({ query: q, total: found.reduce((n, g) => n + g.total, 0), groups: found });
  })
);

export default router;
