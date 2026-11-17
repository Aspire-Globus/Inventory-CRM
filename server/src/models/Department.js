import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, trim: true, uppercase: true },
    description: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('Department', departmentSchema);
