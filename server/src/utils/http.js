export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const toInt = (value, field) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `${field} must be a whole number of at least 1`);
  return n;
};

export const escapeRegex = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function errorHandler(err, req, res, _next) {
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    return res.status(409).json({ message: `A record with this ${field} already exists` });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(', ') });
  }
  if (err.name === 'CastError') return res.status(400).json({ message: `Invalid ${err.path}` });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ message: err.message || 'Server error' });
}

export const fmtDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

/* ---------- Pagination (opt-in: send ?page=1&limit=25) ----------
   Without `page` a list route returns a plain array, as before.
   With `page` it returns { data, page, limit, total, totalPages }. */
export const MAX_PAGE_SIZE = 100;

export function pageParams(query) {
  if (query.page === undefined || query.page === '') return null;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.limit, 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

export const paged = (data, total, p) => ({
  data,
  page: p.page,
  limit: p.limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / p.limit)),
});

// For lists built in memory (already filtered and sorted)
export const pageArray = (rows, p) => paged(rows.slice(p.skip, p.skip + p.limit), rows.length, p);
