import mongoose from 'mongoose';

// Recycle Bin — a full copy of every deleted record.
// MongoDB removes each entry automatically when expiresAt passes (TTL index).
const trashSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['Item', 'Department', 'Employee', 'User', 'Category'], required: true },
    originalId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, default: '' },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    deletedBy: {
      id: mongoose.Schema.Types.ObjectId,
      name: String,
      role: String,
      email: String,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

trashSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Trash', trashSchema);
