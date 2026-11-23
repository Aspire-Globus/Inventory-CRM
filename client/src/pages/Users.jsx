import { useState } from 'react';
import { api, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icons.jsx';
import { ActionMenu, Empty, Field, Modal, StatusBadge, useAsync, useToast } from '../components/ui.jsx';
import { initials } from './Employees.jsx';
import { Pagination, usePagination } from '../components/table.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { tw } from '../components/tw.js';

// Permission labels (kept in sync with the server's PERMISSIONS list)
export const PERMISSION_LABELS = {
  inventory: 'Add / edit inventory items, stock and categories',
  departments: 'Add / edit departments',
  employees: 'Add / edit employees',
  assignments: 'Assign and return items',
  delete: 'Delete records (moves them to the Recycle Bin)',
  notifications: 'Receive change notifications',
  recycleBin: 'View and restore from the Recycle Bin (only Administrators can permanently delete)',
  users: 'Manage Staff login accounts',
};
const ALL = Object.keys(PERMISSION_LABELS);
const DEFAULT_STAFF = ['inventory', 'departments', 'employees', 'assignments', 'delete'];

function UserForm({ initial, onSaved, onCancel }) {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const editing = Boolean(initial);
  const [form, setForm] = useState({
    name: initial?.name || '',
    email: initial?.email || '',
    role: initial?.role || 'Staff',
    status: initial?.status || 'Active',
    designation: initial?.designation || '',
    phone: initial?.phone || '',
    password: '',
    permissions: initial?.permissions || DEFAULT_STAFF,
  });
  const togglePerm = (p) =>
    setForm((f) => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form };
      if (editing && !body.password) delete body.password;
      editing ? await api.updateUser(initial._id, body) : await api.createUser(body);
      toast(editing ? 'User updated' : 'User created');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={tw.form} onSubmit={submit}>
      <div className={tw.grid2}>
        <Field label="Full Name" required>
          <input value={form.name} onChange={set('name')} required autoFocus />
        </Field>
        <Field label="Email (login)" required>
          <input type="email" value={form.email} onChange={set('email')} required />
        </Field>
        <Field label="Role" required>
          <select value={form.role} onChange={set('role')} disabled={!isAdmin && initial?.role === 'Admin'}>
            {(isAdmin || initial?.role === 'Admin') && <option value="Admin">Administrator</option>}
            <option value="Staff">Staff</option>
          </select>
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={set('status')}>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </Field>
        <Field label="Designation">
          <input value={form.designation} onChange={set('designation')} />
        </Field>
        <Field label="Phone">
          <input value={form.phone} onChange={set('phone')} />
        </Field>
      </div>
      <Field
        label={editing ? 'Reset Password' : 'Password'}
        required={!editing}
        hint={editing ? 'Leave blank to keep the current password.' : 'At least 6 characters — share it with the user securely.'}
      >
        <input type="text" minLength={6} value={form.password} onChange={set('password')} required={!editing} autoComplete="new-password" />
      </Field>
      {form.role === 'Admin' ? (
        <div className="bg-paper border border-line rounded-lg px-3 py-2.5 text-[13px] text-muted [&_strong]:text-ink">
          <strong>Administrator</strong> has every permission, including managing other Administrators.
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-3.5 border border-line rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-2.5 [&_.link-btn]:!m-0 [&_.link-btn]:text-[13px]">
            <strong>Permissions</strong>
            <div className="flex items-center gap-2.5 flex-wrap">
              <button type="button" className={tw.linkBtn} onClick={() => setForm((f) => ({ ...f, permissions: [...ALL] }))}>Full access (same as Admin)</button>
              <button type="button" className={tw.linkBtn} onClick={() => setForm((f) => ({ ...f, permissions: [...DEFAULT_STAFF] }))}>Standard</button>
              <button type="button" className={tw.linkBtn} onClick={() => setForm((f) => ({ ...f, permissions: [] }))}>View only</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 max-sm:grid-cols-1">
            {ALL.map((p) => (
              <label key={p} className="flex items-start gap-2 text-[13px] cursor-pointer [&_input]:w-4 [&_input]:h-4 [&_input]:mt-px">
                <input type="checkbox" checked={form.permissions.includes(p)} onChange={() => togglePerm(p)} />
                <span>{PERMISSION_LABELS[p]}</span>
              </label>
            ))}
          </div>
          <small className="text-muted">Everyone can always view the dashboard, inventory, employees, assignments and reports.</small>
        </div>
      )}
      <div className={tw.formActions}>
        <button type="button" className={tw.btn} onClick={onCancel}>Cancel</button>
        <button className={tw.btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save User'}</button>
      </div>
    </form>
  );
}

export default function Users() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [modal, setModal] = useState(null);
  const { data, loading, error, reload } = useAsync(api.users);
  const pg = usePagination(data || []);

  const remove = async (u) => {
    if (!confirm(`Delete user ${u.name}? They will no longer be able to log in.\n\nYou can restore the account from the Recycle Bin within 30 days.`)) return;
    try {
      await api.deleteUser(u._id);
      toast('User moved to Recycle Bin');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <div className={tw.pageHead}>
        <h1>Users</h1>
        <button className={tw.btnPrimary} onClick={() => setModal({})}>
          <Icon name="plus" size={18} /> Add User
        </button>
      </div>
      <section className={tw.card}>
        <div className={tw.cardHead}>
          <h2>Login Accounts {data && <span className="ml-1.5 align-middle bg-brand-soft text-brand text-xs font-semibold px-2 py-0.5 rounded-md">{data.length}</span>}</h2>
        </div>
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : error ? (
          <div className="text-danger p-6">{error.message}</div>
        ) : !data.length ? (
          <Empty>No users.</Empty>
        ) : (
          <>
          <div className={tw.tableWrap}>
            <table className={tw.table}>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Designation</th><th>Last Login</th><th>Status</th><th className="text-right">Action</th></tr>
              </thead>
              <tbody>
                {pg.pageRows.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <div className={tw.itemCell}>
                        <div className="grid place-items-center rounded-full font-semibold shrink-0 w-[30px] h-[30px] bg-brand-soft text-brand text-xs">{initials(u.name)}</div>
                        {u.name} {String(u._id) === String(me._id) && <small className="text-muted">(you)</small>}
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td><span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${u.role === 'Admin' ? 'bg-brand-soft text-brand' : 'bg-[#EBEEEA] text-muted'}`}>{u.role === 'Admin' ? 'Administrator' : 'Staff'}</span></td>
                    <td className="text-[12.5px]">
                      {u.role === 'Admin' || (u.permissions || []).length === ALL.length
                        ? <span className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap bg-ok-soft text-ok">Full access</span>
                        : !(u.permissions || []).length
                          ? <span className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap bg-[#EBEEEA] text-muted">View only</span>
                          : <span title={(u.permissions || []).map((p) => PERMISSION_LABELS[p]).join('\n')}>{u.permissions.length} of {ALL.length} permissions</span>}
                    </td>
                    <td>{u.designation || '—'}</td>
                    <td>{fmtDate(u.lastLogin)}</td>
                    <td><StatusBadge status={u.status} /></td>
                    <td className="text-right">
                      <ActionMenu
                        actions={[
                          { label: 'Edit / reset password', icon: 'edit', onClick: () => setModal({ user: u }) },
                          String(u._id) !== String(me._id) && { label: 'Delete', icon: 'trash', danger: true, onClick: () => remove(u) },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pg={pg} label="users" />
          </>
        )}
      </section>
      {modal && (
        <Modal title={modal.user ? 'Edit User' : 'Add User'} onClose={() => setModal(null)} width={620}>
          <UserForm initial={modal.user} onCancel={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
        </Modal>
      )}
    </>
  );
}
