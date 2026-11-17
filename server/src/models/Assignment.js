import mongoose from 'mongoose';

const returnSchema = new mongoose.Schema(
  {
    quantity: { type: Number, required: true, min: 1 },
    returnDate: { type: Date, required: true, default: Date.now },
    condition: { type: String, enum: ['Good', 'Damaged', 'Faulty', 'Lost'], default: 'Good' }, // Damaged/Lost create a Repair record
    notes: { type: String, trim: true, default: '' },
    // Set when this "return" was a reassignment: who it was handed to
    transfer: {
      assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
      employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      employeeCode: String,
      employeeName: String,
      departmentName: String,
    },
  },
  { timestamps: true }
);

const fromSchema = new mongoose.Schema(
  {
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    employeeCode: String,
    employeeName: String,
    departmentName: String,
  },
  { _id: false }
);

// One record per issue. Records are never deleted — returns are appended.
const assignmentSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    // Snapshots so history stays accurate even if names/departments change later
    itemName: { type: String, required: true },
    category: { type: String, required: true },
    employeeCode: { type: String, required: true },
    employeeName: { type: String, required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    departmentName: { type: String, default: '' },

    quantity: { type: Number, required: true, min: 1 },
    returnedQuantity: { type: Number, default: 0, min: 0 }, // back to stock + handed to someone else
    transferredQuantity: { type: Number, default: 0, min: 0 }, // part of returnedQuantity that was reassigned
    issueDate: { type: Date, required: true, default: Date.now },
    notes: { type: String, trim: true, default: '' },
    returns: [returnSchema],
    transferredFrom: { type: fromSchema, default: undefined }, // set when this assignment came from a reassignment
    // Transferred = everything was handed to other employee(s); Returned = everything came back to stock
    status: { type: String, enum: ['Assigned', 'Partially Returned', 'Returned', 'Transferred'], default: 'Assigned' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

assignmentSchema.virtual('outstandingQuantity').get(function () {
  return this.quantity - this.returnedQuantity;
});

// Statuses where the employee no longer holds anything
export const CLOSED = ['Returned', 'Transferred'];

export const statusFor = (a) =>
  a.returnedQuantity < a.quantity
    ? a.returnedQuantity > 0 ? 'Partially Returned' : 'Assigned'
    : a.transferredQuantity >= a.returnedQuantity ? 'Transferred' : 'Returned';

assignmentSchema.index({ employee: 1, status: 1 });
assignmentSchema.index({ item: 1, status: 1 });

export default mongoose.model('Assignment', assignmentSchema);
