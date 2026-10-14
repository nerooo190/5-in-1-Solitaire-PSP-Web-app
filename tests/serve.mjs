// Tiny static file server:  node tests/serve.mjs [port]   ->  http://localhost:8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.wasm': 'application/wasm', '.zip': 'application/zip' };
const port = +process.argv[2] || 8080;
http.createServer((q, r) => {
  const f = path.join(root, q.url === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
  r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' });
  r.end(fs.readFileSync(f));
}).listen(port, () => console.log(`5 in 1 Solitaire on http://localhost:${port}`));
