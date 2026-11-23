// Pictures are stored as paths ("/uploads/items/x.jpg") but every API answer gives full links
// ("http://192.168.20.214:5000/uploads/items/x.jpg"), so ANY frontend / mobile app can show them as-is.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();
const PICTURE_KEYS = new Set(['image', 'photo']);
// Default picture for an item without its own (server/public/default-item.png)
export const DEFAULT_ITEM_IMAGE = '/static/default-item.png';

/** Remember this request's address while it is handled.
    PUBLIC_URL (e.g. https://inventory.aspireglobus.com) wins when set — use it on the live server.
    Otherwise: the browser's own scheme from the proxy header (https behind Hostinger), then the host. */
export function rememberBaseUrl(req, res, next) {
  const fixed = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const proto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host')).split(',')[0].trim();
  store.run(fixed || `${proto}://${host}`, next);
}

/** JSON replacer: "/uploads/..." in an image / photo field -> full link for the current request. */
export function fullPictureUrls(key, value) {
  if (PICTURE_KEYS.has(key) && typeof value === 'string' && (value.startsWith('/uploads/') || value.startsWith('/static/'))) {
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
