import { useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useCategories, newestFirst, isNewCategory } from '../categories.jsx';
import Icon from '../components/Icons.jsx';
import { ActionMenu, Empty, Field, Modal, useToast } from '../components/ui.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import { tw } from '../components/tw.js';
// Loaded only when Import is clicked (keeps the Excel/CSV code out of the first page load)
const ImportDialog = lazy(() => import('../components/ImportDialog.jsx'));

const ICONS = ['System', 'Monitor', 'Mouse', 'Keyboard', 'Headset', 'Printer', 'Networking', 'Mobile', 'Other'];
const ICON_LABEL = { System: 'Computer', Other: 'Box' };
const TYPES = [
  ['select', 'Dropdown'],
  ['text', 'Text'],
  ['number', 'Number'],
];

/* ---------- Tag input: type a value and press Enter (or comma) to add it ---------- */
function TagInput({ value, onChange, placeholder = 'Type and press Enter' }) {
  const [text, setText] = useState('');
  const add = (raw) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    parts.forEach((p) => !next.some((v) => v.toLowerCase() === p.toLowerCase()) && next.push(p));
    onChange(next);
    setText('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-h-10 px-2 py-1.5 rounded-lg border border-[#D3D9D5] bg-white focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-ring">
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-brand-soft text-brand text-[13px] font-medium">
          {v}
          <button type="button" className="grid place-items-center w-4 h-4 rounded hover:bg-brand/15" onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
            <Icon name="x" size={11} />
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-[140px] !h-7 !border-0 !p-0 !ring-0 !shadow-none outline-none bg-transparent"
        value={text}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(text)}
        onPaste={(e) => {
          const t = e.clipboardData.getData('text');
          if (t.includes(',') || t.includes('\n')) {
            e.preventDefault();
            add(t.replace(/\n/g, ','));
          }
        }}
        placeholder={value.length ? '' : placeholder}
      />
    </div>
  );
}

/* ---------- Add / edit one category ---------- */
const blankField = () => ({ label: '', type: 'select', options: [], appliesTo: [], placeholder: '' });

function CategoryForm({ initial, onSaved, onCancel }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: initial?.name || '',
    icon: initial?.icon || 'Other',
    subCategories: initial?.subCategories || [],
    brands: initial?.brands || [],
    fields: (initial?.fields || []).map((f) => ({ ...blankField(), ...f })),
  });
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setField = (i, patch) => set({ fields: form.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const moveField = (i, d) => {
    const fields = [...form.fields];
    [fields[i], fields[i + d]] = [fields[i + d], fields[i]];
    set({ fields });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.subCategories.length) return toast('Add at least one sub-category', 'error');
    const bad = form.fields.find((f) => f.type === 'select' && !f.options.length);
    if (bad) return toast(`"${bad.label || 'Field'}": add at least one dropdown option`, 'error');
    setSaving(true);
    try {
      const saved = initial?._id ? await api.updateCategory(initial._id, form) : await api.createCategory(form);
      toast(initial?._id ? 'Category updated' : `Category "${saved.name}" added`);
      onSaved(saved);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const section = 'flex flex-col gap-3.5 p-4 border border-line rounded-xl [&_h4]:m-0 [&_h4]:flex [&_h4]:items-center [&_h4]:gap-2 [&_h4]:text-sm [&_h4]:font-semibold';
  const step = 'grid place-items-center w-[22px] h-[22px] rounded-full bg-brand text-white text-xs';

  return (
    <form onSubmit={submit} className="flex flex-col gap-[18px]">
      {/* 1. Category */}
      <div className={section}>
        <h4><span className={step}>1</span> Category</h4>
        <div className={tw.grid2}>
          <Field label="Category Name" required hint={initial?.itemCount ? `Renaming also updates its ${initial.itemCount} item(s).` : undefined}>
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} required autoFocus placeholder="e.g. Headphone" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="font-semibold text-[13px]">Icon</span>
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  title={ICON_LABEL[ic] || ic}
                  onClick={() => set({ icon: ic })}
                  className={`grid place-items-center w-10 h-10 rounded-lg border ${form.icon === ic ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-muted hover:bg-paper'}`}
                >
                  <Icon name={ic} size={18} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <Field label="Sub-categories" required hint="Shown in the Sub-category dropdown. Type a value and press Enter.">
          <TagInput value={form.subCategories} onChange={(subCategories) => set({ subCategories, fields: form.fields.map((f) => ({ ...f, appliesTo: f.appliesTo.filter((s) => subCategories.includes(s)) })) })} placeholder="e.g. Over-ear, In-ear, Neckband" />
        </Field>
        <Field label="Brands / Companies" hint="Shown in the Brand dropdown. Leave empty to type the brand freely.">
          <TagInput value={form.brands} onChange={(brands) => set({ brands })} placeholder="e.g. Sony, JBL, boAt" />
        </Field>
      </div>

      {/* 2. Spec fields */}
      <div className={section}>
        <div className="flex items-center justify-between gap-3">
          <h4><span className={step}>2</span> Specification Fields</h4>
          <button type="button" className={tw.btnSm} onClick={() => set({ fields: [...form.fields, blankField()] })}>
            <Icon name="plus" size={14} /> Add Field
          </button>
        </div>
        <p className="m-0 -mt-1.5 text-[12.5px] text-muted">
          These appear in the Add Item form after choosing this category. Use <strong>Show for</strong> to show a field only for some sub-categories.
        </p>
        {!form.fields.length && <div className="px-4 py-5 rounded-lg bg-paper text-center text-muted text-[13px]">No fields yet — items in this category will only have name, brand and model.</div>}
        {form.fields.map((f, i) => (
          <div key={i} className="flex flex-col gap-3 p-3.5 rounded-lg border border-line bg-[#FAFBFA]">
            <div className="grid grid-cols-[1fr_150px_auto] gap-3 items-end max-sm:grid-cols-1">
              <Field label={`Field ${i + 1} — Label`} required>
                <input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} required placeholder="e.g. Connectivity" />
              </Field>
              <Field label="Type">
                <select value={f.type} onChange={(e) => setField(i, { type: e.target.value })}>
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <div className="flex gap-1 pb-0.5">
                <button type="button" className={tw.iconBtn} onClick={() => moveField(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
                <button type="button" className={tw.iconBtn} onClick={() => moveField(i, 1)} disabled={i === form.fields.length - 1} aria-label="Move down" title="Move down">↓</button>
                <button type="button" className={`${tw.iconBtn} text-danger`} onClick={() => set({ fields: form.fields.filter((_, j) => j !== i) })} aria-label="Remove field" title="Remove field">
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
            {f.type === 'select' ? (
              <Field label="Dropdown options" required>
                <TagInput value={f.options} onChange={(options) => setField(i, { options })} placeholder="e.g. Wired, Wireless, Bluetooth" />
              </Field>
            ) : (
              <Field label="Placeholder (optional)">
                <input value={f.placeholder} onChange={(e) => setField(i, { placeholder: e.target.value })} placeholder="e.g. 8 × Gigabit" />
              </Field>
            )}
            {form.subCategories.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                <span className="font-semibold mr-1">Show for:</span>
                <button type="button" onClick={() => setField(i, { appliesTo: [] })} className={`px-2.5 py-1 rounded-md border ${!f.appliesTo.length ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-muted'}`}>
                  All sub-categories
                </button>
                {form.subCategories.map((s) => {
                  const on = f.appliesTo.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setField(i, { appliesTo: on ? f.appliesTo.filter((x) => x !== s) : [...f.appliesTo, s] })}
                      className={`px-2.5 py-1 rounded-md border ${on ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-muted'}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={tw.formActions}>
        <button type="button" className={tw.btn} onClick={onCancel}>Cancel</button>
        <button className={tw.btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save Category'}</button>
      </div>
    </form>
  );
}

/* ---------- Page: Inventory → Manage Categories ---------- */
export default function Categories() {
  const toast = useToast();
  const { can } = useAuth();
  const canDelete = can('delete');
  const { list: all, loading, reload } = useCategories();
  const list = newestFirst(all);
  const [modal, setModal] = useState(null); // { cat } | { cat: null } for new
  const [importing, setImporting] = useState(false);

  const remove = async (c) => {
    if (c.itemCount) return toast(`${c.itemCount} item(s) use "${c.name}" — move or delete them first`, 'error');
    if (!confirm(`Delete category "${c.name}"?\n\nIt goes to the Recycle Bin and an administrator can restore it within 30 days.`)) return;
    try {
      await api.deleteCategory(c._id);
      toast('Category moved to Recycle Bin');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <>
      <div className={tw.pageHead}>
        <div>
          <Link to="/inventory" className="text-[13px]">← Inventory</Link>
          <h1>Inventory Categories</h1>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <button className={tw.btn} onClick={() => setImporting(true)}>
            <Icon name="upload" size={18} /> Import
          </button>
          <button className={tw.btnPrimary} onClick={() => setModal({ cat: null })}>
            <Icon name="plus" size={18} /> Add Category
          </button>
        </div>
      </div>
      {importing && (
        <Modal title="Import from Excel / CSV" onClose={() => setImporting(false)} width={760}>
          <Suspense fallback={<div className="text-muted text-[13px]">Loading…</div>}>
            <ImportDialog initialKind="categories" onDone={reload} onClose={() => setImporting(false)} />
          </Suspense>
        </Modal>
      )}

      <section className={tw.card}>
        <div className={tw.cardHead}>
          <h2>All Categories <span className="ml-1 px-2 py-0.5 rounded-md bg-brand-soft text-brand text-xs">{list.length}</span></h2>
          <span className="text-muted text-[13px]">Newest first · Everything in the Add Inventory Item form comes from here.</span>
        </div>
        {loading ? (
          <TableSkeleton rows={6} />
        ) : !list.length ? (
          <Empty>No categories yet — add your first one.</Empty>
        ) : (
          <div className={tw.tableWrap}>
            <table className={tw.table}>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Sub-categories</th>
                  <th>Brands</th>
                  <th>Fields</th>
                  <th className="text-right">Items</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c._id} className="clickable" onClick={() => setModal({ cat: c })}>
                    <td>
                      <span className={tw.itemCell}>
                        <Icon name={c.icon} size={20} className="text-brand" />
                        <strong>{c.name}</strong>
                        {isNewCategory(c) && <span className="ml-1 px-1.5 py-px rounded bg-brand-soft text-brand text-[11px] font-semibold">New</span>}
                      </span>
                    </td>
                    <td className="text-muted text-[13px] max-w-[260px]">{c.subCategories.join(', ') || '—'}</td>
                    <td className="text-muted text-[13px] max-w-[220px]">{c.brands.join(', ') || '—'}</td>
                    <td className="text-muted text-[13px] max-w-[260px]">{c.fields.map((f) => f.label).join(', ') || '—'}</td>
                    <td className="text-right tabular-nums">{c.itemCount}</td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <ActionMenu
                        actions={[
                          { label: 'Edit', icon: 'edit', onClick: () => setModal({ cat: c }) },
                          canDelete && { label: 'Delete', icon: 'trash', danger: true, onClick: () => remove(c) },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <Modal title={modal.cat ? `Edit Category — ${modal.cat.name}` : 'Add Category'} onClose={() => setModal(null)} width={820}>
          <CategoryForm
            initial={modal.cat}
            onCancel={() => setModal(null)}
            onSaved={() => {
              setModal(null);
              reload();
            }}
          />
        </Modal>
      )}
    </>
  );
}
