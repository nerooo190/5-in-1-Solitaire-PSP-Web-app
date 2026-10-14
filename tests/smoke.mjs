// Headless smoke test: loads the app, opens each screen, starts each game, checks for JS errors.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = process.argv[2] || '/tmp/shots';
fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]);
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
}).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack||'')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/01-title.png` });
await page.click('#btn-start');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/02-menu.png` });
for (const id of ['klondike', 'spider', 'freecell', 'golf', 'gaps']) {
  await page.click(`.tile[data-id=${id}]`);
  await page.waitForTimeout(250);
  if (id === 'klondike') await page.screenshot({ path: `${out}/03-select.png` });
  await page.click('#btn-newgame');
  await page.waitForTimeout(2300);
  await page.screenshot({ path: `${out}/game-${id}.png` });
  await page.click('#btn-pause');
  await page.waitForTimeout(150);
  await page.click('#p-quit');
  await page.waitForTimeout(150);
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close(); srv.close();
