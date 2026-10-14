// Downloads the PSP emulator (PPSSPP compiled to WebAssembly, packaged by EmulatorJS) from npm
// into psp/emulatorjs/.   Usage: npm run setup:psp
// Licences: EmulatorJS = GPL-3.0, PPSSPP = GPL-2.0+. The binaries are NOT committed to this repo.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VERSION = '4.2.3';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const dest = path.join(root, 'psp', 'emulatorjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ejs-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString();

for (const pkg of [`@emulatorjs/emulatorjs@${VERSION}`, `@emulatorjs/core-ppsspp@${VERSION}`]) {
  const tgz = run('npm', ['pack', pkg, '--silent'], tmp).trim().split('\n').pop();
  run('tar', ['xzf', tgz], tmp);
  const dir = path.join(tmp, 'package');
  if (pkg.includes('core-ppsspp')) {
    const cores = path.join(dest, 'data', 'cores');
    fs.mkdirSync(path.join(cores, 'reports'), { recursive: true });
    for (const f of ['ppsspp-thread-wasm.data', 'ppsspp-assets.zip']) fs.copyFileSync(path.join(dir, f), path.join(cores, f));
    fs.copyFileSync(path.join(dir, 'reports', 'ppsspp.json'), path.join(cores, 'reports', 'ppsspp.json'));
  } else {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(path.join(dir, 'data'), path.join(dest, 'data'), { recursive: true });
    fs.copyFileSync(path.join(dir, 'LICENSE'), path.join(dest, 'LICENSE-EmulatorJS'));
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('PSP emulator installed to psp/emulatorjs/ — open psp.html (needs cross-origin isolation; `npm start` provides it).');
