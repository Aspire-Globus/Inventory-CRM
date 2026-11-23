import { Router } from 'express';
import { crmEnabled, crmState, getCrmEmployees, mapCrmEmployee, syncFromCrm } from '../services/crm.js';
import { asyncHandler, HttpError } from '../utils/http.js';

// Mounted at /api/crm behind requireAuth
const router = Router();

// Is the CRM link on, and how did the last sync go? (the web app uses this to hide Add / Edit / Delete)
router.get('/status', (req, res) => res.json({ ...crmState, enabled: crmEnabled(), running: crmState.running }));

// Sync now (needs the "employees" permission)
router.post(
  '/sync',
  asyncHandler(async (req, res) => {
    if (!req.user.can('employees')) throw new HttpError(403, 'You need the Employees permission to sync');
    if (!crmEnabled()) throw new HttpError(400, 'CRM link is off — set CRM_BASE_URL and SERVICE_API_KEY on the server');
    const counts = await syncFromCrm().catch((err) => { throw new HttpError(502, err.message); });
    res.json({ ok: true, counts, lastOk: crmState.lastOk });
  })
);

// Admin check: first 3 raw CRM records and how they are read (to confirm the field mapping)
router.get(
  '/preview',
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'Admin') throw new HttpError(403, 'Administrators only');
    if (!crmEnabled()) throw new HttpError(400, 'CRM link is off — set CRM_BASE_URL and SERVICE_API_KEY on the server');
    const raw = await getCrmEmployees().catch((err) => { throw new HttpError(502, err.message); });
    res.json({ total: raw.length, sample: raw.slice(0, 3).map((r) => ({ crm: r, readAs: mapCrmEmployee(r) })) });
  })
);

export default router;
