import Notification from '../models/Notification.js';
import Trash from '../models/Trash.js';

export const TRASH_DAYS = Number(process.env.TRASH_DAYS || 30);

export const actorOf = (req) =>
  req?.user
    ? { id: req.user._id, name: req.user.name, role: req.user.role, email: req.user.email }
    : { name: 'System', role: 'System' };

/** Record a change so administrators get notified. Never throws. */
export async function notify(req, { action, entity, entityId, entityName = '', message, changes = [], meta = {} }) {
  try {
    await Notification.create({
      action,
      entity,
      entityId,
      entityName,
      message,
      changes,
      meta,
      actor: actorOf(req),
      readBy: req?.user ? [req.user._id] : [], // your own actions are already "read"
    });
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

const fmt = (v) => {
  if (v === undefined || v === null || v === '') return '—';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v instanceof Map) v = Object.fromEntries(v);
  if (typeof v === 'object' && v.name !== undefined) return String(v.name); // populated ref
  if (typeof v === 'object' && v._bsontype === 'ObjectId') return String(v);
  if (typeof v === 'object') {
    const entries = Object.entries(v).filter(([, x]) => x !== '' && x != null);
    return entries.length ? entries.sort().map(([k, x]) => `${k}: ${x}`).join(', ') : '—';
  }
  return String(v);
};

/**
 * Field-by-field changes between two plain objects.
 * fields: [[key, label, displayFn?], ...]
 */
export function diff(before, after, fields) {
  const out = [];
  for (const [key, label, display] of fields) {
    const a = fmt(before?.[key]);
    const b = fmt(after?.[key]);
    if (a === b) continue;
    out.push({ field: label, from: display ? display(before?.[key]) : a, to: display ? display(after?.[key]) : b });
  }
  return out;
}

/** Copy a document into the Recycle Bin, then delete the original. */
export async function moveToTrash(req, kind, doc, name) {
  const data = doc.toObject({ flattenMaps: true, virtuals: false, depopulate: true });
  const entry = await Trash.create({
    kind,
    originalId: doc._id,
    name,
    data,
    deletedBy: actorOf(req),
    expiresAt: new Date(Date.now() + TRASH_DAYS * 24 * 60 * 60 * 1000),
  });
  await doc.deleteOne();
  return entry;
}