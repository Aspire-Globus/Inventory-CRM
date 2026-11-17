import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true }, // name of a Category (managed in the portal)
    subCategory: { type: String, trim: true, default: '' }, // e.g. Laptop, Desktop
    brand: { type: String, trim: true, default: '' },       // company, e.g. Dell
    model: { type: String, trim: true, default: '' },       // e.g. Latitude 5550
    specs: { type: Map, of: String, default: {} },          // category-specific: processor, ram, resolution…
    totalQuantity: { type: Number, required: true, min: 0, default: 0 },
    // Quantity currently out with employees. Available = total - assigned.
    assignedQuantity: { type: Number, required: true, min: 0, default: 0 },
    // Damaged + In repair: owned but can't be assigned. Available = total - assigned - outOfService.
    outOfServiceQuantity: { type: Number, min: 0, default: 0 },
    unit: { type: String, trim: true, default: 'pcs' },
    vendor: { type: String, trim: true, default: '' },
    purchaseDate: { type: Date },
    warrantyUntil: { type: Date },
    unitPrice: { type: Number, min: 0 },
    description: { type: String, trim: true, default: '' },
    image: { type: String, default: '' }, // data URL or hosted URL
    // Items are never deleted. Inactive = retired: hidden from new assignments, history kept.
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

itemSchema.virtual('availableQuantity').get(function () {
  return this.totalQuantity - this.assignedQuantity - (this.outOfServiceQuantity || 0);
});

// Same formula for MongoDB queries ($expr)
export const AVAILABLE_EXPR = {
  $subtract: ['$totalQuantity', { $add: ['$assignedQuantity', { $ifNull: ['$outOfServiceQuantity', 0] }] }],
};

export default mongoose.model('Item', itemSchema);
