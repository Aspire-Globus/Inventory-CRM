import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, fmtDate, today } from '../api.js';
import Icon from '../components/Icons.jsx';
import { Field, useAsync, useToast } from '../components/ui.jsx';
import { useCrm } from '../components/Crm.jsx';
import { tw } from '../components/tw.js';
import SearchSelect from '../components/SearchSelect.jsx';

const EMPTY_EMP = { code: '', name: '', designation: '', location: '' };

export default function AssignPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: items, reload: reloadItems } = useAsync(api.items);
  const { data: departments } = useAsync(api.departments);
  const crm = useCrm(); // CRM link on -> employees come from the CRM, none are created here

  const [departmentId, setDepartmentId] = useState('');
  const [emp, setEmp] = useState(EMPTY_EMP);
  const [found, setFound] = useState(null); // existing employee record, if the ID matched
  const [lookup, setLookup] = useState({ state: 'idle', message: '' }); // idle | checking | found | new | mismatch
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  // Active employees of the chosen department (for the dropdown)
  const [deptEmps, setDeptEmps] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(false);
  const [manual, setManual] = useState(false); // type a new Employee ID instead (only when the CRM link is off)

  const [itemId, setItemId] = useState(params.get('item') || '');
  const [quantity, setQuantity] = useState(1);
  const [issueDate, setIssueDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const timer = useRef();

  // Prefill from ?employee=EMP-00125 (e.g. "Assign item" from an employee page)
  useEffect(() => {
    const code = params.get('employee');
    if (!code) return;
    api.employee(code).then(({ employee }) => {
      setDepartmentId(employee.department?._id || '');
      applyFound(employee);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Load the department's active employees whenever the department changes
  useEffect(() => {
    if (!departmentId) { setDeptEmps([]); return undefined; }
    let alive = true;
    setLoadingEmps(true);
    api.employees({ department: departmentId, status: 'Active' })
      .then((list) => alive && setDeptEmps(Array.isArray(list) ? list : list.data || []))
      .catch(() => alive && setDeptEmps([]))
      .finally(() => alive && setLoadingEmps(false));
    return () => { alive = false; };
  }, [departmentId]);

  const empOptions = deptEmps.map((e) => ({
    value: e._id,
    label: `${e.employeeId} — ${e.name}`,
    sub: [e.designation, e.location].filter(Boolean).join(' · ') || undefined,
  }));

  // Picked from the dropdown -> fill ID, name, designation, location
  const onPick = (id) => {
    const e = deptEmps.find((x) => x._id === id);
    if (e) applyFound(e);
    else { setFound(null); setEmp(EMPTY_EMP); setLookup({ state: 'idle', message: '' }); }
  };

  const applyFound = (e) => {
    setFound(e);
    setEmp({ code: e.employeeId, name: e.name, designation: e.designation || '', location: e.location || '' });
    setLookup({ state: 'found', message: '' });
    setShowSug(false);
  };

  // Look up the typed Employee ID (debounced) + name/ID suggestions within the department
  const check = (code, dept = departmentId) => {
    clearTimeout(timer.current);
    const value = code.trim();
    if (!value || !dept) {
      setLookup({ state: 'idle', message: '' });
      setSuggestions([]);
      return;
    }
    setLookup({ state: 'checking', message: '' });
    timer.current = setTimeout(async () => {
      const [exact, list] = await Promise.all([
        api.employee(value).then((r) => r.employee).catch(() => null),
        api.employees({ search: value, department: dept, status: 'Active' }).catch(() => []),
      ]);
      setSuggestions(list.slice(0, 6));
      if (!exact) {
        setFound(null);
        if (crm.enabled) {
          setLookup({ state: 'mismatch', message: `${value.toUpperCase()} was not found in the CRM. Add the employee in the CRM first, or pick a name from the list.` });
          return;
        }
        setLookup({ state: 'new', message: 'New Employee ID — the employee will be created in this department.' });
        return;
      }
      if (String(exact.department?._id) !== String(dept)) {
        setFound(null);
        setLookup({ state: 'mismatch', message: `${exact.employeeId} (${exact.name}) belongs to ${exact.department?.name}.`, employee: exact });
        return;
      }
      if (exact.status !== 'Active') {
        setFound(null);
        setLookup({ state: 'mismatch', message: `${exact.employeeId} is inactive.` });
        return;
      }
      applyFound(exact);
    }, 300);
  };

  const onDepartment = (id) => {
    setDepartmentId(id);
    setFound(null);
    if (manual && emp.code) check(emp.code, id);
    else { setEmp(EMPTY_EMP); setLookup({ state: 'idle', message: '' }); } // pick again from the new department's list
  };

  const onCode = (value) => {
    setEmp((e) => ({ ...e, code: value.toUpperCase(), ...(found ? { name: '', designation: '', location: '' } : {}) }));
    setFound(null);
    setShowSug(true);
    check(value);
  };

  const item = items?.find((i) => i._id === itemId);
  const tooMany = item && Number(quantity) > item.availableQuantity;
  const employeeReady = departmentId && emp.code.trim() && emp.name.trim() && (lookup.state === 'found' || lookup.state === 'new');
  const department = departments?.find((d) => d._id === departmentId);

  const submit = async (e) => {
    e.preventDefault();
    if (!employeeReady) return toast('Complete the department and employee details', 'error');
    setSaving(true);
    try {
      const body = { itemId, quantity: Number(quantity), issueDate, notes };
      if (found) body.employeeId = found._id;
      else Object.assign(body, {
        departmentId,
        employeeCode: emp.code.trim(),
        employeeName: emp.name.trim(),
        designation: emp.designation.trim(),
        location: emp.location.trim(),
      });
      setResult(await api.assign(body));
      reloadItems();
    } catch (err) {
      toast(err.message, 'error');
      reloadItems();
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setResult(null);
    setQuantity(1);
    setNotes('');
    setEmp(EMPTY_EMP);
    setFound(null);
    setLookup({ state: 'idle', message: '' });
  };

  if (result) {
    const a = result.assignment;
    return (
      <div className="max-w-2xl space-y-5">
        <section className="card bg-white border border-line rounded-xl shadow-panel p-5">
          <div className="text-center px-5 py-7 rounded-xl bg-ok-soft [&_h2]:!text-ok [&_h2]:text-[22px] [&_p]:mt-2.5 [&_p]:leading-relaxed">
            <div className="grid place-items-center w-14 h-14 mx-auto mb-3 rounded-full bg-ok text-white"><Icon name="check" size={30} /></div>
            <h2>Assigned Successfully!</h2>
            <p>
              {a.quantity} × {a.itemName} has been assigned to<br />
              <strong>{a.employeeName} ({a.employeeCode})</strong>.
            </p>
            {result.employeeCreated && <p className="text-[12.5px] text-muted">New employee record created in {a.departmentName}.</p>}
          </div>
          <dl className={tw.kv}>
            <div><dt>Item</dt><dd>{a.itemName}</dd></div>
            <div><dt>Asset Type</dt><dd>{a.category}</dd></div>
            <div><dt>Quantity</dt><dd>{a.quantity}</dd></div>
            <div><dt>Assigned To</dt><dd>{a.employeeName} ({a.employeeCode})</dd></div>
            <div><dt>Department</dt><dd>{a.departmentName}</dd></div>
            <div><dt>Issue Date</dt><dd>{fmtDate(a.issueDate)}</dd></div>
            <div><dt>Stock left</dt><dd className="text-ok font-semibold">{result.item.availableQuantity} {result.item.unit}</dd></div>
          </dl>
          <div className={tw.formActions}>
            <button className={tw.btnOutline} onClick={reset}>Assign Another</button>
            <button className={tw.btnPrimary} onClick={() => navigate(`/employees/${a.employeeCode}`)}>View Employee</button>
          </div>
        </section>
      </div>
    );
  }

  const locked = Boolean(found) || !manual; // picked from the list → details come from their record

  return (
    <div className="max-w-2xl space-y-5">
      <div className={tw.pageHead}>
        <div>
          <Link to="/assignments" className="text-brand font-medium text-[12.5px]">← Assignments</Link>
          <h1>Assign Inventory to Employee</h1>
        </div>
      </div>
      <section className={tw.cardPad}>
        <form onSubmit={submit} className="flex flex-col gap-4 [&_.field]:grid [&_.field]:grid-cols-[170px_1fr] [&_.field]:items-center [&_.field]:gap-3 [&_.field-hint]:col-start-2 [&_.field-hint]:-mt-2 [&_.field-error]:col-start-2 [&_.field-error]:-mt-2 [&_.info-box]:ml-[182px] max-md:[&_.field]:grid-cols-1 max-md:[&_.field]:gap-1.5 max-md:[&_.field-hint]:col-start-1 max-md:[&_.field-hint]:mt-0 max-md:[&_.field-error]:col-start-1 max-md:[&_.field-error]:mt-0 max-md:[&_.info-box]:ml-0">
          <Field label="Department" required>
            <select value={departmentId} onChange={(e) => onDepartment(e.target.value)} required autoFocus>
              <option value="">Select department…</option>
              {(departments || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </Field>
          {departments && !departments.length && (
            <p className="bg-warn-soft text-warn px-3 py-2.5 rounded-lg m-0">No departments yet — <Link to="/departments">add a department</Link> first.</p>
          )}

          <Field label="Employee ID" required>
            {!manual ? (
              <div className="flex flex-col gap-1.5">
                {departmentId ? (
                  <SearchSelect
                    options={empOptions}
                    value={found?._id || ''}
                    onChange={onPick}
                    loading={loadingEmps}
                    placeholder={`Search ${department?.name || ''} employees by ID or name…`}
                    emptyText="No active employees in this department"
                    required
                  />
                ) : (
                  <input disabled placeholder="Select department first" />
                )}
                {departmentId && !loadingEmps && (
                  <span className="text-xs text-muted">
                    {found ? <span className="text-ok">✓ {found.name} selected — details filled in below</span>
                      : `${deptEmps.length} active employee${deptEmps.length === 1 ? '' : 's'} in ${department?.name || 'this department'}`}
                    {!crm.enabled && (
                      <>
                        {' · '}
                        <button type="button" className="border-0 bg-transparent p-0 text-brand font-semibold text-xs underline cursor-pointer" onClick={() => { setManual(true); setFound(null); setEmp(EMPTY_EMP); setLookup({ state: 'idle', message: '' }); }}>
                          New employee ID
                        </button>
                      </>
                    )}
                  </span>
                )}
              </div>
            ) : (
              <>
              <div className="relative flex flex-col gap-1.5">
                <div className="flex [&_input]:!rounded-r-none [&_button]:w-[46px] [&_button]:border [&_button]:border-l-0 [&_button]:border-[#D3D9D5] [&_button]:bg-white [&_button]:rounded-r-lg [&_button]:text-muted [&_button]:text-xs [&_button]:font-semibold [&_button]:cursor-pointer [&_button]:grid [&_button]:place-items-center [&_button:disabled]:opacity-50 [&_button:disabled]:cursor-not-allowed">
                  <input
                    value={emp.code}
                    onChange={(e) => onCode(e.target.value)}
                    onFocus={() => suggestions.length && setShowSug(true)}
                    onBlur={() => setTimeout(() => setShowSug(false), 150)}
                    placeholder={departmentId ? 'e.g. EMP-00125 or a name' : 'Select department first'}
                    disabled={!departmentId}
                    required
                  />
                  <button type="button" onClick={() => check(emp.code)} disabled={!departmentId} aria-label="Find employee">
                    <Icon name="search" size={16} />
                  </button>
                </div>
                {showSug && suggestions.length > 0 && !found && (
                  <div className="absolute top-11 inset-x-0 z-10 overflow-hidden bg-white border border-line rounded-lg shadow-pop [&_button]:flex [&_button]:w-full [&_button]:items-baseline [&_button]:gap-2.5 [&_button]:text-left [&_button]:px-3 [&_button]:py-2.5 [&_button]:border-0 [&_button]:bg-transparent [&_button]:cursor-pointer [&_button:hover]:bg-brand-soft [&_small]:ml-auto [&_small]:text-muted">
                    {suggestions.map((s) => (
                      <button type="button" key={s._id} onMouseDown={() => applyFound(s)}>
                        <span className="font-mono text-[12.5px] tracking-tight">{s.employeeId}</span> {s.name}
                        <small>{s.designation}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {lookup.state === 'checking' && <span className="field-hint text-xs text-muted">Checking…</span>}
              {lookup.state === 'found' && <span className="field-hint text-xs text-muted text-ok">✓ Existing employee in {department?.name}</span>}
              {lookup.state === 'new' && <span className="field-hint text-xs text-muted text-brand">{lookup.message}</span>}
              {lookup.state === 'mismatch' && (
                <span className="field-error text-xs text-danger">
                  {lookup.message}{' '}
                  {lookup.employee && (
                    <button type="button" className="border-0 bg-transparent p-0 text-brand font-semibold text-xs underline cursor-pointer" onClick={() => { setDepartmentId(lookup.employee.department._id); applyFound(lookup.employee); }}>
                      Switch to {lookup.employee.department?.name}
                    </button>
                  )}
                </span>
              )}
                <button type="button" className="field-hint border-0 bg-transparent p-0 text-left text-brand font-semibold text-xs underline cursor-pointer" onClick={() => { setManual(false); setFound(null); setEmp(EMPTY_EMP); setLookup({ state: 'idle', message: '' }); }}>
                  ← Pick from the list
                </button>
              </>
            )}
          </Field>

          <Field label="Employee Name" required>
            <input
              value={emp.name}
              onChange={(e) => setEmp({ ...emp, name: e.target.value })}
              readOnly={locked}
              className={locked ? 'readonly' : ''}
              disabled={!departmentId}
              required
            />
          </Field>
          <Field label="Designation">
            <input value={emp.designation} onChange={(e) => setEmp({ ...emp, designation: e.target.value })} readOnly={locked} className={locked ? 'readonly' : ''} disabled={!departmentId} />
          </Field>
          <Field label="Location">
            <input value={emp.location} onChange={(e) => setEmp({ ...emp, location: e.target.value })} readOnly={locked} className={locked ? 'readonly' : ''} disabled={!departmentId} />
          </Field>

          <hr className="border-0 border-t border-line my-1" />

          <Field label="Item" required>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
              <option value="">Select item…</option>
              {(items || []).filter((i) => i.status !== 'Inactive').map((i) => (
                <option key={i._id} value={i._id} disabled={i.availableQuantity < 1}>
                  {i.name} (Available: {i.availableQuantity})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity" required hint={item ? `${item.availableQuantity} ${item.unit} available` : undefined}>
            <input
              type="number"
              min="1"
              max={item?.availableQuantity}
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={tooMany ? 'invalid' : ''}
              required
            />
            {tooMany && <span className="field-error text-xs text-danger">Exceeds available stock</span>}
          </Field>
          <Field label="Issue Date" required>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
          </Field>
          <Field label="Notes (Optional)">
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="New system issued." />
          </Field>
          <div className={tw.formActions}>
            <button type="button" className={tw.btn} onClick={() => navigate(-1)}>Cancel</button>
            <button className={tw.btnPrimary} disabled={saving || tooMany || !employeeReady || !itemId}>
              {saving ? 'Assigning…' : 'Assign'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
