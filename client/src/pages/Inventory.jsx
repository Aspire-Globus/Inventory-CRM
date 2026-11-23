import { Fragment, useMemo, useState, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, downloadCSV, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icons.jsx';
import { ActionMenu, Empty, Field, Modal, StatusBadge, useAsync, useToast } from '../components/ui.jsx';
import { ReportDamageForm } from '../components/RepairForms.jsx';
// Loaded only when Import is clicked (keeps the Excel/CSV code out of the first page load)
const ImportDialog = lazy(() => import('../components/ImportDialog.jsx'));
import { CategoryCards } from './Dashboard.jsx';
import { useCategories, newestFirst } from '../categories.jsx';
import { BulkBar, CheckAll, CheckCell, Pagination, SortTh, usePagination, useSelection, useSort } from '../components/table.jsx';
import { tw } from '../components/tw.js';
import { ListSkeleton, TableSkeleton } from '../components/Skeleton.jsx';
import { useUrlParam } from '../components/useUrlParam.js';

// Item form -> multipart/form-data. The picture goes as a real file in field "image";
// specs (an object) is sent as a JSON string.
// Picture formats the server accepts (server/src/middleware/upload.js)
const IMAGE_TYPES = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP', 'image/gif': 'GIF' };
const IMAGE_MAX_MB = 5;

function toFormData(body, file, removeImage) {
  const fd = new FormData();
  Object.entries(body).forEach(([k, v]) => {
    if (k === 'image' || v === undefined || v === null) return;
    fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  });
  if (file) fd.append('image', file);
  else if (removeImage) fd.append('removeImage', 'true'); // edit: picture removed
  return fd;
}

// Dropdown of the values set up in Inventory → Manage Categories (no free typing).
// An old value that is no longer in the list is kept as an option so editing never loses it.
function Pick({ value, options, onChange, placeholder = 'Select…', required, disabled }) {
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select value={value} required={required} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {opts.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

const toDateInput = (d) => (d ? String(d).slice(0, 10) : '');

export function ItemForm({ initial, existing = [], onSaved, onCancel }) {
  const toast = useToast();
  const editing = Boolean(initial?._id);
  const [imageFile, setImageFile] = useState(null); // new picture chosen (sent as a file)
  const [form, setForm] = useState({
    category: initial?.category || '',
    subCategory: initial?.subCategory || '',
    brand: initial?.brand || '',
    model: initial?.model || '',
    name: initial?.name || '',
    specs: { ...(initial?.specs || {}) },
    totalQuantity: initial?.totalQuantity ?? '',
    unit: initial?.unit || 'pcs',
    unitPrice: initial?.unitPrice ?? '',
    vendor: initial?.vendor || '',
    purchaseDate: toDateInput(initial?.purchaseDate),
    warrantyUntil: toDateInput(initial?.warrantyUntil),
    description: initial?.description || '',
    image: initial?.image || '',
  });
  const [nameTouched, setNameTouched] = useState(editing);
  const [saving, setSaving] = useState(false);
  const { can } = useAuth();
  const cats = useCategories();
  const cfg = cats.byName(form.category) || { subCategories: [], brands: [], fields: [] };
  // Spec fields for this category; fields marked "Show for" appear only for those sub-categories
  const specFields = cats.fieldsFor(form.category, form.subCategory);

  const update = (patch) =>
    setForm((f) => {
      const next = { ...f, ...patch };
      // Auto-build the item name from Brand + Model (or Brand + Sub-category) until the admin edits it
      if (!nameTouched) next.name = [next.brand, next.model || next.subCategory].filter(Boolean).join(' ');
      return next;
    });
  const set = (k) => (e) => update({ [k]: e.target.value });
  const setSpec = (k, v) => setForm((f) => ({ ...f, specs: { ...f.specs, [k]: v } }));

  const onCategory = (category) => update({ category, subCategory: '', brand: '', specs: {} });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Only send specs that belong to the chosen category / sub-category and have a value
      const specs = Object.fromEntries(specFields.map((f) => [f.key, form.specs[f.key]]).filter(([, v]) => v !== undefined && v !== ''));
      const body = { ...form, specs, totalQuantity: Number(form.totalQuantity) };

      // Same item already in inventory? Offer to add the quantity to its stock instead of a duplicate row
      if (!editing) {
        const norm = (v) => String(v || '').trim().toLowerCase();
        const sameSpecs = (a = {}, b = {}) => {
          const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
          return [...keys].every((k) => norm(a[k]) === norm(b[k]));
        };
        const dup = existing.find(
          (i) =>
            i.category === form.category &&
            norm(i.brand) === norm(form.brand) &&
            norm(i.subCategory) === norm(form.subCategory) &&
            (norm(i.model) === norm(form.model) || norm(i.name) === norm(form.name)) &&
            sameSpecs(i.specs, specs)
        );
        if (dup && confirm(`"${dup.name}" already exists (Total ${dup.totalQuantity}).\n\nOK = add ${body.totalQuantity} to its stock\nCancel = create as a separate item`)) {
          await api.addStock(dup._id, { quantity: body.totalQuantity, notes: [form.vendor && `Vendor: ${form.vendor}`, form.description].filter(Boolean).join(' — ') || 'Stock added' });
          toast(`Added ${body.totalQuantity} to existing ${dup.name}`);
          return onSaved(dup);
        }
      }
      const payload = toFormData(body, imageFile, editing && !form.image && !!initial.image);
      const saved = editing ? await api.updateItem(initial._id, payload) : await api.createItem(payload);
      toast(editing ? 'Item updated' : 'Item added to inventory');
      onSaved(saved);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 !gap-[18px]">
      {/* 1. What is it */}
      <div className="flex flex-col gap-3.5 p-4 border border-line rounded-xl [&_h4]:m-0 [&_h4]:flex [&_h4]:items-center [&_h4]:gap-2 [&_h4]:text-sm [&_h4]:font-semibold">
        <h4><span className="grid place-items-center w-[22px] h-[22px] rounded-full bg-brand text-white text-xs">1</span> Item Type</h4>
        <div className={tw.grid2}>
          <Field
            label="Category"
            required
            hint={can('inventory') ? <>Missing one? <Link to="/inventory/categories">Manage categories</Link></> : undefined}
          >
            <Pick
              value={form.category}
              options={cats.names}
              onChange={onCategory}
              placeholder={cats.loading ? 'Loading…' : 'Select category…'}
              required
              disabled={editing && initial.assignedQuantity > 0}
            />
          </Field>
          <Field label="Sub-category" required>
            <Pick value={form.subCategory} options={cfg.subCategories} onChange={(v) => update({ subCategory: v })} required disabled={!form.category} />
          </Field>
          <Field label="Brand / Company" required={cfg.brands.length > 0}>
            {cfg.brands.length || !form.category ? (
              <Pick value={form.brand} options={cfg.brands} onChange={(v) => update({ brand: v })} required disabled={!form.category} />
            ) : (
              <input value={form.brand} onChange={set('brand')} placeholder="Optional" />
            )}
          </Field>
          <Field label="Model">
            <input value={form.model} onChange={set('model')} placeholder="e.g. Latitude 5550" disabled={!form.category} />
          </Field>
        </div>
        <Field label="Item Name" required hint={!nameTouched ? 'Auto-filled from brand + model — you can edit it.' : undefined}>
          <input
            value={form.name}
            onChange={(e) => { setNameTouched(true); setForm((f) => ({ ...f, name: e.target.value })); }}
            required
            placeholder="e.g. Dell Latitude 5550"
          />
        </Field>
      </div>

      {/* 2. Category-specific specs */}
      {specFields.length > 0 && (
        <div className="flex flex-col gap-3.5 p-4 border border-line rounded-xl [&_h4]:m-0 [&_h4]:flex [&_h4]:items-center [&_h4]:gap-2 [&_h4]:text-sm [&_h4]:font-semibold">
          <h4><span className="grid place-items-center w-[22px] h-[22px] rounded-full bg-brand text-white text-xs">2</span> {form.category} Specifications</h4>
          <div className="grid grid-cols-3 gap-3.5 max-md:grid-cols-2 max-sm:grid-cols-1">
            {specFields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.type === 'select' ? (
                  <Pick value={form.specs[f.key] || ''} options={f.options} onChange={(v) => setSpec(f.key, v)} />
                ) : (
                  <input
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={form.specs[f.key] || ''}
                    onChange={(e) => setSpec(f.key, e.target.value)}
                    placeholder={f.placeholder}
                  />
                )}
              </Field>
            ))}
          </div>
        </div>
      )}

      {/* 3. Stock & purchase */}
      <div className="flex flex-col gap-3.5 p-4 border border-line rounded-xl [&_h4]:m-0 [&_h4]:flex [&_h4]:items-center [&_h4]:gap-2 [&_h4]:text-sm [&_h4]:font-semibold">
        <h4><span className="grid place-items-center w-[22px] h-[22px] rounded-full bg-brand text-white text-xs">{specFields.length ? 3 : 2}</span> Stock & Purchase</h4>
        <div className="grid grid-cols-3 gap-3.5 max-md:grid-cols-2 max-sm:grid-cols-1">
          <Field
            label="Total Quantity"
            required
            hint={editing ? `Assigned: ${initial.assignedQuantity}${initial.outOfServiceQuantity ? ` + in repair: ${initial.outOfServiceQuantity}` : ''} — can't go below this.` : undefined}
          >
            <input type="number" min={editing ? initial.assignedQuantity + (initial.outOfServiceQuantity || 0) : 0} step="1" value={form.totalQuantity} onChange={set('totalQuantity')} required />
          </Field>
          <Field label="Unit">
            <select value={form.unit} onChange={set('unit')}>
              {['pcs', 'set', 'box', 'unit'].map((u) => <option key={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Unit Price (₹)" required>
            <input type="number" min="0" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} placeholder="e.g. 65000" required />
          </Field>
          <Field label="Vendor / Supplier">
            <input value={form.vendor} onChange={set('vendor')} placeholder="Optional" />
          </Field>
          <Field label="Purchase Date">
            <input type="date" value={form.purchaseDate} onChange={set('purchaseDate')} />
          </Field>
          <Field label="Warranty Until">
            <input type="date" value={form.warrantyUntil} onChange={set('warrantyUntil')} min={form.purchaseDate || undefined} />
          </Field>
        </div>
      </div>

      {/* 4. Extras */}
      <div className="grid grid-cols-[1fr_170px] gap-5 max-md:grid-cols-1">
        <Field label="Description / Notes (Optional)">
          <textarea rows={5} value={form.description} onChange={set('description')} placeholder="Serial range, configuration notes…" />
        </Field>
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col items-center justify-center gap-2 h-[170px] p-3 rounded-xl border border-dashed border-[#C9D2CD] bg-paper text-muted text-center cursor-pointer hover:border-brand [&_img]:max-w-full [&_img]:max-h-[100px] [&_img]:object-contain">
            {form.image ? <img src={form.image} alt="" /> : <Icon name="image" size={40} />}
            <span className="text-brand font-medium">{form.image ? 'Change Image' : 'Upload Image'}</span>
            <span className="text-[11.5px]">{Object.values(IMAGE_TYPES).join(', ')} · max {IMAGE_MAX_MB} MB</span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
              hidden
              onChange={(e) => {
                const file = e.target.files[0];
                e.target.value = ''; // lets you pick the same file again after an error
                if (!file) return;
                if (!IMAGE_TYPES[file.type])
                  return toast(`"${file.name}" is not allowed. Use ${Object.values(IMAGE_TYPES).join(', ')} (iPhone HEIC photos: share or save them as JPG first).`, 'error');
                if (file.size > IMAGE_MAX_MB * 1024 * 1024)
                  return toast(`Image is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${IMAGE_MAX_MB} MB`, 'error');
                setImageFile(file);
                setForm((f) => ({ ...f, image: URL.createObjectURL(file) })); // preview only; the file itself is sent as form-data
              }}
            />
          </label>
          {form.image && (
            <button type="button" className="self-center bg-transparent border-0 p-0 text-[12.5px] text-danger underline cursor-pointer"
              onClick={() => { setImageFile(null); setForm((f) => ({ ...f, image: '' })); }}>
              Remove image
            </button>
          )}
        </div>
      </div>

      <div className={tw.formActions}>
        <button type="button" className={tw.btn} onClick={onCancel}>Cancel</button>
        <button className={tw.btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save Item'}</button>
      </div>
    </form>
  );
}

function AddStock({ item: fixedItem, items = [], onDone, onCancel }) {
  const toast = useToast();
  const [itemId, setItemId] = useState(fixedItem?._id || '');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const item = fixedItem || items.find((i) => i._id === itemId);
  const { names, specSummary } = useCategories();

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.addStock(item._id, { quantity: Number(qty), notes });
      toast(`Added ${qty} ${item.unit} to ${item.name}`);
      onDone();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={tw.form}>
      {!fixedItem && (
        <Field label="Item" required>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} required autoFocus>
            <option value="">Select existing item…</option>
            {[...names, ...new Set(items.map((i) => i.category).filter((c) => !names.includes(c)))].map((c) => {
              const group = items.filter((i) => i.category === c);
              return group.length ? (
                <optgroup key={c} label={c}>
                  {group.map((i) => (
                    <option key={i._id} value={i._id}>
                      {i.name}{i.subCategory ? ` (${i.subCategory})` : ''} — Total {i.totalQuantity}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </Field>
      )}
      {item && (
        <div className={tw.infoBox}>
          <div><span>Item</span>{item.name}</div>
          {specSummary(item) && <div><span>Specs</span>{specSummary(item)}</div>}
          <div><span>Current</span>Total {item.totalQuantity} · Assigned {item.assignedQuantity} · Available {item.availableQuantity}</div>
          {qty > 0 && <div><span>After adding</span><strong className="text-ok">Total {item.totalQuantity + Number(qty)} · Available {item.availableQuantity + Number(qty)}</strong></div>}
        </div>
      )}
      <Field label="Quantity to add" required>
        <input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus={Boolean(fixedItem)} />
      </Field>
      <Field label="Notes (Optional)">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. PO-2291 new purchase from vendor" />
      </Field>
      <div className={tw.formActions}>
        <button type="button" className={tw.btn} onClick={onCancel}>Cancel</button>
        <button className={tw.btnPrimary} disabled={saving || !item}>{saving ? 'Adding…' : 'Add Stock'}</button>
      </div>
    </form>
  );
}

function Holders({ item }) {
  const { data, loading } = useAsync(() => api.item(item._id), [item._id]);
  if (loading) return <ListSkeleton rows={2} />;
  if (!data.holders.length) return <Empty>No one currently holds this item.</Empty>;
  return (
    <table className={tw.table}>
      <thead><tr><th>Employee</th><th>Department</th><th>Qty</th><th>Issued</th></tr></thead>
      <tbody>
        {data.holders.map((h) => (
          <tr key={h._id}>
            <td><Link to={`/employees/${h.employeeCode}`}>{h.employeeName}</Link> <small className="text-muted">{h.employeeCode}</small></td>
            <td>{h.departmentName}</td>
            <td>{h.outstandingQuantity}</td>
            <td>{fmtDate(h.issueDate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Expanded row: who has this item — departments on the left, employees on the right
function UsagePanel({ item }) {
  const { data, loading } = useAsync(() => api.item(item._id), [item._id]);
  const [dep, setDep] = useState(''); // '' = all departments
  const [q, setQ] = useState('');

  // One line per employee (several issues of the same item are added together)
  const { people, deps } = useMemo(() => {
    const byEmp = {};
    (data?.holders || []).forEach((h) => {
      const e = (byEmp[h.employeeCode] ??= { code: h.employeeCode, name: h.employeeName, dep: h.departmentName || '—', quantity: 0, since: h.issueDate, issues: 0 });
      e.quantity += h.outstandingQuantity;
      e.issues += 1;
      if (new Date(h.issueDate) < new Date(e.since)) e.since = h.issueDate;
    });
    const people = Object.values(byEmp).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
    const d = {};
    people.forEach((e) => {
      d[e.dep] ??= { name: e.dep, quantity: 0, employees: 0 };
      d[e.dep].quantity += e.quantity;
      d[e.dep].employees += 1;
    });
    return { people, deps: Object.values(d).sort((a, b) => b.quantity - a.quantity) };
  }, [data]);

  if (loading) return <div className="px-6 py-3"><ListSkeleton rows={2} /></div>;
  if (!people.length)
    return <div className="px-6 py-5 bg-[#F8F9F7] border-t border-line text-muted text-[13px]">Nobody has this item right now — all {item.totalQuantity} {item.unit} are on the shelf.</div>;

  const shown = people.filter(
    (e) => (!dep || e.dep === dep) && (!q || `${e.name} ${e.code}`.toLowerCase().includes(q.toLowerCase()))
  );
  const max = deps[0]?.quantity || 1;
  const depBtn = (active) =>
    `w-full text-left px-3 py-2 rounded-lg border-0 cursor-pointer ${active ? 'bg-brand-soft' : 'bg-transparent hover:bg-paper'}`;

  return (
    <div className="px-6 py-4 bg-[#F8F9F7] border-t border-line">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-3 text-[13px]">
        <strong className="text-[14px] text-ink">{item.name}</strong>
        <span><strong className="text-brand">{item.assignedQuantity}</strong> <span className="text-muted">in use</span></span>
        <span><strong>{people.length}</strong> <span className="text-muted">{people.length === 1 ? 'employee' : 'employees'}</span></span>
        <span><strong>{deps.length}</strong> <span className="text-muted">{deps.length === 1 ? 'department' : 'departments'}</span></span>
        <span><strong className="text-ok">{item.availableQuantity}</strong> <span className="text-muted">available</span></span>
        {item.outOfServiceQuantity > 0 && <Link to="/repairs"><strong className="text-warn">{item.outOfServiceQuantity}</strong> <span className="text-muted">damaged / in repair</span></Link>}
      </div>

      {/* Fixed height: departments on the left, employees on the right (both scroll) */}
      <div className="grid grid-cols-[240px_1fr] h-[300px] bg-white border border-line rounded-xl overflow-hidden max-md:grid-cols-1 max-md:h-auto">
        <div className="overflow-y-auto p-2 border-r border-line max-md:border-r-0 max-md:border-b max-md:max-h-[160px]">
          <button className={depBtn(!dep)} onClick={() => setDep('')}>
            <span className="flex justify-between text-[13px] font-semibold"><span>All departments</span><span className="tabular-nums">{item.assignedQuantity}</span></span>
            <span className="block text-[11.5px] text-muted">{people.length} employees</span>
          </button>
          {deps.map((d) => (
            <button key={d.name} className={depBtn(dep === d.name)} onClick={() => setDep(d.name)}>
              <span className="flex justify-between text-[13px] font-medium"><span className="truncate">{d.name}</span><span className="tabular-nums">{d.quantity}</span></span>
              <span className="block mt-1 h-1 rounded-full bg-[#E6EAE6] overflow-hidden"><span className="block h-full bg-brand" style={{ width: `${(d.quantity / max) * 100}%` }} /></span>
              <span className="block mt-0.5 text-[11.5px] text-muted">{d.employees} {d.employees === 1 ? 'employee' : 'employees'}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col min-h-0">
          <div className="flex items-center gap-3 px-3 py-2 border-b border-line">
            <div className={`${tw.search} flex-1 !w-auto !h-8 [&_input]:!h-8`}>
              <Icon name="search" size={15} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee name or ID…" />
            </div>
            <span className="text-[12px] text-muted whitespace-nowrap">{shown.length} of {people.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto max-md:max-h-[280px]">
            {!shown.length ? (
              <div className="p-5 text-center text-muted text-[13px]">No employee matches.</div>
            ) : (
              <table className="w-full border-collapse text-[13px] [&_th]:sticky [&_th]:top-0 [&_th]:bg-white [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted [&_th]:text-[12px] [&_th]:px-3 [&_th]:py-2 [&_th]:border-b [&_th]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-line [&_tbody_tr:hover]:bg-[#F8F9F7]">
                <thead><tr><th>Employee</th><th>ID</th>{!dep && <th>Department</th>}<th className="!text-right">Qty</th><th>Since</th></tr></thead>
                <tbody>
                  {shown.map((e) => (
                    <tr key={e.code}>
                      <td><Link to={`/employees/${e.code}`} className="font-medium">{e.name}</Link></td>
                      <td className="font-mono text-[12px] text-muted">{e.code}</td>
                      {!dep && <td>{e.dep}</td>}
                      <td className="text-right">
                        <span className={`px-2 py-0.5 rounded-md text-[12px] font-semibold tabular-nums ${e.quantity > 1 ? 'bg-brand text-white' : 'bg-brand-soft text-brand'}`}>× {e.quantity}</span>
                      </td>
                      <td className="text-muted whitespace-nowrap">{fmtDate(e.since)}{e.issues > 1 ? ` · ${e.issues} issues` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const toast = useToast();
  const { can } = useAuth();
  const canManage = can('inventory');
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  useUrlParam('search', setSearch); // from the global search
  useUrlParam('category', setCategory);
  const [status, setStatus] = useState('Active'); // Active | Inactive | All
  const [openId, setOpenId] = useState(null); // expanded row
  const [modal, setModal] = useState(null); // {type, item}
  const { data: items, loading, error, reload } = useAsync(api.items);
  const { names, list: catList, specSummary, icon } = useCategories();

  // Category cards: newest category first (same order as Manage Categories)
  const summary = useMemo(() => {
    const m = {};
    (items || []).filter((i) => i.status !== 'Inactive').forEach((i) => {
      m[i.category] ??= { category: i.category, total: 0, available: 0 };
      m[i.category].total += i.totalQuantity;
      m[i.category].available += i.availableQuantity;
    });
    const newest = newestFirst(catList).map((c) => c.name);
    const order = [...newest, ...Object.keys(m).filter((c) => !newest.includes(c))];
    return order.map((c) => m[c]).filter(Boolean);
  }, [items, catList]);

  const filtered = useMemo(
    () => (items || []).filter(
      (i) =>
        (category === 'All' || i.category === category) &&
        (status === 'All' || (i.status || 'Active') === status) &&
        i.name.toLowerCase().includes(search.toLowerCase())
    ),
    [items, category, status, search]
  );
  const { sorted, sort, toggle } = useSort(filtered);
  const sel = useSelection(sorted);
  const pg = usePagination(sorted);

  // Inventory is never deleted: items are marked Inactive (kept with full history) and can be re-activated
  const setStatusFor = async (rows, to) => {
    if (!rows.length) return toast(`Selected items are already ${to}`, 'error');
    if (to === 'Inactive' && !confirm(`Mark ${rows.length === 1 ? `"${rows[0].name}"` : `${rows.length} items`} Inactive?\n\nInactive items stay in the system with their history but can't be assigned until made Active again.`)) return;
    const results = await Promise.allSettled(rows.map((r) => api.setItemStatus(r._id, to)));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    toast(ok === rows.length ? `${ok} item(s) marked ${to}` : `${ok} of ${rows.length} marked ${to}`, ok ? 'success' : 'error');
    sel.clear();
    reload();
  };

  const bulkExport = () =>
    downloadCSV('inventory-selected.csv', sel.selectedRows.map((i) => ({
      Item: i.name, Category: i.category, Total: i.totalQuantity, Assigned: i.assignedQuantity, Available: i.availableQuantity, Unit: i.unit,
    })));

  const close = () => setModal(null);
  const done = () => { close(); reload(); };

  return (
    <>
      <div className={tw.pageHead}>
        <h1>Inventory</h1>
        {canManage && <div className="flex items-center gap-2.5 flex-wrap">
          <Link className={tw.btn} to="/inventory/categories">
            <Icon name="edit" size={18} /> Manage Categories
          </Link>
          <button className={tw.btn} onClick={() => setModal({ type: 'import' })}>
            <Icon name="upload" size={18} /> Import
          </button>
          <button className={tw.btn} onClick={() => setModal({ type: 'stock' })} disabled={!items?.length}>
            <Icon name="box" size={18} /> Add Stock
          </button>
          <button className={tw.btnPrimary} onClick={() => setModal({ type: 'form' })}>
            <Icon name="plus" size={18} /> Add Inventory Item
          </button>
        </div>}
      </div>

      <CategoryCards data={summary} />

      <section className={tw.card}>
        <div className={tw.cardHead}>
          <h2>Inventory Items</h2>
          <div className={tw.filters}>
            <div className={tw.search}>
              <Icon name="search" size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="All">All Categories</option>
              {names.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="Active">Active items</option>
              <option value="Inactive">Inactive items</option>
              <option value="All">All statuses</option>
            </select>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : error ? (
          <div className="text-danger p-6">{error.message}</div>
        ) : !filtered.length ? (
          <Empty>{items.length ? (status === 'Inactive' ? 'No inactive items.' : 'No items match your filters.') : 'No inventory yet — add your first item.'}</Empty>
        ) : (
          <>
          <div className={tw.tableWrap}>
            <BulkBar sel={sel}>
              <button className={tw.btnSm} onClick={bulkExport}><Icon name="download" size={14} /> Export CSV</button>
              {canManage && status !== 'Inactive' && <button className={tw.btnSm} onClick={() => setStatusFor(sel.selectedRows.filter((r) => r.status !== 'Inactive'), 'Inactive')}>Mark Inactive</button>}
              {canManage && status !== 'Active' && <button className={tw.btnSm} onClick={() => setStatusFor(sel.selectedRows.filter((r) => r.status === 'Inactive'), 'Active')}>Mark Active</button>}
            </BulkBar>
            <table className={tw.table}>
              <thead>
                <tr>
                  <CheckAll sel={sel} />
                  <th>#</th>
                  <SortTh label="Item Name" field="name" sort={sort} onSort={toggle} />
                  <SortTh label="Category" field="category" sort={sort} onSort={toggle} />
                  <SortTh label="Total Quantity" field="totalQuantity" sort={sort} onSort={toggle} className="text-right tabular-nums" />
                  <SortTh label="Assigned" field="assignedQuantity" sort={sort} onSort={toggle} className="text-right tabular-nums" />
                  <SortTh label="Available" field="availableQuantity" sort={sort} onSort={toggle} className="text-right tabular-nums" />
                  <th>Unit</th><th>Status</th><th className="text-right">Action</th><th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {pg.pageRows.map((i, idx) => (
                  <Fragment key={i._id}>
                  <tr
                    className={`${i.assignedQuantity > 0 ? 'clickable' : ''} ${sel.selected.has(i._id) ? 'selected' : ''} ${i.status === 'Inactive' ? 'opacity-60' : ''} ${openId === i._id ? '!bg-[#E6F2EF] [&_td]:!border-b-0 [&_td:first-child]:shadow-[inset_3px_0_0_#0F766E]' : ''}`}
                    // Only items someone has can open (nothing to show otherwise)
                    onClick={() => i.assignedQuantity > 0 && setOpenId((id) => (id === i._id ? null : i._id))}
                    title={i.assignedQuantity > 0 ? 'Click to see who has it' : undefined}
                  >
                    <CheckCell sel={sel} id={i._id} />
                    <td className="text-muted">{(pg.page - 1) * pg.size + idx + 1}</td>
                    <td>
                      <div className={tw.itemCell}>
                        {i.image ? <img src={i.image} alt="" /> : <Icon name={icon(i.category)} size={22} className="text-brand" />}
                        <div>
                          {i.name}
                          <small>{[i.subCategory, i.brand && i.model ? `${i.brand} ${i.model}` : i.brand].filter(Boolean).join(' · ')}</small>
                          {specSummary(i) && <small>{specSummary(i)}</small>}
                        </div>
                      </div>
                    </td>
                    <td>{i.category}</td>
                    <td className="text-right tabular-nums">{i.totalQuantity}</td>
                    <td className="text-right tabular-nums">
                      {i.assignedQuantity}
                      {i.usage?.employees > 0 && (
                        <small className="block text-[11.5px] text-muted whitespace-nowrap">
                          {i.usage.employees} {i.usage.employees === 1 ? 'employee' : 'employees'} · {i.usage.departments.length} {i.usage.departments.length === 1 ? 'dept' : 'depts'}
                        </small>
                      )}
                    </td>
                    <td className={`text-right tabular-nums font-semibold ${i.availableQuantity > 0 ? 'text-ok' : 'text-danger'}`}>
                      {i.availableQuantity}
                      {i.outOfServiceQuantity > 0 && <small className="block text-[11.5px] font-normal text-warn whitespace-nowrap">{i.outOfServiceQuantity} in repair</small>}
                    </td>
                    <td>{i.unit}</td>
                    <td><StatusBadge status={i.status || 'Active'} /></td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        actions={[
                          i.status !== 'Inactive' && i.availableQuantity > 0 && { label: 'Assign to employee', icon: 'arrow', onClick: () => navigate(`/assignments/new?item=${i._id}`) },
                          canManage && { label: 'Add stock', icon: 'plus', onClick: () => setModal({ type: 'stock', item: i }) },
                          { label: 'Who has it', icon: 'users', onClick: () => setModal({ type: 'holders', item: i }) },
                          canManage && i.status !== 'Inactive' && (i.availableQuantity > 0 || i.assignedQuantity > 0) && { label: 'Mark damaged / lost', icon: 'alert', onClick: () => setModal({ type: 'damage', item: i }) },
                          canManage && { label: 'Edit', icon: 'edit', onClick: () => setModal({ type: 'form', item: i }) },
                          canManage && (i.status === 'Inactive'
                            ? { label: 'Mark Active', icon: 'check', onClick: () => setStatusFor([i], 'Active') }
                            : { label: 'Mark Inactive', icon: 'x', danger: true, onClick: () => setStatusFor([i], 'Inactive') }),
                        ]}
                      />
                    </td>
                    <td className="!pl-0">
                      {i.assignedQuantity > 0 && (
                        <span className={`grid place-items-center w-7 h-7 rounded-md transition-transform ${openId === i._id ? 'rotate-90 bg-brand text-white' : 'text-ink bg-[#EEF1EE]'}`}>
                          <Icon name="chevron" size={16} style={{ strokeWidth: 2.6 }} />
                        </span>
                      )}
                    </td>
                  </tr>
                  {openId === i._id && i.assignedQuantity > 0 && (
                    <tr className="hover:!bg-transparent"><td colSpan={12} className="!p-0"><UsagePanel item={i} /></td></tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pg={pg} label="items" />
          </>
        )}
      </section>

      {modal?.type === 'form' && (
        <Modal title={modal.item ? 'Edit Inventory Item' : 'Add Inventory Item'} onClose={close} width={820}>
          <ItemForm initial={modal.item} existing={items || []} onSaved={done} onCancel={close} />
        </Modal>
      )}
      {modal?.type === 'import' && (
        <Modal title="Import from Excel / CSV" onClose={close} width={760}>
          <Suspense fallback={<div className="text-muted text-[13px]">Loading…</div>}>
            <ImportDialog initialKind="items" onDone={reload} onClose={close} />
          </Suspense>
        </Modal>
      )}
      {modal?.type === 'damage' && (
        <Modal title="Mark as damaged or lost" onClose={close} width={500}>
          <ReportDamageForm itemId={modal.item._id} onCancel={close} onDone={done} />
        </Modal>
      )}
      {modal?.type === 'stock' && (
        <Modal title={modal.item ? `Add Stock — ${modal.item.name}` : 'Add Stock to Existing Item'} onClose={close} width={520}>
          <AddStock item={modal.item} items={items || []} onDone={done} onCancel={close} />
        </Modal>
      )}
      {modal?.type === 'holders' && (
        <Modal title={`Assigned: ${modal.item.name}`} onClose={close} width={640}>
          <Holders item={modal.item} />
        </Modal>
      )}
    </>
  );
}
