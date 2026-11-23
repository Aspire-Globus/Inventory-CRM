import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icons.jsx';
import { ActionMenu, Empty, Field, Modal, useAsync, useToast } from '../components/ui.jsx';
import { EmployeeForm } from './Employees.jsx';
import { CrmBar, useCrm } from '../components/Crm.jsx';
import { tw } from '../components/tw.js';

function DepartmentForm({ initial, onSaved, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: initial?.name || '', code: initial?.code || '', description: initial?.description || '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    try {
      initial ? await api.updateDepartment(initial._id, form) : await api.createDepartment(form);
      toast(initial ? 'Department updated' : 'Department created');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  return (
    <form onSubmit={submit} className={tw.form}>
      <div className={tw.grid2}>
        <Field label="Department Name" required>
          <input value={form.name} onChange={set('name')} required autoFocus />
        </Field>
        <Field label="Code">
          <input value={form.code} onChange={set('code')} placeholder="IT" />
        </Field>
      </div>
      <Field label="Description">
        <textarea rows={2} value={form.description} onChange={set('description')} />
      </Field>
      <div className={tw.formActions}>
        <button type="button" className={tw.btn} onClick={onCancel}>Cancel</button>
        <button className={tw.btnPrimary}>Save</button>
      </div>
    </form>
  );
}

export default function Departments() {
  const toast = useToast();
  const { can } = useAuth();
  const crm = useCrm(); // CRM link on -> departments come from the CRM
  const canManage = can('departments') && !crm.enabled;
  const canDelete = canManage && can('delete');
  const navigate = useNavigate();
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useAsync(api.departments);
  const remove = async (d) => {
    if (!confirm(`Delete department "${d.name}"?\n\nIt goes to the Recycle Bin and an administrator can restore it within 30 days.`)) return;
    try {
      await api.deleteDepartment(d._id);
      toast('Department moved to Recycle Bin');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <div className={tw.pageHead}>
        <h1>Departments</h1>
        {canManage && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <button className={tw.btn} onClick={() => setModal({ type: 'employee' })} disabled={!data?.length}>
              <Icon name="users" size={18} /> Add Employee
            </button>
            <button className={tw.btnPrimary} onClick={() => setModal({ type: 'dep' })}>
              <Icon name="plus" size={18} /> Add Department
            </button>
          </div>
        )}
      </div>
      <CrmBar onSynced={reload} />
      {loading ? (
        <div className={tw.loading}>Loading…</div>
      ) : error ? (
        <div className="card bg-white border border-line rounded-xl shadow-panel p-6 text-danger">{error.message}</div>
      ) : !data.length ? (
        <div className={tw.card}><Empty>No departments yet.</Empty></div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {data.map((d) => (
            <div className="card bg-white border border-line rounded-xl shadow-panel p-[18px] [&_p]:mt-3" key={d._id}>
              <div className="flex items-center gap-3">
                <div className="grid place-items-center w-[42px] h-[42px] rounded-lg bg-brand-soft text-brand"><Icon name="building" /></div>
                <div className="flex-1 min-w-0">
                  <h3 className="truncate">{d.name}</h3>
                  {/* no code line: CRM departments have no code (it was only made-up initials) */}
                </div>
                {canManage && (
                  <ActionMenu
                    actions={[
                      { label: 'Add employee', icon: 'users', onClick: () => setModal({ type: 'employee', dep: d }) },
                      { label: 'View employees', icon: 'search', onClick: () => navigate(`/employees?department=${d._id}`) },
                      { label: 'Edit', icon: 'edit', onClick: () => setModal({ type: 'dep', dep: d }) },
                      canDelete && { label: 'Delete', icon: 'trash', danger: true, onClick: () => remove(d) },
                    ]}
                  />
                )}
              </div>
              {d.description && <p className="text-muted">{d.description}</p>}
              <div className="flex gap-[18px] mt-4 pt-3.5 border-t border-line text-muted [&_strong]:text-ink [&_strong]:text-base [&_strong]:mr-1">
                <Link to={`/employees?department=${d._id}`}><strong>{d.employeeCount}</strong> employees</Link>
                <span><strong>{d.assignedItems}</strong> items assigned</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {modal?.type === 'employee' && (
        <Modal title={modal.dep ? `Add Employee — ${modal.dep.name}` : 'Add Employee'} onClose={() => setModal(null)} width={640}>
          <EmployeeForm
            initial={modal.dep ? { department: modal.dep._id } : undefined}
            onCancel={() => setModal(null)}
            onSaved={() => { setModal(null); reload(); }}
          />
        </Modal>
      )}
      {modal?.type === 'dep' && (
        <Modal title={modal.dep ? 'Edit Department' : 'Add Department'} onClose={() => setModal(null)}>
          <DepartmentForm initial={modal.dep} onCancel={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
        </Modal>
      )}
    </>
  );
}