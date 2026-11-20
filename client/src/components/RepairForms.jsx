import { useEffect, useState } from 'react';
import { api, fmtDate, today } from '../api.js';
import { Field, StatusBadge, useAsync, useToast } from './ui.jsx';
import { tw } from './tw.js';
import SearchSelect from './SearchSelect.jsx';

// Same list as the server (GET /api/repairs/options)
export const DAMAGE_TYPES = ['Screen broken', 'Body damage', "Won't turn on", 'Keys / ports', 'Water damage', 'Software'];
export const IN_HOUSE = 'In-house IT';

export const money = (n) => (n == null || n === '' ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);

// Shrink a photo to a small JPEG data URL (max 1024 px) so it can be saved with the record
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Text box look for inputs that are not inside <Field>
const INPUT = 'h-10 w-full px-3 rounded-lg border border-[#D3D9D5] bg-white outline-none focus:border-brand focus:ring-2 focus:ring-brand/15';

const addDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const niceDay = (s) => new Date(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/** Pill button that can be on/off. tone: amber | blue | green | red */
const TONES = {
  amber: 'border-warn bg-warn-soft text-warn',
  blue: 'border-[#1D4ED8] bg-[#E6EEFB] text-[#1D4ED8]',
  green: 'border-ok bg-ok-soft text-ok',
  red: 'border-danger bg-danger-soft text-danger',
};
export function Chip({ on, tone = 'blue', dashed, className = '', children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={!!on}
      className={`min-h-[38px] px-3.5 rounded-full border text-[13.5px] cursor-pointer transition-colors ${
        on ? `${TONES[tone]} border-2 font-semibold` : dashed ? 'border-dashed border-[#A9B3AF] bg-white text-brand font-semibold' : 'border-line bg-white hover:bg-paper'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

const Label = ({ children, optional, required }) => (
  <div className="text-[14px] font-semibold">
    {children} {required && <span className="text-danger">*</span>}
    {optional && <span className="font-normal text-muted text-[12.5px]">optional</span>}
  </div>
);

/** Good / Damaged / Lost buttons (Return dialog) */
export function ConditionPicker({ value, onChange }) {
  const opts = [['Good', 'green'], ['Damaged', 'amber'], ['Lost', 'red']];
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Condition">
      {opts.map(([v, tone]) => (
        <Chip key={v} on={value === v} tone={tone} className="!rounded-lg h-11" onClick={() => onChange(v)}>{v}</Chip>
      ))}
    </div>
  );
}

/** Big photo tile: tap to take / upload, shows the picture once chosen */
function PhotoTile({ value, onChange }) {
  const toast = useToast();
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Please choose an image', 'error');
    try {
      onChange(await readPhoto(f));
    } catch {
      toast('Could not read that image', 'error');
    }
  };
  return (
    <label className={`relative h-[132px] rounded-xl border-2 border-dashed grid place-items-center cursor-pointer overflow-hidden ${value ? 'border-line bg-paper' : 'border-[#C9B48F] bg-[#FFFBF4] hover:bg-white text-[#8A5A1B]'}`}>
      {value ? (
        <>
          <img src={value} alt="Damage" className="h-full w-full object-contain" />
          <span className="absolute bottom-2 right-2 px-2.5 py-1 rounded-md bg-black/60 text-white text-[12px]">Change photo</span>
        </>
      ) : (
        <span className="flex flex-col items-center gap-1.5">
          <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          <b className="text-[14px]">Take or upload photo</b>
          <small className="text-[12px]">JPG / PNG</small>
        </span>
      )}
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
    </label>
  );
}

/** What's wrong (chips) + photo (required) + one-line note. Used by Return and Mark damaged. */
export function DamageFields({ value, onChange, lost }) {
  const set = (patch) => onChange({ ...value, ...patch });
  if (lost)
    return (
      <div className="flex flex-col gap-2">
        <Label optional>How was it lost?</Label>
        <input className={INPUT} value={value.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Left in cab, not found" />
        <p className="m-0 text-[12.5px] text-danger">It will be written off — total stock goes down.</p>
      </div>
    );
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-2">
        <Label>What's wrong?</Label>
        <div className="flex flex-wrap gap-2">
          {DAMAGE_TYPES.map((t) => (
            <Chip key={t} tone="amber" on={value.damageType === t} onClick={() => set({ damageType: value.damageType === t ? '' : t })}>{t}</Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label required>Photo</Label>
        <PhotoTile value={value.photo} onChange={(photo) => set({ photo })} />
      </div>
      <div className="flex flex-col gap-2">
        <Label optional>Note</Label>
        <input className={INPUT} value={value.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Crack on bottom-left corner" />
      </div>
    </div>
  );
}

export const emptyDamage = { damageType: '', description: '', photo: '' };

const Sub = ({ children }) => <div className="-mt-1 text-[13.5px] text-muted">{children}</div>;
const Note = ({ children }) => <div className="px-3 py-2.5 rounded-lg bg-paper text-[13px] text-[#4A5551]">{children}</div>;

/** One of two big choices ("In store" / "With an employee") */
function WhereOption({ on, disabled, title, text, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 flex flex-col gap-0.5 px-3.5 py-3 rounded-xl border text-left ${
        disabled ? 'border-line bg-paper opacity-60 cursor-not-allowed' : on ? 'border-2 border-brand bg-brand-soft cursor-pointer' : 'border-line bg-white hover:bg-paper cursor-pointer'
      }`}
    >
      <b className={`text-[14px] ${on ? 'text-brand' : ''}`}>{title}</b>
      <span className="text-[12.5px] text-muted">{text}</span>
    </button>
  );
}

/**
 * Mark damaged (or lost).
 * With `assignment` (Damage button on Assignments): that employee has it — it is taken back now.
 * Without (Repairs page): pick the item, then where it was: in store (not assigned yet) or with an employee.
 */
export function ReportDamageForm({ assignment, itemId: startItem = '', onDone, onCancel }) {
  const toast = useToast();
  const { data: items } = useAsync(() => (assignment ? Promise.resolve([]) : api.items({ status: 'Active' })), [assignment]);
  const [itemId, setItemId] = useState(startItem);
  const [where, setWhere] = useState(''); // 'store' = before assigning · 'employee' = after assigning
  const [holderId, setHolderId] = useState(''); // the assignment of the employee who has it
  const { data: holders, loading: holdersLoading } = useAsync(
    () => (!assignment && itemId ? api.assignments({ item: itemId, status: 'Active' }) : Promise.resolve([])),
    [itemId]
  );
  const [quantity, setQuantity] = useState(1);
  const [lost, setLost] = useState(false);
  const [dmg, setDmg] = useState(emptyDamage);
  const [saving, setSaving] = useState(false);

  const choices = (items || []).filter((i) => i.availableQuantity > 0 || i.assignedQuantity > 0);
  const picked = choices.find((i) => i._id === itemId);
  const inStore = picked?.availableQuantity || 0;
  const withEmp = picked?.assignedQuantity || 0;
  const holding = (a) => a.quantity - a.returnedQuantity;
  const holder = assignment || (where === 'employee' ? (holders || []).find((h) => h._id === holderId) : null);
  const max = holder ? holding(holder) : inStore || 1;

  const pickItem = (id) => {
    const it = choices.find((i) => i._id === id);
    setItemId(id);
    setHolderId('');
    setQuantity(1);
    // Only one possibility? Choose it already.
    setWhere(!it ? '' : it.availableQuantity > 0 && !it.assignedQuantity ? 'store' : it.assignedQuantity > 0 && !it.availableQuantity ? 'employee' : '');
  };
  // Opened from an item (Inventory ⋮ menu): once items load, pre-choose "in store" / "with employee" like a manual pick
  useEffect(() => {
    if (startItem && items) pickItem(startItem);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only one employee has it? Select them already.
  if (where === 'employee' && !holderId && holders?.length === 1) setHolderId(holders[0]._id);

  const submit = async (e) => {
    e.preventDefault();
    if (!assignment && !where) return toast('Choose where the item was: in store or with an employee', 'error');
    if (!assignment && where === 'employee' && !holder) return toast('Choose the employee who has it', 'error');
    if (!lost && !dmg.photo) return toast('Add a photo of the damage', 'error');
    setSaving(true);
    try {
      await api.reportDamage({
        ...(holder ? { assignmentId: holder._id } : { itemId }),
        quantity: Number(quantity), date: today(), ...dmg,
        ...(lost && { damageType: '', photo: '' }), // lost: no damage type or photo
        lost, // last, so nothing can overwrite it
      });
      toast(lost ? `${quantity} × written off as lost` : `${quantity} × marked damaged${holder ? ` — taken back from ${holder.employeeName}` : ''}`);
      onDone();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-[18px]">
      {/* Damaged or Lost: always visible, the chosen one is highlighted */}
      <div className="flex flex-col gap-2">
        <Label required>What happened?</Label>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Damaged or lost">
          <Chip tone="amber" on={!lost} className="!rounded-lg h-11" onClick={() => setLost(false)}>Damaged</Chip>
          <Chip tone="red" on={lost} className="!rounded-lg h-11" onClick={() => setLost(true)}>Lost</Chip>
        </div>
        <small className="text-muted">
          {lost ? 'Lost: written off now — total stock goes down. No repair.' : 'Damaged: kept out of stock until it is repaired or scrapped.'}
        </small>
      </div>
      {assignment ? (
        <Sub>{assignment.itemName} · with {assignment.employeeName} ({assignment.employeeCode})</Sub>
      ) : (
        <>
          <Field label="Item" required>
            <SearchSelect
              value={itemId}
              onChange={pickItem}
              required
              placeholder="Type item name, brand or category…"
              loading={!items}
              emptyText="No item matches"
              options={choices.map((i) => ({
                value: i._id,
                label: `${i.name} · ${i.category}`,
                sub: `${i.availableQuantity} in store · ${i.assignedQuantity} with employees${i.brand ? ` · ${i.brand}` : ''}`,
              }))}
            />
          </Field>

          {picked && (
            <div className="flex flex-col gap-2">
              <Label required>{lost ? 'Where was it when it was lost?' : 'Where was it when it got damaged?'}</Label>
              <div className="flex gap-2 max-sm:flex-col">
                <WhereOption
                  on={where === 'store'}
                  disabled={!inStore}
                  onClick={() => { setWhere('store'); setQuantity(1); }}
                  title="In store (before assigning)"
                  text={inStore ? `Not given to anyone yet · ${inStore} in store` : 'None in store right now'}
                />
                <WhereOption
                  on={where === 'employee'}
                  disabled={!withEmp}
                  onClick={() => { setWhere('employee'); setQuantity(1); }}
                  title="With an employee (after assigning)"
                  text={withEmp ? `${withEmp} with employees · taken back from them` : 'Not assigned to anyone'}
                />
              </div>
            </div>
          )}

          {where === 'employee' && (
            <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-line bg-paper">
              <Field label="Who has it?" required>
                <SearchSelect
                  value={holderId}
                  onChange={(v) => { setHolderId(v); setQuantity(1); }}
                  required
                  placeholder="Type Employee ID, name or department…"
                  loading={holdersLoading}
                  emptyText="No employee with this item matches"
                  options={(holders || []).map((h) => ({
                    value: h._id,
                    label: `${h.employeeCode} · ${h.employeeName}`,
                    sub: `${h.departmentName || 'No department'} · has ${holding(h)}`,
                  }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Employee ID">
                  <input value={holder?.employeeCode || ''} readOnly placeholder="—" className="!bg-white" />
                </Field>
                <Field label="Department">
                  <input value={holder?.departmentName || ''} readOnly placeholder="—" className="!bg-white" />
                </Field>
              </div>
            </div>
          )}
        </>
      )}
      {max > 1 && (assignment || where === 'store' || (where === 'employee' && holder)) && (
        <Field label="How many?" hint={`${holder ? `${holder.employeeName} has` : 'In store'}: ${max}`}>
          <input type="number" min="1" max={max} step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required className="!w-32" />
        </Field>
      )}
      <DamageFields value={dmg} onChange={setDmg} lost={lost} />
      {!lost && <Note>{holder ? `Taken back from ${holder.employeeName} now. ` : ''}Not counted in stock until it's fixed.</Note>}
      <div className="flex items-center justify-end gap-2 pt-3.5 border-t border-line">
        <button type="button" className={tw.btn} onClick={onCancel}>Cancel</button>
        <button className={lost ? tw.btnDanger : tw.btnPrimary} disabled={saving}>{saving ? 'Saving…' : lost ? 'Mark as lost' : 'Mark as damaged'}</button>
      </div>
    </form>
  );
}

/** Send to repair: who (chips) + when back (chips) + estimated cost */
export function SendRepairForm({ repair, onDone, onCancel }) {
  const toast = useToast();
  const { data: vendors } = useAsync(api.repairVendors);
  const [vendor, setVendor] = useState('');
  const [days, setDays] = useState(7);
  const [date, setDate] = useState(addDays(7));
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);
  const tried = (repair.attempts || []).map((a) => a.vendor).filter(Boolean);
  const back = days ? addDays(days) : date;

  const submit = async (e) => {
    e.preventDefault();
    if (!vendor.trim()) return toast('Enter the vendor name', 'error');
    if (cost === '') return toast('Enter the estimated cost', 'error');
    setSaving(true);
    try {
      await api.sendToRepair(repair._id, {
        by: 'Outside vendor',
        vendor: vendor.trim(),
        sentAt: today(), expectedAt: back, estimatedCost: cost,
      });
      toast(`${repair.itemName} sent to ${vendor.trim()}`);
      onDone();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Sub>{repair.itemName}{repair.damageType ? ` · ${repair.damageType}` : ''}</Sub>
      {tried.length > 0 && (
        <Note>Came back <b>not repaired</b> from {tried.join(', ')}. Try another vendor, or close this and Scrap it.</Note>
      )}
      <div className="flex flex-col gap-2">
        <Label required>Vendor</Label>
        <input
          className={INPUT}
          list="repair-vendors"
          autoFocus
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="Vendor / service centre name"
          required
        />
        {/* Vendors used before appear as suggestions while typing */}
        <datalist id="repair-vendors">
          {(vendors || []).filter((v) => v.name !== IN_HOUSE).map((v) => <option key={v.name} value={v.name} />)}
        </datalist>
      </div>
      <div className="flex flex-col gap-2">
        <Label>When will it come back?</Label>
        <div className="grid grid-cols-4 gap-2">
          {[[3, '3 days'], [7, '1 week'], [14, '2 weeks'], [0, 'Pick date']].map(([d, l]) => (
            <Chip key={l} on={days === d} className="!rounded-lg h-10" onClick={() => setDays(d)}>{l}</Chip>
          ))}
        </div>
        {days === 0 && <input className={INPUT} type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} required />}
        <small className="text-muted">Back by {niceDay(back)}. Shows as late after that.</small>
      </div>
      <div className="flex flex-col gap-2">
        <Label required>Estimated cost (₹)</Label>
        <input className={INPUT} type="number" min="0" step="1" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 3500" required />
      </div>
      <div className="flex justify-end gap-2 pt-3.5 border-t border-line">
        <button type="button" className={tw.btn} onClick={onCancel}>Cancel</button>
        <button className={tw.btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Send'}</button>
      </div>
    </form>
  );
}

/** Got it back (fixed / can't fix) — also used for "Scrap" from the Damaged column */
export function RepairResultForm({ repair, initialOutcome = 'Repaired', onDone, onCancel }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState(initialOutcome);
  const [cost, setCost] = useState(initialOutcome === 'Repaired' ? repair.repair?.estimatedCost ?? '' : '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const fixed = outcome === 'Repaired';
  const notFixed = outcome === 'Not repaired';
  const sent = repair.status === 'In repair';
  const vendorName = repair.repair?.vendor || repair.repair?.by;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.repairResult(repair._id, { outcome, date: today(), finalCost: cost, notes });
      toast(fixed ? `${repair.itemName} is back in stock` : notFixed ? `${repair.itemName} moved back to Damaged — send to another vendor or scrap` : `${repair.itemName} scrapped`);
      onDone();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const Option = ({ value, title, text, tone }) => (
    <button type="button" aria-pressed={outcome === value} onClick={() => setOutcome(value)}
      className={`flex flex-col gap-0.5 px-4 py-3.5 rounded-xl border text-left cursor-pointer ${outcome === value ? `${TONES[tone]} border-2` : 'border-line bg-white hover:bg-paper'}`}>
      <b className={`text-[15px] ${tone === 'green' ? 'text-ok' : tone === 'amber' ? 'text-warn' : 'text-danger'}`}>{title}</b>
      <span className="text-[13px] text-muted">{text}</span>
    </button>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Sub>{repair.quantity > 1 ? `${repair.quantity} × ` : ''}{repair.itemName}{sent ? ` · from ${repair.repair?.vendor || repair.repair?.by}` : ''}</Sub>
      <div className="flex flex-col gap-2.5">
        <Label>{sent ? 'Is it working?' : 'What happens to it?'}</Label>
        {sent && <Option value="Repaired" tone="green" title="✓ Yes, it's fixed" text="Goes back to stock, can be assigned again" />}
        {sent && <Option value="Not repaired" tone="amber" title="↩ Not repaired — try another vendor" text={`${vendorName} couldn't fix it. Moves back to Damaged.`} />}
        <Option value="Scrapped" tone="red" title="✕ Can't be fixed — scrap it" text={`Total stock goes down by ${repair.quantity}`} />
        {!sent && <Option value="Repaired" tone="green" title="✓ It's fine after all" text="Put it back in stock without repair" />}
      </div>
      <div className="flex flex-col gap-2">
        <Label optional>{notFixed ? 'Checking charge paid (₹)' : 'Amount paid (₹)'}</Label>
        <input className={INPUT} type="number" min="0" step="1" value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label optional>Note</Label>
        <input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={fixed ? 'e.g. Motherboard replaced' : notFixed ? 'e.g. Part not available' : 'e.g. Board dead, not worth fixing'} />
      </div>
      <div className="flex justify-end gap-2 pt-3.5 border-t border-line">
        <button type="button" className={tw.btn} onClick={onCancel}>Cancel</button>
        <button className={fixed || notFixed ? tw.btnPrimary : tw.btnDanger} disabled={saving}>{saving ? 'Saving…' : fixed ? 'Done — back in stock' : notFixed ? 'Move back to Damaged' : 'Scrap it'}</button>
      </div>
    </form>
  );
}

/** Read-only view of one record, with a simple timeline */
export function RepairDetails({ id }) {
  const { data: r, loading, error } = useAsync(() => api.repair(id), [id]);
  if (loading) return <div className={tw.loading}>Loading…</div>;
  if (error) return <div className="text-danger">{error.message}</div>;
  const steps = [
    { label: r.status === 'Lost' ? 'Reported lost' : 'Reported damaged', date: r.reportedAt, text: [r.damageType, r.description].filter(Boolean).join(' · ') },
    ...(r.attempts || []).flatMap((a) => [
      { label: `Sent to ${a.vendor}`, date: a.sentAt, text: a.estimatedCost != null ? `estimate ${money(a.estimatedCost)}` : '' },
      { label: 'Came back NOT repaired', date: a.returnedAt, text: [a.cost != null && `paid ${money(a.cost)}`, a.notes].filter(Boolean).join(' · ') },
    ]),
    r.repair?.sentAt && { label: `Sent to ${r.repair.vendor || r.repair.by}`, date: r.repair.sentAt, text: [ r.repair.contact, r.repair.jobNo && `Job ${r.repair.jobNo}`, r.repair.expectedAt && `expected ${fmtDate(r.repair.expectedAt)}`, `estimate ${money(r.repair.estimatedCost)}`, r.repair.notes].filter(Boolean).join(' · ') },
    r.result?.outcome && r.status !== 'Lost' && { label: r.status === 'Repaired' ? 'Repaired — back in stock' : 'Scrapped — written off', date: r.result.date, text: [r.result.finalCost != null && `cost ${money(r.result.finalCost)}`, r.result.notes].filter(Boolean).join(' · ') },
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-4">
      <dl className={tw.kv + ' !my-0'}>
        <div><dt>Item</dt><dd>{r.quantity} × {r.itemName} <span className="text-muted">({r.category})</span></dd></div>
        <div><dt>From</dt><dd>{r.employeeName ? `${r.employeeName} (${r.employeeCode}) · ${r.departmentName}` : 'Office stock'}</dd></div>
        <div><dt>Status</dt><dd><StatusBadge status={r.status} />{r.overdueDays > 0 && <span className="ml-2 text-danger text-[12.5px] font-semibold">Overdue {r.overdueDays} day(s)</span>}</dd></div>
      </dl>
      {r.photo && <img src={r.photo} alt="Damage" className="max-h-56 w-fit rounded-lg border border-line" />}
      <ol className="m-0 p-0 list-none flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${i === steps.length - 1 ? 'bg-brand' : 'bg-[#C5CCC8]'}`} />
            <span className="flex flex-col">
              <b className="text-[13.5px]">{s.label} <span className="font-normal text-muted">· {fmtDate(s.date)}</span></b>
              {s.text && <span className="text-[13px] text-muted">{s.text}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
