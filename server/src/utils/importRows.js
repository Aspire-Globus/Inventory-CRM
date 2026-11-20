// Helpers for bulk import (Excel / CSV rows sent by the app as JSON)
import { HttpError } from './http.js';

export const MAX_IMPORT_ROWS = 2000;

export const txt = (v) => String(v ?? '').trim();
export const same = (a, b) => txt(a).toLowerCase() === txt(b).toLowerCase();

/** Validate the request: { rows: [...], dryRun?: true } */
export function importRows(body) {
  const rows = body?.rows;
  if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'Send rows: [...] — the file had no data rows');
  if (rows.length > MAX_IMPORT_ROWS) throw new HttpError(400, `Too many rows (${rows.length}). Import at most ${MAX_IMPORT_ROWS} at a time.`);
  return { rows, dryRun: body.dryRun === true || body.dryRun === 'true' };
}

/** "Laptop, Desktop" or "Laptop; Desktop" or an array -> ['Laptop', 'Desktop'] (no blanks, no duplicates) */
export function splitList(v) {
  const seen = new Set();
  return (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/))
    .map(txt)
    .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
}

/**
 * Dates as people type them in Excel / CSV:
 * 2026-11-18 · 18-11-2026 · 18/11/2026 · 18.11.2026 · an Excel date number (e.g. 46344) · an ISO string
 * Empty -> null. Anything else -> error.
 */
export function toDate(v, label) {
  const s = txt(v);
  if (!s) return null;
  let d = null;
  if (/^\d{4,5}(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 80000) {
    d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(s)) * 86400000); // Excel serial number
  } else if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    d = new Date(s.length <= 10 ? `${s}T00:00:00Z` : s);
  } else {
    const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/); // day first (India)
    if (m) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
      if (d.getUTCDate() !== Number(m[1])) d = null; // e.g. 31-02-2026
    }
  }
  if (!d || Number.isNaN(d.getTime())) throw new Error(`${label} "${s}" is not a date — use DD-MM-YYYY, e.g. 18-11-2026`);
  return d;
}

/** "65,000" / "₹ 65000" / 65000 -> 65000 */
export const toNumber = (v) => Number(txt(v).replace(/[₹,\s]/g, ''));
