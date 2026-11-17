import { useState } from 'react';
import { api, fmtDate, today } from '../api.js';
import { Field, useToast } from './ui.jsx';
import { ConditionPicker, DamageFields, emptyDamage } from './RepairForms.jsx';
import { tw } from './tw.js';

export default function ReturnForm({ assignment, onDone, onCancel }) {
  const toast = useToast();
  const outstanding = assignment.quantity - assignment.returnedQuantity;
  const [form, setForm] = useState({ quantity: outstanding, returnDate: today(), condition: 'Good', notes: '' });
  const [dmg, setDmg] = useState(emptyDamage);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.condition === 'Damaged' && !dmg.photo) return toast('Add a photo of the damage', 'error');
    setSaving(true);
    try {
      const bad = form.condition !== 'Good';
      await api.returnItem(assignment._id, { ...form, ...(bad && dmg), notes: bad ? dmg.description : form.notes, quantity: Number(form.quantity) });
      toast(
        form.condition === 'Good' ? `${form.quantity} × ${assignment.itemName} returned to stock`
          : form.condition === 'Lost' ? `${form.quantity} × ${assignment.itemName} written off as lost`
          : `${form.quantity} × ${assignment.itemName} returned as Damaged — see Repairs`
      );
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
        <div><span>Employee</span>{assignment.employeeName} ({assignment.employeeCode})</div>
        <div><span>Issued</span>{assignment.quantity} on {fmtDate(assignment.issueDate)}</div>
        <div><span>Still holding</span><strong>{outstanding}</strong></div>
      </div>
      <div className={tw.grid2}>
        <Field label="Return Quantity" required hint={`Max ${outstanding}`}>
          <input type="number" min="1" max={outstanding} step="1" value={form.quantity} onChange={set('quantity')} required />
        </Field>
        <Field label="Return Date" required>
          <input type="date" value={form.returnDate} onChange={set('returnDate')} max={today()} required />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-[13px]">Condition</span>
        <ConditionPicker value={form.condition} onChange={(condition) => setForm((f) => ({ ...f, condition }))} />
      </div>
      {form.condition === 'Good' ? (
        <Field label="Notes (Optional)">
          <textarea rows={2} value={form.notes} onChange={set('notes')} />
        </Field>
      ) : (
        <DamageFields value={dmg} onChange={setDmg} lost={form.condition === 'Lost'} />
      )}
      <div className={tw.formActions}>
        <button type="button" className={tw.btn} onClick={onCancel}>Cancel</button>
        <button className={tw.btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Record Return'}</button>
      </div>
    </form>
  );
}
