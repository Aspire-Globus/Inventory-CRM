import mongoose from 'mongoose';

// Inventory categories are managed from the portal (Inventory → Manage Categories),
// so new kinds of stock can be added without touching code.
const fieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },     // stored in item.specs[key]
    label: { type: String, required: true, trim: true },   // shown in the form, e.g. "Processor"
    type: { type: String, enum: ['select', 'text', 'number'], default: 'select' },
    options: { type: [String], default: [] },              // dropdown values (type = select)
    placeholder: { type: String, trim: true, default: '' },
    // Show this field only for these sub-categories (empty = every sub-category)
    appliesTo: { type: [String], default: [] },
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    icon: { type: String, trim: true, default: 'Other' }, // one of the built-in category icons
    subCategories: { type: [String], default: [] },
    brands: { type: [String], default: [] },
    fields: { type: [fieldSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Category', categorySchema);
