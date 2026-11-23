import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from './Icons.jsx';
import { useToast } from './ui.jsx';
import { tw } from './tw.js';

/* Employees & departments come from the CRM when the server has CRM_BASE_URL + SERVICE_API_KEY set.
   useCrm() tells a page whether that link is on (then Add / Edit / Delete are hidden — change people in the CRM). */
let cached = null; // shared by all pages, refreshed after a sync
const listeners = new Set();
const publish = (s) => { cached = s; listeners.forEach((fn) => fn(s)); };

export function useCrm() {
  const [state, setState] = useState(cached);
  useEffect(() => {
    listeners.add(setState);
    if (!cached) api.crmStatus().then(publish).catch(() => publish({ enabled: false }));
    return () => listeners.delete(setState);
  }, []);
  return state || { enabled: false, loading: true };
}

const ago = (d) => {
  if (!d) return 'never';
  const min = Math.round((Date.now() - new Date(d)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

/** "Synced from the CRM · 5 min ago · [Sync now]" bar. Shows nothing when the CRM link is off. */
export function CrmBar({ onSynced }) {
  const crm = useCrm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!crm.enabled) return null;

  const sync = async () => {
    setBusy(true);
    try {
      const r = await api.crmSync();
      const c = r.counts || {};
      toast(`Synced ${c.crmEmployees ?? 0} employees from the CRM (${c.added ?? 0} new)`);
      publish(await api.crmStatus());
      onSynced?.();
    } catch (err) {
      toast(err.message, 'error');
      api.crmStatus().then(publish).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const failed = crm.lastError && (!crm.lastOk || new Date(crm.lastRun) > new Date(crm.lastOk));
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 rounded-xl border text-[13px] ${failed ? 'bg-warn-soft border-warn/30' : 'bg-brand-soft border-brand/15'}`}>
      <Icon name={failed ? 'alert' : 'users'} size={16} className={failed ? 'text-warn' : 'text-brand'} />
      <span className="flex-1 min-w-[220px]">
        <b className="font-semibold">Employees and departments come from the CRM.</b>{' '}
        <span className="text-muted">Add or change people there — they sync here automatically.</span>
        <span className="block text-[12px] text-muted">
          {failed ? <span className="text-warn font-semibold">Last sync failed: {crm.lastError}</span> : <>Last synced {ago(crm.lastOk)}{crm.counts ? ` · ${crm.counts.crmEmployees} employees · ${crm.counts.departments} departments` : ''}</>}
        </span>
      </span>
      <button className={tw.btnSm} onClick={sync} disabled={busy || crm.running}>
        <Icon name="refresh" size={14} /> {busy || crm.running ? 'Syncing…' : 'Sync now'}
      </button>
    </div>
  );
}
