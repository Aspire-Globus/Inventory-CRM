import { useRef, useState } from 'react';
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file';
import writeXlsxFile from 'write-excel-file/browser';
import { api } from '../api.js';
import { useCategories } from '../categories.jsx';
import Icon from './Icons.jsx';
import { useToast } from './ui.jsx';
import { tw } from './tw.js';

/* ---------- Column names the file may use (first row). Anything else on the Items sheet = a spec field. ---------- */
const ITEM_COLS = [
  ['name', 'Item Name', ['item name', 'name', 'item']],
  ['category', 'Category', ['category']],
  ['subCategory', 'Sub-category', ['sub-category', 'subcategory', 'sub category']],
  ['brand', 'Brand', ['brand', 'company', 'brand / company', 'make']],
  ['model', 'Model', ['model']],
  ['totalQuantity', 'Total Quantity', ['total quantity', 'quantity', 'qty']],
  ['unit', 'Unit', ['unit']],
  ['unitPrice', 'Unit Price', ['unit price', 'price', 'rate', 'cost']],
  ['vendor', 'Vendor', ['vendor', 'supplier', 'vendor / supplier']],
  ['purchaseDate', 'Purchase Date', ['purchase date', 'bought on']],
  ['warrantyUntil', 'Warranty Until', ['warranty until', 'warranty', 'warranty date']],
  ['description', 'Description', ['description', 'notes', 'description / notes']],
];
const ITEM_REQUIRED = ['name', 'category', 'subCategory', 'totalQuantity', 'unitPrice'];
const CAT_COLS = [
  ['name', 'Category Name', ['category name', 'name', 'category']],
  ['icon', 'Icon', ['icon']],
  ['subCategories', 'Sub-categories', ['sub-categories', 'subcategories', 'sub categories', 'sub-category']],
  ['brands', 'Brands', ['brands', 'brand']],
  ['fields', 'Fields', ['fields', 'spec fields', 'specs']],
];
const CAT_REQUIRED = ['name', 'subCategories'];
const ICONS = ['System', 'Monitor', 'Mouse', 'Keyboard', 'Headset', 'Printer', 'Networking', 'Mobile', 'Other'];

const norm = (h) => String(h ?? '').toLowerCase().replace(/\*|\(₹\)|\(rs\.?\)/g, '').replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');
const cellText = (v) =>
  v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : v == null ? '' : String(v).trim();

/** Sheet rows (arrays) -> objects the server understands. Returns { rows, missing, unknown } */
function toRecords(table, kind) {
  const cols = kind === 'items' ? ITEM_COLS : CAT_COLS;
  const required = kind === 'items' ? ITEM_REQUIRED : CAT_REQUIRED;
  const headerIdx = table.findIndex((r) => r.some((c) => cellText(c))); // first non-empty row = column names
  if (headerIdx < 0) return { rows: [], missing: required, unknown: [] };
  const header = table[headerIdx].map((h) => cellText(h));
  const used = new Set();
  const map = header.map((h) => {
    const key = cols.find(([, , aliases]) => aliases.includes(norm(h)))?.[0];
    if (!key || used.has(key)) return null; // not a main column (or already taken) -> spec column
    used.add(key);
    return key;
  });
  const missing = required.filter((k) => !map.includes(k)).map((k) => cols.find((c) => c[0] === k)[1]);
  const unknown = header.filter((h, i) => h && !map[i]);
  const rows = [];
  table.slice(headerIdx + 1).forEach((r, j) => {
    if (!r.some((c) => cellText(c))) return; // skip empty lines
    const rec = { row: headerIdx + j + 2 };
    if (kind === 'items') rec.specs = {};
    r.forEach((c, i) => {
      if (map[i]) rec[map[i]] = cellText(c);
      else if (kind === 'items' && header[i]) rec.specs[header[i]] = cellText(c); // spec column, e.g. "RAM"
    });
    rows.push(rec);
  });
  return { rows, missing, unknown };
}

async function readFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv' || file.type === 'text/csv') {
    return new Promise((resolve, reject) =>
      Papa.parse(file, { skipEmptyLines: 'greedy', complete: (r) => resolve(r.data), error: reject })
    );
  }
  if (ext === 'xlsx')
    return readXlsxFile(file).catch((err) => {
      // Some programs (not Excel itself) save cells in a way the reader can't handle
      throw new Error(`Could not read this Excel file (${String(err.message).slice(0, 60)}…). Open it in Excel and save it again, or save it as CSV and import that.`);
    }); // first sheet
  if (ext === 'xls') throw new Error('Old .xls files are not supported — in Excel use File → Save As → Excel Workbook (.xlsx) or CSV');
  throw new Error('Choose an Excel (.xlsx) or CSV (.csv) file');
}

/* ---------- Templates (filled from your real categories) ---------- */
function itemTemplate(categories) {
  const c = categories[0];
  const sub = c?.subCategories?.[0] || '';
  const fields = (c?.fields || []).filter((f) => !f.appliesTo?.length || f.appliesTo.includes(sub));
  const specCols = [...new Set(categories.flatMap((x) => x.fields.map((f) => f.label)))];
  const header = [...ITEM_COLS.map(([k, label]) => (ITEM_REQUIRED.includes(k) ? `${label} *` : label)), ...specCols];
  const example = [
    c ? `${c.brands?.[0] || 'Dell'} ${c.name} example` : 'Dell Latitude 5550', c?.name || 'System', sub || 'Laptop', c?.brands?.[0] || '', 'Model 1',
    '10', 'pcs', '65000', 'ABC Traders', '18-11-2026', '17-11-2029', 'Delete this example row',
    ...specCols.map((l) => { const f = fields.find((x) => x.label === l); return f ? (f.type === 'select' ? f.options[0] : '') : ''; }),
  ];
  const help = [['Category', 'Sub-categories', 'Brands', 'Spec columns (column name: allowed values)']];
  categories.forEach((x) =>
    help.push([
      x.name, x.subCategories.join(', '), x.brands.join(', ') || '(any — free text)',
      x.fields.map((f) => `${f.label}${f.appliesTo?.length ? ` [${f.appliesTo.join(', ')}]` : ''}${f.type === 'select' ? `: ${f.options.join(' | ')}` : ''}`).join('  ·  ') || '—',
    ])
  );
  return { header, rows: [example], help };
}
function categoryTemplate() {
  const header = CAT_COLS.map(([k, label]) => (CAT_REQUIRED.includes(k) ? `${label} *` : label));
  const rows = [['Camera', 'Other', 'CCTV, Webcam', 'Hikvision, Logitech', 'Resolution: 1080p | 4K; Night vision [CCTV]: Yes | No; Serial No']];
  const help = [
    ['Column', 'How to fill it'],
    ['Category Name *', 'e.g. Camera. An existing name is skipped (or merged, if you choose that when importing).'],
    ['Icon', ICONS.join(', ')],
    ['Sub-categories *', 'Separated by commas: CCTV, Webcam'],
    ['Brands', 'Separated by commas. Leave empty to allow any brand (typed).'],
    ['Fields', 'Separated by ; — "Label: option | option" = dropdown, "Label" alone = text box, "Label [Sub1, Sub2]: …" = only for those sub-categories.'],
  ];
  return { header, rows, help };
}
const bold = (v) => ({ value: v, fontWeight: 'bold', backgroundColor: '#E3F1EE' });

async function downloadTemplate(kind, format, categories) {
  const t = kind === 'items' ? itemTemplate(categories) : categoryTemplate();
  const name = kind === 'items' ? 'inventory-items-template' : 'categories-template';
  let blob;
  if (format === 'csv') {
    blob = new Blob(['﻿' + Papa.unparse([t.header, ...t.rows])], { type: 'text/csv;charset=utf-8' });
  } else {
    const widths = (rows) => rows[0].map((_, i) => ({ width: Math.min(60, Math.max(12, ...rows.map((r) => String(r[i] ?? '').length + 2))) }));
    const main = [t.header, ...t.rows];
    blob = await writeXlsxFile([
      // numbers go in as real numbers (no green "number stored as text" warning in Excel)
      { sheet: kind === 'items' ? 'Items' : 'Categories', data: [t.header.map(bold), ...t.rows.map((r) => r.map((v) => ({ value: /^\d+(\.\d+)?$/.test(String(v)) ? Number(v) : v })))], columns: widths(main), stickyRowsCount: 1 },
      { sheet: 'Help', data: [t.help[0].map(bold), ...t.help.slice(1).map((r) => r.map((v) => ({ value: v, wrap: true })))], columns: widths(t.help) },
    ]).toBlob();
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${name}.${format}` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const STATUS = {
  created: ['New', 'bg-ok-soft text-ok'],
  updated: ['Update', 'bg-[#E6EEFB] text-[#1D4ED8]'],
  skipped: ['Skipped', 'bg-[#EBEEEA] text-muted'],
  error: ['Error', 'bg-danger-soft text-danger'],
};

/**
 * Import inventory items or categories from an Excel / CSV file.
 * Steps: download template → choose file → check (nothing saved) → import → result.
 */
export default function ImportDialog({ initialKind = 'items', onDone, onClose }) {
  const toast = useToast();
  const { list: categories = [], reload: reloadCats } = useCategories() || {};
  const [kind, setKind] = useState(initialKind);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null); // { rows, missing, unknown }
  const [duplicates, setDuplicates] = useState('skip');
  const [check, setCheck] = useState(null); // dry-run result
  const [result, setResult] = useState(null); // final result
  const [busy, setBusy] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const input = useRef(null);
  const call = (body) => (kind === 'items' ? api.importItems(body) : api.importCategories(body));

  const reset = (k = kind) => { setKind(k); setFile(null); setParsed(null); setCheck(null); setResult(null); setDuplicates('skip'); if (input.current) input.current.value = ''; };

  const runCheck = async (p, dup) => {
    setBusy('Checking…');
    try {
      setCheck(await call({ rows: p.rows, duplicates: dup, dryRun: true }));
    } catch (err) {
      toast(err.message, 'error');
      setCheck(null);
    } finally {
      setBusy('');
    }
  };

  const pick = async (f) => {
    if (!f) return;
    setFile(f); setCheck(null); setResult(null); setBusy('Reading file…');
    try {
      const table = await readFile(f);
      const p = toRecords(table, kind);
      setParsed(p);
      setBusy('');
      if (!p.rows.length) return toast('The file has no data rows under the column names', 'error');
      if (p.missing.length) return; // shown on screen
      await runCheck(p, duplicates);
    } catch (err) {
      setBusy('');
      setParsed(null);
      toast(err.message || 'Could not read the file', 'error');
    }
  };

  const doImport = async () => {
    setBusy('Importing…');
    try {
      const r = await call({ rows: parsed.rows, duplicates, dryRun: false });
      setResult(r);
      if (kind === 'categories') reloadCats?.();
      onDone?.();
      toast(`Imported: ${r.created} new${r.updated ? `, ${r.updated} updated` : ''}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const downloadErrors = () => {
    const rows = (result || check).results.filter((r) => r.status === 'error');
    const csv = Papa.unparse([['Row', 'Name', 'Problem'], ...rows.map((r) => [r.row, r.name, r.message])]);
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: 'import-errors.csv' });
    a.click();
  };

  const view = result || check;
  const todo = check ? check.created + check.updated : 0;
  const list = view ? view.results.filter((r) => !onlyProblems || r.status === 'error' || r.status === 'skipped') : [];
  const label = kind === 'items' ? (todo === 1 ? 'item' : 'items') : todo === 1 ? 'category' : 'categories';

  return (
    <div className="flex flex-col gap-4">
      <div className={tw.seg + ' self-start'}>
        <button className={kind === 'items' ? 'active' : ''} onClick={() => reset('items')} disabled={!!busy}>Inventory items</button>
        <button className={kind === 'categories' ? 'active' : ''} onClick={() => reset('categories')} disabled={!!busy}>Categories</button>
      </div>

      {!result && (
        <>
          <div className="flex flex-col gap-2 p-3.5 rounded-xl border border-line bg-paper">
            <b className="text-[14px]">1. Download the template</b>
            <span className="text-[13px] text-muted">
              {kind === 'items'
                ? 'Columns marked * are required. Category, sub-category, brand and spec values must match your categories — the Help sheet lists them. Dates as DD-MM-YYYY.'
                : 'One category per row. Separate sub-categories and brands with commas. The Help sheet explains the Fields column.'}
            </span>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={tw.btnSm} onClick={() => downloadTemplate(kind, 'xlsx', categories)}><Icon name="download" size={14} /> Excel template</button>
              <button type="button" className={tw.btnSm} onClick={() => downloadTemplate(kind, 'csv', categories)}><Icon name="download" size={14} /> CSV template</button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <b className="text-[14px]">2. Choose your filled-in file</b>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
              className="flex items-center justify-center gap-3 h-20 rounded-xl border-2 border-dashed border-[#A9C9C2] bg-[#F4FAF8] cursor-pointer hover:bg-white text-[14px]"
            >
              <Icon name="upload" size={22} className="text-brand" />
              {file ? <span><b>{file.name}</b> <span className="text-muted">· click to choose another</span></span> : <span><b className="text-brand">Choose file</b> or drop it here · .xlsx or .csv</span>}
              <input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            </label>
          </div>
        </>
      )}

      {busy && <div className="text-[13px] text-muted">{busy}</div>}

      {parsed?.missing?.length > 0 && (
        <div className="p-3 rounded-lg bg-danger-soft text-danger text-[13px]">
          The file is missing these columns: <b>{parsed.missing.join(', ')}</b>. The first row must have the column names — download the template to see them.
        </div>
      )}

      {view && (
        <div className="flex flex-col gap-3">
          {!result && (
            <b className="text-[14px]">3. Check and import <span className="font-normal text-muted">· nothing is saved yet</span></b>
          )}
          {result && <b className="text-[15px] text-ok">✓ Import finished</b>}
          <div className="flex flex-wrap gap-2 text-[13px]">
            <span className="px-2.5 py-1 rounded-md bg-ok-soft text-ok font-semibold">{view.created} new</span>
            {view.updated > 0 && <span className="px-2.5 py-1 rounded-md bg-[#E6EEFB] text-[#1D4ED8] font-semibold">{view.updated} {kind === 'items' ? 'stock added' : 'merged'}</span>}
            {view.skipped > 0 && <span className="px-2.5 py-1 rounded-md bg-[#EBEEEA] text-muted font-semibold">{view.skipped} skipped</span>}
            {view.failed > 0 && <span className="px-2.5 py-1 rounded-md bg-danger-soft text-danger font-semibold">{view.failed} with errors</span>}
            <span className="px-1 py-1 text-muted">of {view.total} rows</span>
          </div>

          {!result && (check.skipped > 0 || check.updated > 0 || duplicates !== 'skip') && (
            <div className="flex flex-col gap-1.5 text-[13.5px]">
              <span className="font-semibold">When {kind === 'items' ? 'an item' : 'a category'} with the same name already exists:</span>
              {[
                ['skip', 'Skip it (leave it as it is)'],
                kind === 'items' ? ['addStock', 'Add the quantity to the existing item'] : ['merge', 'Add the new sub-categories, brands and fields to it'],
              ].map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="dup" checked={duplicates === v} onChange={() => { setDuplicates(v); runCheck(parsed, v); }} /> {l}
                </label>
              ))}
            </div>
          )}

          <div className="border border-line rounded-lg overflow-hidden">
            <div className="flex justify-between items-center px-3 py-2 bg-paper border-b border-line text-[12.5px]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Show only errors and skipped
              </label>
              {view.failed > 0 && <button type="button" className="bg-transparent border-0 p-0 text-brand underline cursor-pointer" onClick={downloadErrors}>Download error list</button>}
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              <table className="w-full text-[13px] border-collapse">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-muted text-[12px]">
                    <th className="px-3 py-1.5 font-semibold w-12">Row</th>
                    <th className="px-3 py-1.5 font-semibold">Name</th>
                    <th className="px-3 py-1.5 font-semibold w-20">Result</th>
                    <th className="px-3 py-1.5 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, 500).map((r) => (
                    <tr key={r.row} className="border-t border-line align-top">
                      <td className="px-3 py-1.5 text-muted tabular-nums">{r.row}</td>
                      <td className="px-3 py-1.5 font-medium">{r.name || <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-1.5"><span className={`px-1.5 py-0.5 rounded text-[11.5px] font-semibold ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span></td>
                      <td className={`px-3 py-1.5 ${r.status === 'error' ? 'text-danger' : 'text-muted'}`}>{r.message}</td>
                    </tr>
                  ))}
                  {!list.length && <tr><td colSpan="4" className="px-3 py-4 text-center text-muted">Nothing to show</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {parsed?.unknown?.length > 0 && kind === 'categories' && (
            <small className="text-muted">Columns not used: {parsed.unknown.join(', ')}</small>
          )}
          {!result && check.failed > 0 && <small className="text-muted">Rows with errors are left out. Fix them in the file and import it again — rows already imported will be skipped.</small>}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t border-line">
        {result ? (
          <>
            <button type="button" className={tw.btn} onClick={() => reset()}>Import another file</button>
            <button type="button" className={tw.btnPrimary} onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <button type="button" className={tw.btn} onClick={onClose}>Cancel</button>
            <button type="button" className={tw.btnPrimary} disabled={!check || !todo || !!busy} onClick={doImport}>
              {busy === 'Importing…' ? 'Importing…' : check ? `Import ${todo} ${label}` : 'Import'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
