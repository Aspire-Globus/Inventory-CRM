/* Employees and departments come from the CRM (crm.aspireglobus.com) — the CRM is the single source of truth.
   They are copied into this app's database ("synced") so assignments, reports, search and history keep working.

   Env (server/.env and the hosting panel — never commit the key):
     CRM_BASE_URL       e.g. https://crm.aspireglobus.com
     SERVICE_API_KEY    the same secret that is set in the CRM
   Without CRM_BASE_URL / SERVICE_API_KEY the app works as before (employees managed here). */
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import { escapeRegex, HttpError } from '../utils/http.js';

const cfg = () => ({
  base: String(process.env.CRM_BASE_URL || '').trim().replace(/\/+$/, ''),
  key: String(process.env.SERVICE_API_KEY || '').trim(),
});
export const crmEnabled = () => Boolean(cfg().base && cfg().key);

/* ---------- CRM client (your crm-client file, as an ES module) ---------- */
async function crmGet(path) {
  const { base, key } = cfg();
  if (!base || !key) throw new Error('CRM_BASE_URL / SERVICE_API_KEY not configured');
  let res;
  try {
    res = await fetch(`${base}/api/external${path}`, {
      headers: { 'x-service-key': key, 'x-service-name': 'inventory-app', Accept: 'application/json', 'User-Agent': 'AspireInventory/1.0 (+inventory.aspireglobus.com)' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new Error(`Cannot reach the CRM at ${base} (${err.name === 'TimeoutError' ? 'timed out' : err.message})`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = body.message || res.statusText || 'request failed';
    const hint = res.status === 401 || res.status === 403
      ? ' — check that SERVICE_API_KEY on this server is exactly the key set in the CRM, and that the CRM allows requests from this server (IP allow-list / firewall)'
      : '';
    throw Object.assign(new Error(`CRM said ${res.status} ${why}${hint}`), { status: res.status });
  }
  return body;
}
const listOf = (body) => (Array.isArray(body) ? body : body.data ?? body.employees ?? body.items ?? []);

/** All employees from the CRM (status: 'all' = active + inactive). */
export async function getCrmEmployees({ status } = {}) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return listOf(await crmGet(`/employees${q}`));
}
/** One employee by code, or null when the CRM doesn't know it. */
export async function getCrmEmployee(code) {
  try {
    const body = await crmGet(`/employees/${encodeURIComponent(code)}`);
    return body.data ?? body.employee ?? body;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/* ---------- CRM record -> our fields (accepts the usual field-name variations) ---------- */
const str = (...v) => {
  const x = v.find((y) => typeof y === 'string' || typeof y === 'number');
  return x == null ? '' : String(x).trim();
};
// The CRM sends departments as  primaryDepartment: { id, name }  and  departments: [{ id, name, isPrimary }]
function primaryDept(r) {
  const list = Array.isArray(r.departments) ? r.departments : [];
  const d = r.primaryDepartment || list.find((x) => x?.isPrimary) || list[0] || r.department;
  if (d && typeof d === 'object') return { name: str(d.name, d.title, d.departmentName), id: str(d.id, d._id) };
  return { name: str(d, r.departmentName, r.department_name, r.dept), id: str(r.departmentId, r.department_id) };
}

export function mapCrmEmployee(r = {}) {
  const dep = primaryDept(r);
  const status = str(r.status, r.employmentStatus);
  const active =
    typeof r.isActive === 'boolean' ? r.isActive
      : typeof r.active === 'boolean' ? r.active
        : !/inactive|terminated|left|resigned|exited|disabled|relieved|absconded/i.test(status);
  return {
    code: str(r.employeeCode, r.employee_code, r.empCode, r.code, r.employeeId, r.empId).toUpperCase(),
    name: str(r.name, r.fullName, r.full_name, [r.firstName ?? r.first_name, r.lastName ?? r.last_name].filter(Boolean).join(' ')),
    department: dep.name || 'Unassigned',
    departmentId: dep.id,
    designation: str(r.designation, r.jobTitle, r.job_title, r.position, typeof r.role === 'string' ? r.role : ''),
    email: str(r.email, r.officialEmail, r.workEmail).toLowerCase(),
    phone: str(r.phone, r.mobile, r.phoneNumber, r.contactNumber),
    location: str(r.location, r.branch, r.office, r.workLocation),
    status: active ? 'Active' : 'Inactive',
  };
}

/* ---------- Sync ---------- */
export const crmState = { enabled: false, running: false, lastRun: null, lastOk: null, lastError: '', counts: null };

// Find the department by its CRM id (then by name), create it if missing; the CRM's name always wins
async function departmentFor(name, crmId, cache) {
  const key = crmId || name.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  let dep = (crmId && (await Department.findOne({ crmId }))) || (await Department.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') }));
  if (!dep) dep = await Department.create({ name, code: '', source: 'crm', ...(crmId ? { crmId } : {}) }); // the CRM has no department codes
  else if (dep.source !== 'crm' || dep.name !== name || (crmId && dep.crmId !== crmId))
    await Department.updateOne({ _id: dep._id }, { $set: { source: 'crm', name, ...(crmId ? { crmId } : {}) } });
  cache.set(key, dep._id);
  return dep._id;
}

async function saveEmployee(m, deptCache) {
  const department = await departmentFor(m.department, m.departmentId, deptCache);
  const set = {
    name: m.name, department, designation: m.designation, email: m.email, phone: m.phone,
    location: m.location, status: m.status, source: 'crm', crmSyncedAt: new Date(),
  };
  const before = await Employee.findOne({ employeeId: m.code }).select('_id').lean();
  await Employee.updateOne({ employeeId: m.code }, { $set: set, $setOnInsert: { employeeId: m.code } }, { upsert: true });
  return before ? 'updated' : 'added';
}

/** Copy all CRM employees/departments into this app. Employees that are NOT in the CRM become Inactive. */
export async function syncFromCrm() {
  crmState.enabled = crmEnabled();
  if (!crmState.enabled) return null;
  if (crmState.running) return crmState.counts;
  crmState.running = true;
  crmState.lastRun = new Date();
  try {
    let raw;
    // Ask for active + inactive staff; if the CRM doesn't support that (error or empty list), ask for the default list
    try { raw = await getCrmEmployees({ status: 'all' }); } catch { raw = []; }
    if (!raw.length) raw = await getCrmEmployees();
    const list = raw.map(mapCrmEmployee).filter((m) => m.code && m.name);
    if (!list.length) throw new Error('The CRM returned no employees — nothing changed');

    const counts = { crmEmployees: list.length, added: 0, updated: 0, deactivatedLocal: 0, departments: 0 };
    const deptCache = new Map();
    for (const m of list) counts[await saveEmployee(m, deptCache)] += 1;
    counts.departments = deptCache.size;

    // Employees only in this app (e.g. old dummy/test data): hide them from pickers, keep their history
    const codes = list.map((m) => m.code);
    const r = await Employee.updateMany({ employeeId: { $nin: codes }, status: 'Active' }, { $set: { status: 'Inactive' } });
    counts.deactivatedLocal = r.modifiedCount || 0;

    // CRM departments nobody belongs to any more (e.g. the old "Unassigned"): remove them
    const used = await Employee.distinct('department');
    const gone = await Department.deleteMany({ source: 'crm', _id: { $nin: [...used, ...deptCache.values()] } });
    counts.removedDepartments = gone.deletedCount || 0;

    crmState.counts = counts;
    crmState.lastOk = new Date();
    crmState.lastError = '';
    console.log(`CRM sync: ${list.length} employees (${counts.added} new, ${counts.updated} updated), ${counts.departments} departments, ${counts.deactivatedLocal} local-only set Inactive`);
    return counts;
  } catch (err) {
    crmState.lastError = err.message;
    console.warn('CRM sync failed:', err.message);
    throw err;
  } finally {
    crmState.running = false;
  }
}

/** At server start: sync once from the CRM. No timer after that — sync again with "Sync now"
    (POST /api/crm/sync). A new hire is fetched on its own when they are assigned an item. */
export function startCrmSync() {
  crmState.enabled = crmEnabled();
  if (!crmState.enabled) {
    console.log('CRM link off (CRM_BASE_URL / SERVICE_API_KEY not set) — employees are managed in this app');
    return;
  }
  console.log(`CRM link on: ${cfg().base} — synced at start, then with "Sync now" on the Employees / Departments page`);
  syncFromCrm().catch(() => {});
}

/** Employee by code: from this app, or fetched from the CRM right now (a brand-new hire not synced yet). */
export async function employeeByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) throw new HttpError(400, 'Employee ID is required');
  let emp = await Employee.findOne({ employeeId: c }).populate('department');
  if (emp || !crmEnabled()) return emp;
  const raw = await getCrmEmployee(c).catch((err) => { throw new HttpError(502, `CRM lookup failed: ${err.message}`); });
  const m = raw && mapCrmEmployee(raw);
  if (!m?.code || !m.name) throw new HttpError(404, `Employee ID ${c} was not found in the CRM`);
  await saveEmployee(m, new Map());
  emp = await Employee.findOne({ employeeId: m.code }).populate('department');
  return emp;
}

/** Throws when employees/departments are managed in the CRM (used by add / edit / delete routes). */
export function blockWhenCrm(what = 'Employees') {
  if (crmEnabled())
    throw new HttpError(409, `${what} are managed in the CRM (${cfg().base}). Add or change them there — they sync to this app automatically.`);
}
