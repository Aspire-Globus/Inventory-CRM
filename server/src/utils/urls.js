// Pictures are stored as paths ("/uploads/items/x.jpg") but every API answer gives full links
// ("http://192.168.20.214:5000/uploads/items/x.jpg"), so ANY frontend / mobile app can show them as-is.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();
const PICTURE_KEYS = new Set(['image', 'photo']);

/** Remember this request's address (http://<host>) while it is handled. */
export function rememberBaseUrl(req, res, next) {
  store.run(`${req.protocol}://${req.get('host')}`, next);
}

/** JSON replacer: "/uploads/..." in an image / photo field -> full link for the current request. */
export function fullPictureUrls(key, value) {
  if (PICTURE_KEYS.has(key) && typeof value === 'string' && value.startsWith('/uploads/')) {
    const base = store.getStore();
    return base ? base + value : value;
  }
  return value;
}

/** Incoming value: a full link to our own /uploads/... file -> back to the stored path. */
export function toStoredPath(v) {
  if (typeof v !== 'string') return v;
  const m = v.match(/^https?:\/\/[^/]+(\/uploads\/[^?#]+)/i);
  return m ? m[1] : v;
}
