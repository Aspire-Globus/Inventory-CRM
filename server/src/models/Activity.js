import mongoose from 'mongoose';

// Append-only log of every stock movement (assign / return / stock change).
const activitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['ASSIGN', 'RETURN', 'STOCK_ADD', 'STOCK_UPDATE'], required: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    itemName: String,
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    employeeCode: String,
    employeeName: String,
    departmentName: String,
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    quantity: Number,
    notes: String,
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

activitySchema.index({ date: -1 });
activitySchema.index({ employee: 1, date: -1 });

export default mongoose.model('Activity', activitySchema);
