import { useMemo, useState } from 'react';
import { api, fmtDate, today } from '../api.js';
import { Field, useAsync, useToast } from './ui.jsx';
import SearchSelect from './SearchSelect.jsx';
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
          <SearchSelect options={(departments || []).map((d) => ({ value: d._id, label: d.name }))} value={departmentId} onChange={(v) => { setDepartmentId(v); setEmployeeId(''); setQ(''); }} loading={!departments} placeholder="Search department…" emptyText="No department matches" required autoFocus />
        </Field>
        <Field label="Quantity" required hint={holding > 1 ? `Up to ${holding} — the rest stays with ${assignment.employeeName}` : undefined}>
          <input type="number" min="1" max={holding} step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
        </Field>
      </div>

      <Field label="Give to — Employee" required hint={departmentId && !loadingEmp && !(employees || []).length ? 'No active employees in this department.' : undefined}>
        <SearchSelect
          options={options.map((e) => ({ value: e._id, label: `${e.employeeId} — ${e.name}`, sub: [e.designation, e.location].filter(Boolean).join(' · ') || undefined }))}
          value={employeeId}
          onChange={setEmployeeId}
          loading={loadingEmp}
          disabled={!departmentId}
          placeholder={departmentId ? 'Search employee by ID or name…' : 'Select department first'}
          emptyText="No active employee matches"
          required
        />
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
