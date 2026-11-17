import 'dotenv/config';
import mongoose from 'mongoose';
import Item from './models/Item.js';
import Employee from './models/Employee.js';
import Department from './models/Department.js';
import Assignment from './models/Assignment.js';
import Activity from './models/Activity.js';
import User from './models/User.js';
import { assignItem, returnItem } from './services/stock.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/inventory_system';

await mongoose.connect(MONGODB_URI);
console.log('Connected — clearing collections…');
await Promise.all([Item, Employee, Department, Assignment, Activity].map((m) => m.deleteMany({})));

const deps = await Department.insertMany([
  { name: 'IT', code: 'IT' },
  { name: 'Human Resources', code: 'HR' },
  { name: 'Finance', code: 'FIN' },
  { name: 'Sales', code: 'SAL' },
  { name: 'Operations', code: 'OPS' },
]);
const dep = Object.fromEntries(deps.map((d) => [d.code, d._id]));

const items = await Item.insertMany([
  { name: 'Dell Laptop', category: 'System', totalQuantity: 125, description: 'Dell Latitude 5550' },
  { name: 'Dell Monitor 27"', category: 'Monitor', totalQuantity: 110 },
  { name: 'Logitech Mouse', category: 'Mouse', totalQuantity: 230 },
  { name: 'Logitech Keyboard', category: 'Keyboard', totalQuantity: 180 },
  { name: 'Jabra Headset', category: 'Headset', totalQuantity: 75 },
]);

const emps = await Employee.insertMany([
  { employeeId: 'EMP-00125', name: 'Rahul Sharma', department: dep.IT, designation: 'Support Engineer', location: 'Gurugram' },
  { employeeId: 'EMP-00126', name: 'Priya Verma', department: dep.HR, designation: 'HR Executive', location: 'Gurugram' },
  { employeeId: 'EMP-00127', name: 'Amit Kumar', department: dep.FIN, designation: 'Accountant', location: 'Noida' },
  { employeeId: 'EMP-00128', name: 'Neha Singh', department: dep.SAL, designation: 'Sales Manager', location: 'Delhi' },
  { employeeId: 'EMP-00129', name: 'Vikram Mehta', department: dep.OPS, designation: 'Operations Lead', location: 'Gurugram' },
]);

const [laptop, monitor, mouse, keyboard, headset] = items;
const plan = [
  [laptop, 0, 1, 'New system issued.'],
  [monitor, 0, 2],
  [keyboard, 0, 1],
  [mouse, 0, 1],
  [laptop, 1, 1],
  [mouse, 1, 1],
  [laptop, 2, 1],
  [monitor, 2, 1],
  [headset, 3, 2],
  [laptop, 4, 1],
  [keyboard, 4, 1],
];
let first;
for (const [item, e, qty, notes] of plan) {
  const { assignment } = await assignItem({ itemId: item._id, employeeId: emps[e]._id, quantity: qty, notes });
  first ??= assignment;
}
// One example return so history shows both directions
const { assignment: hs } = await assignItem({ itemId: headset._id, employeeId: emps[0]._id, quantity: 1 });
await returnItem({ assignmentId: hs._id, quantity: 1, notes: 'Replaced with newer model' });

// Login accounts (only created if they don't exist — existing users are kept)
for (const u of [
  { name: 'Administrator', email: 'admin@aspire.com', password: 'Admin@123', role: 'Admin', designation: 'IT Admin' },
  { name: 'Store Staff', email: 'staff@aspire.com', password: 'Staff@123', role: 'Staff', designation: 'Inventory Executive' },
]) {
  if (!(await User.exists({ email: u.email }))) await User.create(u);
}

console.log(`Seeded ${deps.length} departments, ${emps.length} employees, ${items.length} items.`);
console.log('Logins → admin@aspire.com / Admin@123  ·  staff@aspire.com / Staff@123');
await mongoose.disconnect();