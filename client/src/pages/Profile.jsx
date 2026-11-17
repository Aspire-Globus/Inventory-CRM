import { useState } from 'react';
import { api, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, useToast } from '../components/ui.jsx';
import { initials } from './Employees.jsx';
import { tw } from '../components/tw.js';

export default function Profile() {
  const { user, setUser, isAdmin } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '', designation: user.designation || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      setUser(await api.updateMe(form));
      toast('Profile updated');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) return toast('New passwords do not match', 'error');
    setSavingPw(true);
    try {
      await api.changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast('Password changed');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <>
      <div className={tw.pageHead}><h1>My Profile</h1></div>

      <section className="card bg-white border border-line rounded-xl shadow-panel flex flex-wrap items-center gap-6 p-6">
        <div className="grid place-items-center rounded-full font-semibold shrink-0 w-20 h-20 bg-[#E3E8E5] text-pine text-[28px]">{initials(user.name)}</div>
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2>{user.name}</h2>
            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${isAdmin ? 'bg-brand-soft text-brand' : 'bg-[#EBEEEA] text-muted'}`}>{user.role === 'Admin' ? 'Administrator' : 'Staff'}</span>
          </div>
          <dl className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-6 gap-y-3 mt-3.5 [&_dt]:text-xs [&_dt]:text-muted [&_dd]:mt-0.5 [&_dd]:font-medium">
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Designation</dt><dd>{user.designation || '—'}</dd></div>
            <div><dt>Phone</dt><dd>{user.phone || '—'}</dd></div>
            <div><dt>Last login</dt><dd>{fmtDate(user.lastLogin)}</dd></div>
            <div><dt>Member since</dt><dd>{fmtDate(user.createdAt)}</dd></div>
          </dl>
        </div>
      </section>

      <div className="grid grid-cols-[3fr_2fr] gap-5 max-lg:grid-cols-1 items-start !grid-cols-2 max-md:!grid-cols-1">
        <section className={tw.cardPad}>
          <h2 className="mb-4">Edit Details</h2>
          <form className={tw.form} onSubmit={saveProfile}>
            <Field label="Full Name" required>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Designation">
              <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email" hint="Only an administrator can change email or role.">
              <input value={user.email} readOnly className="readonly" />
            </Field>
            <div className={tw.formActions}>
              <button className={tw.btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        </section>

        <section className={tw.cardPad}>
          <h2 className="mb-4">Change Password</h2>
          <form className={tw.form} onSubmit={savePassword}>
            <Field label="Current Password" required>
              <input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" required />
            </Field>
            <Field label="New Password" required hint="At least 6 characters">
              <input type="password" minLength={6} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" required />
            </Field>
            <Field label="Confirm New Password" required>
              <input type="password" minLength={6} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" required />
              {pw.confirm && pw.confirm !== pw.newPassword && <span className="field-error text-xs text-danger">Passwords do not match</span>}
            </Field>
            <div className={tw.formActions}>
              <button className={tw.btnPrimary} disabled={savingPw}>{savingPw ? 'Updating…' : 'Update Password'}</button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
