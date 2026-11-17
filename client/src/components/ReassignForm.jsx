import { useMemo, useState } from 'react';
import { api, fmtDate, today } from '../api.js';
import { Field, useAsync, useToast } from './ui.jsx';
import { tw } from './tw.js';

// Move an item straight from its current holder to another employee
export default function ReassignForm({ assignment, onDone, onCancel }) {
  const toast = useToast();
  const holding = assignment.quantity - assignment.returnedQuantity;
  const { data: departments } = useAsync(api.departments);
  const [departmentId, setDepartmentId] = useState(assignment.department || ''); // same department by default
  const [q, setQ] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [form, setForm] = useState({ quantity: holding, date: today(), notes: '' });
  const [saving, setSaving] = useState(false);

  const { data: employees, loading: loadingEmp } = useAsync(
    () => (departmentId ? api.employees({ department: departmentId, status: 'Active' }) : Promise.resolve([])),
    [departmentId]
  );
  const options = useMemo(
    () =>
      (employees || [])
        .filter((e) => e.employeeId !== assignment.employeeCode)
        .filter((e) => !q || `${e.name} ${e.employeeId}`.toLowerCase().includes(q.toLowerCase())),
    [employees, q, assignment.employeeCode]
  );
  const target = (employees || []).find((e) => e._id === employeeId);

  const submit = async (e) => {
    e.preventDefault();
    if (!employeeId) return toast('Choose the employee to give it to', 'error');
    setSaving(true);
    try {
      await api.reassign(assignment._id, { employeeId, quantity: Number(form.quantity), date: form.date, notes: form.notes });
      toast(`${form.quantity} × ${assignment.itemName} reassigned to ${target?.name}`);
      onDone();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={tw.form}>
      <div className={tw.infoBox}>
        <div><span>Item</span>{assignment.itemName}</div>
        <div><span>Now with</span>{assignment.employeeName} ({assignment.employeeCode}) · {assignment.departmentName}</div>
        <div><span>Since</span>{fmtDate(assignment.issueDate)}</div>
        <div><span>Holding</span><strong>{holding}</strong></div>
      </div>

      <div className={tw.grid2}>
        <Field label="Give to — Department" required>
          <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setEmployeeId(''); setQ(''); }} required autoFocus>
            <option value="">Select department…</option>
            {(departments || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Quantity" required hint={holding > 1 ? `Up to ${holding} — the rest stays with ${assignment.employeeName}` : undefined}>
          <input type="number" min="1" max={holding} step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        </Field>
      </div>

      <Field label="Give to — Employee" required hint={departmentId && !loadingEmp && !(employees || []).length ? 'No active employees in this department.' : undefined}>
        <div className="flex flex-col gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={departmentId ? 'Search name or Employee ID…' : 'Select department first'} disabled={!departmentId} />
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required disabled={!departmentId} size={departmentId && options.length ? Math.min(6, options.length + 1) : undefined} className="!h-auto min-h-10 py-1">
            <option value="">{loadingEmp ? 'Loading…' : `Select employee… (${options.length})`}</option>
            {options.map((e) => <option key={e._id} value={e._id}>{e.name} — {e.employeeId}{e.designation ? ` · ${e.designation}` : ''}</option>)}
          </select>
        </div>
      </Field>

      <div className={tw.grid2}>
        <Field label="Date" required>
          <input type="date" value={form.date} max={today()} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </Field>
        <Field label="Notes (Optional)">
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Team change" />
        </Field>
      </div>

      {target && (
        <p className="m-0 px-3 py-2.5 rounded-lg bg-brand-soft text-[13px]">
          <strong>{form.quantity} × {assignment.itemName}</strong> moves from <strong>{assignment.employeeName}</strong> to <strong>{target.name}</strong> ({target.employeeId}). Stock doesn't change.
        </p>
      )}

      <div className={tw.formActions}>
        <button type="button" className={tw.btn} onClick={onCancel}>Cancel</button>
        <button className={tw.btnPrimary} disabled={saving || !employeeId}>{saving ? 'Reassigning…' : 'Reassign'}</button>
      </div>
    </form>
  );
}
