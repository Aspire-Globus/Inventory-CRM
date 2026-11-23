import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { StatusBadge, assignmentStatus, useAsync } from './ui.jsx';
import { ListSkeleton } from './Skeleton.jsx';
import { tw } from './tw.js';

// The server writes "Reassigned to/from X (ID) — note"; keep only the user's note
const userNote = (n = '') => n.replace(/^Reassigned (to|from) [^—]*(— )?/, '').trim();

const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// Who an item was handed to (or received from), with that employee's current items
export default function TransferDetails({ assignment, onClose }) {
  const transfers = (assignment.returns || []).filter((r) => r.transfer?.employeeCode);
  const from = assignment.transferredFrom;
  // One person to show: a transfer target (pick from the list if there were several) or the source
  const people = [
    ...transfers.map((t) => ({ kind: 'to', code: t.transfer.employeeCode, name: t.transfer.employeeName, dept: t.transfer.departmentName, qty: t.quantity, date: t.returnDate, notes: userNote(t.notes) })),
    ...(from?.employeeCode ? [{ kind: 'from', code: from.employeeCode, name: from.employeeName, dept: from.departmentName, qty: assignment.quantity, date: assignment.issueDate, notes: userNote(assignment.notes) }] : []),
  ];
  const [pick, setPick] = useState(0);
  const p = people[pick];
  const { data, loading, error } = useAsync(() => (p ? api.employee(p.code) : Promise.resolve(null)), [p?.code]);

  if (!p) return <p className="text-muted">No transfer recorded for this assignment.</p>;
  const emp = data?.employee;
  const holding = (data?.assignments || []).filter((a) => a.outstandingQuantity > 0);

  return (
    <div className="flex flex-col gap-4">
      {/* The transfer(s) */}
      <div className="flex flex-col gap-2">
        {people.map((x, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setPick(i)}
            className={`flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-xl border cursor-pointer ${i === pick ? 'border-brand bg-brand-soft' : 'border-line bg-white hover:bg-paper'}`}
          >
            <span className="flex-1 min-w-0 text-[13.5px]">
              <strong>{x.qty} × {assignment.itemName}</strong>{' '}
              {x.kind === 'to' ? (
                <>handed from <strong>{assignment.employeeName}</strong> to <strong>{x.name}</strong></>
              ) : (
                <>received from <strong>{x.name}</strong></>
              )}
              <span className="block text-[12px] text-muted mt-0.5">
                {fmtDate(x.date)} · {x.kind === 'to' ? 'To' : 'From'} {x.dept || '—'}{x.notes ? ` · ${x.notes}` : ''}
              </span>
            </span>
            <span className="text-[12px] font-semibold text-brand">{i === pick ? 'Showing' : 'View'}</span>
          </button>
        ))}
      </div>

      {/* That employee */}
      <div className="border border-line rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 bg-paper border-b border-line">
          <span className="grid place-items-center w-10 h-10 rounded-full bg-brand-soft text-brand font-semibold text-[13px]">{initials(p.name)}</span>
          <span className="flex-1 min-w-0">
            <Link to={`/employees/${p.code}`} onClick={onClose} className="font-semibold">{emp?.name || p.name}</Link>
            <span className="block text-[12px] text-muted">
              <span className="font-mono">{p.code}</span> · {emp?.department?.name || p.dept || '—'}{emp?.designation ? ` · ${emp.designation}` : ''}
            </span>
          </span>
          {emp && <StatusBadge status={emp.status} />}
        </div>
        {loading ? (
          <div className="p-4"><ListSkeleton rows={2} /></div>
        ) : error ? (
          <div className="p-4 text-danger text-[13px]">{error.message}</div>
        ) : !holding.length ? (
          <div className="p-4 text-muted text-[13px]">{p.name} doesn't hold any items now.</div>
        ) : (
          <div className="max-h-[260px] overflow-y-auto">
            <table className={`${tw.table} [&_td]:!py-2 [&_th]:!py-2 [&_th]:sticky [&_th]:top-0 [&_th]:!rounded-none [&_th]:!border-x-0`}>
              <thead><tr><th>Item</th><th className="text-right">Holding</th><th>Since</th><th>Status</th></tr></thead>
              <tbody>
                {holding.map((a) => (
                  <tr key={a._id} className={a._id === assignment._id || transfers.some((t) => t.transfer?.assignment === a._id) ? '!bg-brand-soft' : ''}>
                    <td>{a.itemName}<small className="block text-muted">{a.category}</small></td>
                    <td className="text-right tabular-nums font-semibold">{a.outstandingQuantity}</td>
                    <td className="whitespace-nowrap">{fmtDate(a.issueDate)}</td>
                    <td><StatusBadge status={assignmentStatus(a)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
