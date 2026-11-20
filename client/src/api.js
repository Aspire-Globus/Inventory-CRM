const BASE = import.meta.env.VITE_API_URL || '/api';

const TOKEN_KEY = 'aspire_token';
export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

async function request(path, { method = 'GET', body, params } = {}) {
  let url = BASE + path;
  if (params) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null));
    if ([...qs].length) url += `?${qs}`;
  }
  const headers = {};
  const isForm = body instanceof FormData; // file upload: the browser sets the multipart header itself
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server. Check that the server is running (npm run dev in the server folder).');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.dispatchEvent(new Event('auth:logout')); // AuthProvider sends the user to /login
  }
  if (res.status === 403) window.dispatchEvent(new Event('auth:refresh')); // permissions may have changed: reload them
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  // Something was saved: tell the app (e.g. the Repairs badge in the menu) to refresh
  if (method !== 'GET') window.dispatchEvent(new CustomEvent('data:changed', { detail: { path } }));
  return data;
}

export const api = {
  // Auth & profile
  login: (body) => request('/auth/login', { method: 'POST', body }),
  me: () => request('/auth/me'),
  updateMe: (body) => request('/auth/me', { method: 'PUT', body }),
  changePassword: (body) => request('/auth/me/password', { method: 'PUT', body }),

  // Users (admin)
  users: () => request('/users'),
  permissionList: () => request('/users/permissions'),
  createUser: (body) => request('/users', { method: 'POST', body }),
  updateUser: (id, body) => request(`/users/${id}`, { method: 'PUT', body }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  // Recycle Bin (admin)
  trash: (params) => request('/trash', { params }),
  restoreTrash: (id) => request(`/trash/${id}/restore`, { method: 'POST' }),
  purgeTrash: (id) => request(`/trash/${id}`, { method: 'DELETE' }),
  emptyTrash: () => request('/trash', { method: 'DELETE' }),

  // Notifications (admin)
  notifications: (params) => request('/notifications', { params }),
  unreadCount: () => request('/notifications/unread-count'),
  markRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request('/notifications/read-all', { method: 'POST' }),

  // Inventory
  items: (params) => request('/items', { params }),

  // Inventory categories (sub-categories, brands, spec fields)
  categories: () => request('/categories'),
  createCategory: (body) => request('/categories', { method: 'POST', body }),
  updateCategory: (id, body) => request(`/categories/${id}`, { method: 'PUT', body }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  item: (id) => request(`/items/${id}`),
  createItem: (body) => request('/items', { method: 'POST', body }),
  updateItem: (id, body) => request(`/items/${id}`, { method: 'PUT', body }),
  addStock: (id, body) => request(`/items/${id}/stock`, { method: 'POST', body }),
  // Inventory is never deleted — set status 'Active' or 'Inactive'
  setItemStatus: (id, status) => request(`/items/${id}/status`, { method: 'PATCH', body: { status } }),

  // Employees
  employees: (params) => request('/employees', { params }),
  employee: (id) => request(`/employees/${encodeURIComponent(id)}`),
  nextEmployeeId: () => request('/employees/next-id'),
  createEmployee: (body) => request('/employees', { method: 'POST', body }),
  updateEmployee: (id, body) => request(`/employees/${id}`, { method: 'PUT', body }),
  deleteEmployee: (id) => request(`/employees/${id}`, { method: 'DELETE' }),

  // Departments
  departments: () => request('/departments'),
  createDepartment: (body) => request('/departments', { method: 'POST', body }),
  updateDepartment: (id, body) => request(`/departments/${id}`, { method: 'PUT', body }),
  deleteDepartment: (id) => request(`/departments/${id}`, { method: 'DELETE' }),

  // Assignments
  assignments: (params) => request('/assignments', { params }),
  assign: (body) => request('/assignments', { method: 'POST', body }),
  returnItem: (id, body) => request(`/assignments/${id}/return`, { method: 'POST', body }),
  reassign: (id, body) => request(`/assignments/${id}/reassign`, { method: 'POST', body }),
  assignmentSummary: (params) => request('/assignments/summary', { params }),

  // Repairs (damaged / lost items)
  repairs: (params) => request('/repairs', { params }),
  repair: (id) => request(`/repairs/${id}`),
  repairSummary: () => request('/repairs/summary'),
  repairOptions: () => request('/repairs/options'),
  repairVendors: () => request('/repairs/vendors'),

  // Import from Excel / CSV ({ rows, duplicates, dryRun })
  importItems: (body) => request('/items/import', { method: 'POST', body }),
  importCategories: (body) => request('/categories/import', { method: 'POST', body }),

  // Global search (top bar)
  search: (q, limit = 5) => request('/search', { params: { q, limit } }),
  reportDamage: (body) => request('/repairs/report', { method: 'POST', body }),
  sendToRepair: (id, body) => request(`/repairs/${id}/send`, { method: 'POST', body }),
  repairResult: (id, body) => request(`/repairs/${id}/result`, { method: 'POST', body }),

  // Reports
  dashboard: () => request('/reports/dashboard'),
  stockReport: () => request('/reports/stock'),
  departmentReport: () => request('/reports/by-department'),
  activity: (params) => request('/reports/activity', { params }),
};

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-') : '—';

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
