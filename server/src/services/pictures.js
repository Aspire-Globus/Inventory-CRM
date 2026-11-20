// One-time clean-up at start: pictures saved inside the database as text (data URLs)
// are moved to files in server/uploads, so lists stay small and every frontend can load them by link.
import Item from '../models/Item.js';
import Repair from '../models/Repair.js';
import { saveDataUrl } from '../middleware/upload.js';

async function move(Model, field, folder) {
  let moved = 0;
  const docs = await Model.find({ [field]: /^data:/ }).select(field).lean();
  for (const d of docs) {
    try {
      const url = saveDataUrl(d[field], folder);
      await Model.updateOne({ _id: d._id }, { $set: { [field]: url } });
      moved += 1;
    } catch (err) {
      console.warn(`Could not move ${Model.modelName} ${d._id} ${field}: ${err.message}`);
    }
  }
  return moved;
}

export async function migrateInlinePictures() {
  const [items, repairs] = [await move(Item, 'image', 'items'), await move(Repair, 'photo', 'repairs')];
  if (items || repairs) console.log(`Pictures moved to files: ${items} item image(s), ${repairs} damage photo(s)`);
}
