import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, trim: true, uppercase: true },
    description: { type: String, trim: true, default: '' },
    source: { type: String, enum: ['local', 'crm'], default: 'local' }, // 'crm' = comes from the CRM
    crmId: { type: String, index: true, sparse: true }, // the department's id in the CRM (survives renames)
  },
  { timestamps: true }
);

export default mongoose.model('Department', departmentSchema);
