import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icons.jsx';
import { ActionMenu, Empty, Field, Modal, StatusBadge, useAsync, useToast } from '../components/ui.jsx';
import { Pagination, usePagination } from '../components/table.jsx';
import { CrmBar, useCrm } from '../components/Crm.jsx';
import { tw } from '../components/tw.js';

export function EmployeeForm({ initial, onSaved, onCancel }) {
  const toast = useToast();
  const editing = Boolean(initial?._id);
  const { data: departments } = useAsync(api.departments);
  const [form, setForm] = useState({
    employeeId: initial?.employeeId || '',
    name: initial?.name || '',
    department: initial?.department?._id || initial?.department || '',
    designation: initial?.designation || '',
    location: initial?.location || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    status: initial?.status || 'Active',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (!editing) api.nextEmployeeId().then((r) => setForm((f) => (f.employeeId ? f : { ...f, employeeId: r.employeeId })));
  }, [editing]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = editing ? await api.updateEmployee(initial._id, form) : await api.createEmployee(form);
      toast(editing ? 'Employee updated' : `Employee ${saved.employeeId} created`);
      onSaved(saved);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={tw.form}>
      <div className={tw.grid2}>
        <Field label="Employee ID" required hint="Must be unique">
          <input value={form.employeeId} onChange={set('employeeId')} required placeholder="EMP-00001" />
        </Field>
        <Field label="Full Name" required>
          <input value={form.name} onChange={set('name')} required autoFocus />
        </Field>
        <Field label="Department" required>
          <select value={form.department} onChange={set('department')} required>
            <option value="">Select department…</option>
            {(departments || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Designation">
          <input value={form.designation} onChange={set('designation')} />
        </Field>
        <Field label="Location">
          <input value={form.location} onChange={set('location')} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={set('status')}>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Phone">
          <input value={form.phone} onChange={set('phone')} />
        </Field>
      </div>
      {departments && !departments.length && (
        <p className="bg-warn-soft text-warn px-3 py-2.5 rounded-lg m-0">No departments yet — <Link to="/departments">create one first</Link>.</p>
      )}
      <div className={tw.formActions}>
        <button type="button" className={tw.btn} onClick={onCancel}>Cancel</button>
        <button className={tw.btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save Employee'}</button>
      </div>
    </form>
  );
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

export default function Employees() {
  const toast = useToast();
  const { can } = useAuth();
  const crm = useCrm(); // CRM link on -> people are added / changed in the CRM, not here
  const canManage = can('employees') && !crm.enabled;
  const canDelete = canManage && can('delete');
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const [department, setDepartment] = useState(params.get('department') || '');
  const [modal, setModal] = useState(null);
  const { data: departments } = useAsync(api.departments);
  const { data, loading, error, reload } = useAsync(() => api.employees({ search, department }), [search, department]);
  const pg = usePagination(data || []);

  const remove = async (emp) => {
    if (!confirm(`Delete ${emp.name}?\n\nIt goes to the Recycle Bin and an administrator can restore it within 30 days.`)) return;
    try {
      await api.deleteEmployee(emp._id);
      toast('Employee moved to Recycle Bin');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <div className={tw.pageHead}>
        <div>
          <Link to="/departments" className="text-brand font-medium text-[12.5px]">← Departments</Link>
          <h1>Employees</h1>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link to="/assignments/new" className={tw.btn}>
            <Icon name="arrow" size={18} /> Assign Item
          </Link>
          {canManage && (
            <button className={tw.btnPrimary} onClick={() => setModal({ initial: department ? { department } : undefined })}>
              <Icon name="plus" size={18} /> Add Employee
            </button>
          )}
        </div>
      </div>

      <CrmBar onSynced={reload} />

      <section className={tw.card}>
        <div className={tw.cardHead}>
          <h2>All Employees {data && <span className="ml-1.5 align-middle bg-brand-soft text-brand text-xs font-semibold px-2 py-0.5 rounded-md">{data.length}</span>}</h2>
          <div className={tw.filters}>
            <div className={tw.search}>
              <Icon name="search" size={16} />
              <input
                value={search}
                onChange={(e) => setParams(e.target.value ? { search: e.target.value } : {}, { replace: true })}
                placeholder="Search ID or name…"
              />
            </div>
            <select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All Departments</option>
              {(departments || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
        </div>
        {loading ? (
          <div className={tw.loading}>Loading…</div>
        ) : error ? (
          <div className="text-danger p-6">{error.message}</div>
        ) : !data.length ? (
          <Empty>No employees found. Employees are added automatically when you assign an item.</Empty>
        ) : (
          <>
          <div className={tw.tableWrap}>
            <table className={tw.table}>
              <thead>
                <tr>
                  <th>Employee ID</th><th>Name</th><th>Department</th><th>Designation</th><th>Location</th>
                  <th className="text-right tabular-nums">Items Held</th><th>Status</th><th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pg.pageRows.map((e) => (
                  <tr key={e._id} className="clickable" onClick={() => navigate(`/employees/${e.employeeId}`)}>
                    <td className="font-mono text-[12.5px] tracking-tight">{e.employeeId}</td>
                    <td>
                      <div className={tw.itemCell}>
                        <div className="grid place-items-center rounded-full font-semibold shrink-0 w-[30px] h-[30px] bg-brand-soft text-brand text-xs">{initials(e.name)}</div>
                        {e.name}
                      </div>
                    </td>
                    <td>{e.department?.name}</td>
                    <td>{e.designation || '—'}</td>
                    <td>{e.location || '—'}</td>
                    <td className="text-right tabular-nums font-semibold">{e.assignedCount}</td>
                    <td><StatusBadge status={e.status} /></td>
                    <td className="text-right" onClick={(ev) => ev.stopPropagation()}>
                      <ActionMenu
                        actions={[
                          e.status === 'Active' && { label: 'Assign item', icon: 'arrow', onClick: () => navigate(`/assignments/new?employee=${e.employeeId}`) },
                          canManage && { label: 'Edit', icon: 'edit', onClick: () => setModal({ employee: e }) },
                          canDelete && { label: 'Delete', icon: 'trash', danger: true, onClick: () => remove(e) },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pg={pg} label="employees" />
          </>
        )}
      </section>

      {modal && (
        <Modal title={modal.employee ? 'Edit Employee' : 'Add Employee'} onClose={() => setModal(null)} width={640}>
          <EmployeeForm initial={modal.employee || modal.initial} onCancel={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
        </Modal>
      )}
    </>
  );
}
