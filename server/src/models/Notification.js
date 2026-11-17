import mongoose from 'mongoose';

// One entry per change in the system. Shown to administrators.
const notificationSchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // created | updated | deleted | restored | purged | assigned | returned | stock_added
    entity: { type: String, required: true }, // Item | Department | Employee | Assignment | User
    entityId: { type: mongoose.Schema.Types.ObjectId },
    entityName: { type: String, default: '' },
    message: { type: String, required: true },
    changes: [{ _id: false, field: String, from: String, to: String }],
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    actor: {
      id: mongoose.Schema.Types.ObjectId,
      name: String,
      role: String,
      email: String,
    },
    readBy: [{ type: mongoose.Schema.Types.ObjectId }],
  },
  { timestamps: true }
);

// Keep 90 days of notifications
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model('Notification', notificationSchema);