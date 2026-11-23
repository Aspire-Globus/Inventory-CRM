/* Remove the dummy / test employees and departments (everything that is NOT in the CRM).

   npm run crm:cleanup                       -> shows what would be removed (changes nothing)
   npm run crm:cleanup -- --yes              -> removes local-only employees WITHOUT any assignment history
                                               + departments left with no employees
   npm run crm:cleanup -- --yes --with-history
                                             -> ALSO removes local-only employees WITH history, together with
                                               their assignments and damage/repair records (test data),
                                               then recalculates every item's stock

   It first syncs from the CRM, and stops if that fails — so real CRM employees are never touched. */
import 'dotenv/config';
import mongoose from 'mongoose';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Assignment from '../models/Assignment.js';
import Repair from '../models/Repair.js';
import { crmEnabled, syncFromCrm } from '../services/crm.js';
import { syncAssignments } from '../services/stock.js';

const YES = process.argv.includes('--yes');
const WITH_HISTORY = process.argv.includes('--with-history');

async function main() {
  if (!crmEnabled()) throw new Error('Set CRM_BASE_URL and SERVICE_API_KEY in server/.env first');
  await mongoose.connect(process.env.MONGODB_URI, { family: 4 });

  console.log('Syncing from the CRM first…');
  const counts = await syncFromCrm();
  console.log(`  ${counts.crmEmployees} employees in the CRM, ${counts.departments} departments\n`);

  const local = await Employee.find({ source: { $ne: 'crm' } }).populate('department', 'name').lean();
  const withHistory = [];
  const noHistory = [];
  for (const e of local) {
    const n = await Assignment.countDocuments({ employee: e._id });
    (n ? withHistory : noHistory).push({ ...e, assignments: n });
  }
  const show = (e) => `  ${e.employeeId.padEnd(12)} ${e.name.padEnd(26)} ${(e.department?.name || '—').padEnd(22)} ${e.assignments ? `${e.assignments} assignment(s)` : ''}`;

  console.log(`Not in the CRM, no history (${noHistory.length}) — removed with --yes:`);
  noHistory.forEach((e) => console.log(show(e)));
  console.log(`\nNot in the CRM, WITH history (${withHistory.length}) — removed only with --yes --with-history (also deletes their assignments & repairs):`);
  withHistory.forEach((e) => console.log(show(e)));

  if (!YES) {
    console.log('\nNothing changed. Run again with --yes (and --with-history) to remove.');
    return;
  }

  const remove = WITH_HISTORY ? [...noHistory, ...withHistory] : noHistory;
  const ids = remove.map((e) => e._id);
  if (WITH_HISTORY && withHistory.length) {
    const aIds = (await Assignment.find({ employee: { $in: withHistory.map((e) => e._id) } }).select('_id').lean()).map((a) => a._id);
    const r = await Repair.deleteMany({ assignment: { $in: aIds } });
    const a = await Assignment.deleteMany({ _id: { $in: aIds } });
    console.log(`\nRemoved ${a.deletedCount} assignment(s) and ${r.deletedCount} repair record(s)`);
  }
  const e = await Employee.deleteMany({ _id: { $in: ids } });
  console.log(`Removed ${e.deletedCount} employee(s)`);

  // Departments that are not from the CRM and have nobody left
  const used = await Employee.distinct('department');
  const d = await Department.deleteMany({ source: { $ne: 'crm' }, _id: { $nin: used } });
  console.log(`Removed ${d.deletedCount} empty local department(s)`);

  await syncAssignments(); // recalculate stock (assigned / damaged counts) after removing assignments
  console.log('Stock counts recalculated. Done.');
}

main()
  .catch((err) => { console.error('\nStopped:', err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
