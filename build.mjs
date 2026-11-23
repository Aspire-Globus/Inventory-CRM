// Build for hosting: installs server + client packages and builds the web app (client/dist).
// Runs automatically after `npm install` in this folder (package.json "postinstall").
// If node_modules came from a Windows zip, Linux sees its tools as "not executable" (Permission denied):
// on Linux/macOS we give those files their executable permission back before building.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function makeExecutable(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'bin' || entry.name === '.bin') chmodAll(p);
      else makeExecutable(p);
    }
  }
}
function chmodAll(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) chmodAll(p);
      else fs.chmodSync(p, 0o755);
    } catch { /* broken link etc. — skip */ }
  }
}

run('npm install --prefix server --omit=dev');
run('npm install --prefix client --include=dev');
if (process.platform !== 'win32') {
  makeExecutable(path.join(root, 'client', 'node_modules'));
  makeExecutable(path.join(root, 'server', 'node_modules'));
}
run('npm run build --prefix client');
console.log('Build finished: client/dist is ready');
