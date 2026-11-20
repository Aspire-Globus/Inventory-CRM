import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import itemRoutes from './routes/items.js';
import categoryRoutes, { ensureCategories } from './routes/categories.js';
import { syncAssignments } from './services/stock.js';
import employeeRoutes from './routes/employees.js';
import departmentRoutes from './routes/departments.js';
import assignmentRoutes from './routes/assignments.js';
import repairRoutes from './routes/repairs.js';
import searchRoutes from './routes/search.js';
import reportRoutes from './routes/reports.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import User from './models/User.js';
import trashRoutes from './routes/trash.js';
import notificationRoutes from './routes/notifications.js';
import { requireAuth, requirePerm, writePerm, forgetUsers } from './middleware/auth.js';
import swaggerUi from 'swagger-ui-express';
import { buildSpec } from './docs/openapi.js';
import { ICON_SVG, swaggerCss } from './docs/brand.js';
import { errorHandler } from './utils/http.js';
import { UPLOAD_ROOT } from './middleware/upload.js';
import { fullPictureUrls, rememberBaseUrl } from './utils/urls.js';
import { migrateInlinePictures } from './services/pictures.js';

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/inventory_system';

const app = express();
// Every image / photo in API answers becomes a full link (http://<server>/uploads/...)
app.set('json replacer', fullPictureUrls);
app.use(rememberBaseUrl);
// CORS: allow this PC on any IP (localhost, 192.168.x.x, 10.x.x.x, PC name), so an IP change
// never breaks the portal or the app. Extra origins can still be listed in CLIENT_ORIGIN.
const EXTRA_ORIGINS = (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+)(:\d+)?$/i;
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || LOCAL_ORIGIN.test(origin) || EXTRA_ORIGINS.includes(origin)),
  })
);
app.use(compression()); // gzip every answer: JSON lists get 5–10× smaller, so they arrive faster
app.use(express.json({ limit: '5mb' })); // allows small item images as data URLs
app.use(morgan('dev'));

// Uploaded pictures (item images): /uploads/items/<file>
app.use('/uploads', express.static(UPLOAD_ROOT, { maxAge: '30d', immutable: true }));
app.use('/uploads', (req, res) => res.status(404).json({ message: 'Picture not found' })); // never send the web page instead of a picture
// Default pictures (e.g. /static/default-item.png for items without their own picture)
app.use('/static', express.static(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public'), { maxAge: '7d' }));
// After any change to users, own profile/password or the Recycle Bin, drop cached logins
app.use((req, res, next) => {
  if (req.method !== 'GET' && /^\/api\/(users|auth|trash)/.test(req.path)) res.on('finish', forgetUsers);
  next();
});

// dbPingMs = how long one trip to the database takes (Atlas over the internet is usually 50–300 ms)
app.get('/api/health', async (req, res) => {
  const ok = mongoose.connection.readyState === 1;
  let dbPingMs = null;
  if (ok) {
    const t = Date.now();
    await mongoose.connection.db.admin().ping().catch(() => {});
    dbPingMs = Date.now() - t;
  }
  res.json({ ok: true, db: ok, dbPingMs });
});
app.use('/api/auth', authRoutes); // login is public; /me routes check the token themselves

// Everything below needs a logged-in user.
// Staff + Admin: full access to inventory, employees, departments, assignments (deletes go to the Recycle Bin).
// Admin only: users, Recycle Bin (restore / permanent delete) and change notifications.
// Permissions are set per user on the Users page (Administrators always have all of them).
app.use('/api/items', requireAuth, writePerm('inventory'), itemRoutes);
app.use('/api/categories', requireAuth, writePerm('inventory'), categoryRoutes);
app.use('/api/employees', requireAuth, writePerm('employees'), employeeRoutes);
app.use('/api/departments', requireAuth, writePerm('departments'), departmentRoutes);
app.use('/api/assignments', requireAuth, writePerm('assignments'), assignmentRoutes);
app.use('/api/repairs', requireAuth, writePerm('inventory'), repairRoutes);
app.use('/api/search', requireAuth, searchRoutes); // global search (top bar)
app.use('/api/reports', requireAuth, reportRoutes);
app.use('/api/users', requireAuth, requirePerm('users'), userRoutes);
app.use('/api/trash', requireAuth, requirePerm('recycleBin'), trashRoutes);
app.use('/api/notifications', requireAuth, requirePerm('notifications'), notificationRoutes);
// API documentation for the mobile app and other integrations
app.get('/api/openapi.json', (req, res) => res.json(buildSpec(`${req.protocol}://${req.get('host')}`)));
app.get('/api/brand/icon.svg', (req, res) => res.type('image/svg+xml').send(ICON_SVG));
app.use('/api/docs', swaggerUi.serve, (req, res, next) =>
  swaggerUi.setup(buildSpec(`${req.protocol}://${req.get('host')}`), {
    customSiteTitle: 'Aspire System Management API',
    customCss: swaggerCss,
    customfavIcon: '/api/brand/icon.svg',
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tryItOutEnabled: true },
  })(req, res, next)
);

app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

// Serve the built React app in production (client/dist)
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  // Built files have a hash in their name, so the browser can keep them for a year; index.html is always re-checked
  app.use('/assets', express.static(path.join(clientDist, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(clientDist, { maxAge: 0 }));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

// First run: create a default administrator so someone can log in
async function ensureAdmin() {
  if (await User.exists({})) return;
  const email = process.env.ADMIN_EMAIL || 'admin@aspire.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';
  await User.create({ name: 'Administrator', email, password, role: 'Admin' });
  console.log(`Created default admin → ${email} / ${password}  (change the password after logging in)`);
}

mongoose
  .connect(MONGODB_URI, {
    maxPoolSize: 20, // several requests at once each get their own connection
    minPoolSize: 3, // keep a few connections open, so a request never waits for a new Atlas handshake
    family: 4, // IPv4 only: avoids slow IPv6 lookups on Windows
    serverSelectionTimeoutMS: 15000,
  })
  .then(async () => {
    console.log('MongoDB connected');
    await ensureAdmin();
    await ensureCategories();
    await syncAssignments();
    await migrateInlinePictures().catch((err) => console.warn('Picture clean-up skipped:', err.message));
    app.listen(PORT, process.env.HOST || '0.0.0.0', async () => {
      const { networkInterfaces, hostname } = await import('node:os');
      const ips = Object.values(networkInterfaces())
        .flat()
        .filter((n) => n && n.family === 'IPv4' && !n.internal)
        .map((n) => n.address);
      console.log(`Local:   http://localhost:${PORT}`);
      ips.forEach((ip) => console.log(`Network: http://${ip}:${PORT}`));
      console.log(`Fixed:   http://${hostname()}:${PORT}   <- same URL even when the IP changes`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

export default app;
