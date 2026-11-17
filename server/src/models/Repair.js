import mongoose from 'mongoose';

/**
 * One record per damage / loss report.
 * Damaged -> In repair -> Repaired (back to stock) | Scrapped (written off)
 * Lost is written off straight away.
 */
export const REPAIR_STATUS = ['Damaged', 'In repair', 'Repaired', 'Scrapped', 'Lost'];
export const OPEN_REPAIR = ['Damaged', 'In repair']; // units counted in Item.outOfServiceQuantity
export const DAMAGE_TYPES = ['Screen broken', 'Body damage', "Won't turn on", 'Keys / ports', 'Water damage', 'Software'];
// Labels used before (still accepted, so old apps / records keep working)
export const OLD_DAMAGE_TYPES = ['Body / physical damage', 'Not powering on', 'Keys / ports not working', 'Software / OS issue'];
export const REPAIR_BY = ['Outside vendor', 'In-house IT', 'Brand service centre (warranty)'];

const repairSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    itemName: { type: String, required: true },
    category: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },

    // Where it came from (empty = office stock)
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    employeeCode: { type: String, default: '' },
    employeeName: { type: String, default: '' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    departmentName: { type: String, default: '' },

    damageType: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    responsible: { type: String, enum: ['Normal wear', 'Employee'], default: 'Normal wear' },
    photo: { type: String, default: '' }, // data URL
    reportedAt: { type: Date, default: Date.now },

    status: { type: String, enum: REPAIR_STATUS, default: 'Damaged' },

    repair: {
      by: { type: String, default: '' },
      vendor: { type: String, trim: true, default: '' },
      contact: { type: String, trim: true, default: '' },
      jobNo: { type: String, trim: true, default: '' },
      sentAt: Date,
      expectedAt: Date,
      estimatedCost: Number,
      notes: { type: String, trim: true, default: '' },
    },

    // Earlier tries that came back NOT repaired (item went back to Damaged)
    attempts: [
      {
        _id: false,
        vendor: String,
        sentAt: Date,
        expectedAt: Date,
        estimatedCost: Number,
        returnedAt: Date,
        cost: Number,
        notes: String,
      },
    ],

    result: {
      outcome: { type: String, enum: ['Repaired', 'Scrapped', 'Lost'] },
      date: Date,
      finalCost: Number,
      notes: { type: String, trim: true, default: '' },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

repairSchema.virtual('overdueDays').get(function () {
  if (this.status !== 'In repair' || !this.repair?.expectedAt) return 0;
  const days = Math.floor((Date.now() - new Date(this.repair.expectedAt).getTime()) / 86400000);
  return days > 0 ? days : 0;
});

repairSchema.index({ status: 1, reportedAt: -1 });
repairSchema.index({ item: 1, status: 1 });

export default mongoose.model('Repair', repairSchema);
