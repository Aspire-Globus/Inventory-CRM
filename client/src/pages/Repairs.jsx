import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadCSV, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icons.jsx';
import { Pagination, SortTh, usePagination, useSort } from '../components/table.jsx';
import { Empty, Modal, StatusBadge, useAsync } from '../components/ui.jsx';
import { RepairDetails, RepairResultForm, ReportDamageForm, SendRepairForm, money } from '../components/RepairForms.jsx';
import { tw } from '../components/tw.js';
import RepairBoard from '../components/RepairBoard.jsx';
import { TableSkeleton } from '../components/Skeleton.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import { useUrlParam } from '../components/useUrlParam.js';

const TABS = [['', 'All'], ['Damaged', 'Damaged'], ['In repair', 'In repair'], ['Repaired', 'Repaired'], ['Scrapped', 'Scrapped / Lost']];

function Card({ label, value, tone, sub, subTone }) {
  return (
    <div className="flex flex-col gap-1 p-4 bg-white border border-line rounded-xl shadow-panel">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`text-[28px] font-bold leading-tight tabular-nums ${tone}`}>{value}</span>
      <span className={`text-[12px] ${subTone || 'text-muted'}`}>{sub}</span>
    </div>
  );
}

export default function Repairs() {
  const { can } = useAuth();
  const canEdit = can('inventory');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  useUrlParam('search', setSearch); // from the global search
  const [department, setDepartment] = useState('');
  const [dialog, setDialog] = useState(null); // { type: 'send'|'result'|'scrap'|'view'|'report', repair? }
  const [view, setView] = useState('board'); // board = 3 columns, list = full history table
  const [reloadKey, setReloadKey] = useState(0);
  const onAction = (a) => (a.type === 'list' ? setView('list') : setDialog(a));
  const { data: departments } = useAsync(api.departments);
  const { data: sum, reload: reloadSum } = useAsync(api.repairSummary);
  const { data, loading, error, reload } = useAsync(() => api.repairs({ status, search, department }), [status, search, department]);

  const rows = (data || []).map((r) => ({ ...r, from: r.employeeName || 'Office stock', vendor: r.repair?.vendor || r.repair?.by || '' }));
  const { sorted, sort, toggle } = useSort(rows, { key: 'reportedAt', dir: 'desc' });
  const pg = usePagination(sorted);
  const th = (label, field, className) => <SortTh label={label} field={field} sort={sort} onSort={toggle} className={className} />;

  const close = () => setDialog(null);
  const done = () => { close(); reload(); reloadSum(); setReloadKey((k) => k + 1); };

  const exportCsv = () =>
    downloadCSV('repairs.csv', sorted.map((r) => ({
      Reported: fmtDate(r.reportedAt), Item: r.itemName, Category: r.category, Quantity: r.quantity,
      From: r.from, 'Employee ID': r.employeeCode, Department: r.departmentName, 'Damage type': r.damageType,
      Description: r.description, Responsible: r.responsible, Status: r.status,
      'Repair by': r.repair?.by || '', Vendor: r.repair?.vendor || '', 'Sent on': r.repair?.sentAt ? fmtDate(r.repair.sentAt) : '',
      'Expected back': r.repair?.expectedAt ? fmtDate(r.repair.expectedAt) : '', 'Estimated cost': r.repair?.estimatedCost ?? '',
      'Result date': r.result?.date ? fmtDate(r.result.date) : '', 'Final cost': r.result?.finalCost ?? '',
    })));

  return (
    <>
      <div className={tw.pageHead}>
        <div>
          <h1>Repairs</h1>
          <p className="m-0 flex flex-wrap items-center gap-2 text-[14px] text-muted">
            <span className="px-2.5 py-0.5 rounded-full bg-warn-soft text-warn font-semibold">Damaged</span>→
            <span className="px-2.5 py-0.5 rounded-full bg-[#E6EEFB] text-[#1D4ED8] font-semibold">At repair shop</span>→
            <span className="px-2.5 py-0.5 rounded-full bg-ok-soft text-ok font-semibold">Done</span>
            <span className="ml-1">One button per step.</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className={tw.seg}>
            <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>Board</button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>History</button>
          </div>
          {view === 'list' && <button className={tw.btn} onClick={exportCsv} disabled={!sorted.length}><Icon name="download" size={16} /> Export</button>}
          {canEdit && <button className={tw.btnPrimary} onClick={() => setDialog({ type: 'report' })}><Icon name="plus" size={18} /> Mark damaged / lost</button>}
        </div>
      </div>

      {view === 'board' ? (
        <>
          <div className={`${tw.search} max-w-[320px]`}>
            <Icon name="search" size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item, employee or vendor…" />
          </div>
          <RepairBoard search={search} reloadKey={reloadKey} canEdit={canEdit} onAction={onAction} />
        </>
      ) : (<>
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
        <Card label="Damaged · waiting" value={sum?.damaged ?? '–'} tone="text-warn" sub="Not yet sent for repair" />
        <Card label="In repair" value={sum?.inRepair ?? '–'} tone="text-[#1D4ED8]" sub={sum?.overdue ? `${sum.overdue} overdue` : 'None overdue'} subTone={sum?.overdue ? 'text-danger font-semibold' : ''} />
        <Card label="Repaired this month" value={sum?.repairedThisMonth ?? '–'} tone="text-ok" sub={`${money(sum?.spentThisMonth || 0)} spent`} />
        <Card label="Scrapped / Lost" value={sum?.writtenOff ?? '–'} tone="text-danger" sub="Removed from total stock" />
      </div>

      <section className={tw.card}>
        <div className={tw.cardHead}>
          <div className={tw.seg}>
            {TABS.map(([v, l]) => (
              <button key={l} className={status === v ? 'active' : ''} onClick={() => setStatus(v)}>{l}</button>
            ))}
          </div>
          <div className={tw.filters}>
            <div className="w-[220px] max-md:w-full">
              <SearchSelect options={[{ value: '', label: 'All departments' }, ...(departments || []).map((d) => ({ value: d._id, label: d.name }))]} value={department} onChange={setDepartment} placeholder="All departments" emptyText="No department matches" />
            </div>
            <div className={tw.search}>
              <Icon name="search" size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item, employee or vendor…" />
            </div>
          </div>
        </div>
        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : error ? (
          <div className="text-danger p-6">{error.message}</div>
        ) : !rows.length ? (
          <Empty>{status || search || department ? 'Nothing matches these filters.' : 'No damaged or lost items. When an item is returned as Damaged it shows up here.'}</Empty>
        ) : (
          <>
            <div className={tw.tableWrap}>
              <table className={tw.table}>
                <thead>
                  <tr>
                    {th('Reported', 'reportedAt')}
                    {th('Item', 'itemName')}
                    {th('From', 'from')}
                    {th('Problem', 'damageType')}
                    {th('Status', 'status')}
                    {th('Repair details', 'vendor')}
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pg.pageRows.map((r) => (
                    <tr key={r._id} className="clickable" onClick={() => setDialog({ type: 'view', repair: r })}>
                      <td className="whitespace-nowrap">{fmtDate(r.reportedAt)}</td>
                      <td className="whitespace-nowrap">
                        <b className="font-semibold">{r.quantity > 1 ? `${r.quantity} × ` : ''}{r.itemName}</b>
                        <small className="text-muted block">{r.category}</small>
                      </td>
                      <td className="whitespace-nowrap">
                        {r.employeeCode ? (
                          <Link to={`/employees/${r.employeeCode}`} onClick={(e) => e.stopPropagation()}>{r.employeeName}</Link>
                        ) : <span className="text-muted">Office stock</span>}
                        <small className="text-muted block">{r.employeeCode ? `${r.employeeCode} · ${r.departmentName}` : ''}</small>
                      </td>
                      <td className="min-w-[180px]">
                        {r.damageType || (r.status === 'Lost' ? 'Lost' : '—')}
                        <small className="text-muted block max-w-[220px] truncate" title={r.description}>{r.description}</small>
                      </td>
                      <td className="whitespace-nowrap">
                        <StatusBadge status={r.status} />
                        {r.overdueDays > 0 && <small className="block mt-0.5 text-[11.5px] font-semibold text-danger">Overdue {r.overdueDays} day(s)</small>}
                      </td>
                      <td className="whitespace-nowrap">
                        {r.status === 'In repair' ? (
                          <>
                            {r.repair?.vendor || r.repair?.by}
                            <small className="text-muted block">
                              {r.repair?.expectedAt ? `due ${fmtDate(r.repair.expectedAt)} · ` : ''}Estimate {money(r.repair?.estimatedCost)}
                            </small>
                          </>
                        ) : r.status === 'Repaired' ? (
                          <>
                            {r.repair?.vendor || r.repair?.by || 'Repaired'}
                            <small className="text-muted block">back {fmtDate(r.result?.date)} · Paid {money(r.result?.finalCost)}</small>
                          </>
                        ) : r.status === 'Scrapped' ? (
                          <>
                            <span className="text-muted">Written off {fmtDate(r.result?.date)}</span>
                            {r.result?.notes && <small className="text-muted block max-w-[220px] truncate">{r.result.notes}</small>}
                          </>
                        ) : r.status === 'Lost' ? <span className="text-muted">Written off</span> : <span className="text-muted">—</span>}
                      </td>
                      <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {canEdit && r.status === 'Damaged' && (
                          <span className="inline-flex gap-1.5">
                            <button className={tw.btnSmPrimary} onClick={() => setDialog({ type: 'send', repair: r })}><Icon name="wrench" size={14} /> Send to repair</button>
                            <button className={tw.btnSmDanger} onClick={() => setDialog({ type: 'scrap', repair: r })}>Scrap</button>
                          </span>
                        )}
                        {canEdit && r.status === 'In repair' && (
                          <button className={tw.btnSmPrimary} onClick={() => setDialog({ type: 'result', repair: r })}><Icon name="check" size={14} /> Repair result</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pg={pg} label="records" />
          </>
        )}
      </section>

      </>)}

      {dialog?.type === 'report' && (
        <Modal title="Mark as damaged or lost" onClose={close} width={500}>
          <ReportDamageForm onCancel={close} onDone={done} />
        </Modal>
      )}
      {dialog?.type === 'send' && (
        <Modal title="Send to repair" onClose={close} width={500}>
          <SendRepairForm repair={dialog.repair} onCancel={close} onDone={done} />
        </Modal>
      )}
      {['result', 'scrap', 'notfixed'].includes(dialog?.type) && (
        <Modal title={dialog.type === 'scrap' ? 'Scrap item' : 'Got it back'} onClose={close} width={500}>
          <RepairResultForm
            repair={dialog.repair}
            initialOutcome={{ scrap: 'Scrapped', notfixed: 'Not repaired' }[dialog.type] || 'Repaired'}
            onCancel={close}
            onDone={done}
          />
        </Modal>
      )}
      {dialog?.type === 'view' && (
        <Modal title={`${dialog.repair.itemName} — history`} onClose={close} width={560}>
          <RepairDetails id={dialog.repair._id} />
        </Modal>
      )}
    </>
  );
}
