import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['Admin', 'Staff'];

// What a Staff user can be allowed to do. Administrators always have everything.
export const PERMISSIONS = {
  inventory: 'Add / edit inventory items, stock and categories',
  departments: 'Add / edit departments',
  employees: 'Add / edit employees',
  assignments: 'Assign and return items',
  delete: 'Delete records (moves them to the Recycle Bin)',
  notifications: 'Receive change notifications',
  recycleBin: 'View and restore from the Recycle Bin (only Administrators can permanently delete)',
  users: 'Manage Staff login accounts',
};
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS);
export const DEFAULT_STAFF_PERMISSIONS = ['inventory', 'departments', 'employees', 'assignments', 'delete'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ROLES, default: 'Staff' },
    permissions: { type: [{ type: String, enum: ALL_PERMISSIONS }], default: () => [...DEFAULT_STAFF_PERMISSIONS] },
    phone: { type: String, trim: true, default: '' },
    designation: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

// Hash password whenever it is set or changed
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.can = function (perm) {
  return this.role === 'Admin' || (this.permissions || []).includes(perm);
};

userSchema.methods.toJSON = function () {
  const o = this.toObject();
  delete o.password;
  // What the app should actually allow (Admin = everything)
  o.effectivePermissions = this.role === 'Admin' ? ALL_PERMISSIONS : (this.permissions || []);
  return o;
};

export default mongoose.model('User', userSchema);
