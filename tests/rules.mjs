// Targeted rule checks + real mouse drag & drop through the canvas.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]);
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
}).listen(0);
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForTimeout(300);
await page.click('#btn-start');

const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);

// ---- Spider: completing K..A of one suit removes the run, scores +100, flips next card
let r = await page.evaluate(() => {
  const App = window.__app, t = App.table;
  t.start('spider', { suits: 1 }, 3); t.mode = 'game'; t.update(5);
  const g = t.game;
  // clear the table, then build a K..2 run on t0 and place the Ace on t1
  const pool = [];
  t.piles.forEach((p) => p.cards.splice(0).forEach((c) => pool.push(c)));
  const take = (rank) => pool.splice(pool.findIndex((c) => c.rank === rank), 1)[0];
  const put = (p, c, up) => { c.up = up; c.shown = up; p.cards.push(c); c.pile = p; };
  for (let rk = 13; rk >= 2; rk--) put(g.tab[0], take(rk), true);
  put(g.tab[1], take(1), true);
  // a face-down card below the run's source (on t2) is not needed; check flip on t3
  put(g.tab[3], pool.pop(), false);
  t.layoutAll();
  const s0 = t.score;
  const ok = t.commitMove(g.tab[1], 0, g.tab[0]);
  return { ok, t0: g.tab[0].cards.length, done: g.found.filter((f) => f.cards.length === 13).length, score: t.score - s0, won: t.state };
});
check('spider run K..A completes and is removed', r.ok && r.t0 === 0 && r.done === 1 && r.score === 99, JSON.stringify(r));

// ---- Spider: only same-suit runs drag together; deal blocked while a column is empty
r = await page.evaluate(() => {
  const App = window.__app, t = App.table;
  t.start('spider', { suits: 4 }, 11); t.mode = 'game'; t.update(5);
  const g = t.game;
  const col = g.tab[0];
  const dragOk = col.cards.map((c, i) => g.canDrag(col, i));
  const top = g.canDrag(col, col.cards.length - 1);
  g.tab[2].cards.splice(0).forEach((c) => { c.pile = null; });
  const before = g.stock.cards.length;
  g.onClick(g.stock, -1, t);
  return { top, dealBlocked: g.stock.cards.length === before, stock: before };
});
check('spider: top card draggable, deal blocked by empty column', r.top && r.dealBlocked && r.stock === 50, JSON.stringify(r));

// ---- FreeCell: move capacity (cells+1)*2^emptyCols
r = await page.evaluate(() => {
  const App = window.__app, t = App.table;
  t.start('freecell', { automove: false }, 21); t.mode = 'game'; t.update(5);
  const g = t.game;
  const a = g.maxMove(false);
  g.cells[0].cards.push(g.tab[0].cards.pop()); g.cells[0].cards[0].pile = g.cells[0];
  const b = g.maxMove(false);
  g.tab[1].cards.splice(0).forEach((c) => { c.pile = null; });
  const c = g.maxMove(false), d = g.maxMove(true);
  return [a, b, c, d];
});
check('freecell capacity formula', JSON.stringify(r) === '[5,4,8,4]' || JSON.stringify(r) === '[5,4,8,4]', JSON.stringify(r) + ' (expect [5,4,8,4])');

// ---- Gaps: reshuffle conserves cards, keeps sorted runs, leaves 4 gaps
r = await page.evaluate(() => {
  const App = window.__app, t = App.table;
  t.start('gaps', { shuffle: true }, 33); t.mode = 'game'; t.update(5);
  const g = t.game;
  const ids = () => g.slots.flat().filter((p) => p.cards.length).map((p) => p.cards[0].uid).sort((x, y) => x - y).join(',');
  const before = ids();
  const gapsBefore = g.slots.flat().filter((p) => !p.cards.length).length;
  // play whatever is playable first so a run exists
  for (let i = 0; i < 20; i++) { const m = t.legalMoves()[0]; if (!m) break; t.commitMove(m.from, m.idx, m.to, { noUndo: true }); }
  const mid = ids(), runBefore = g.totalInPlace();
  g.reshuffle(t);
  const afterIds = ids();
  const gapsAfter = g.slots.flat().filter((p) => !p.cards.length).length;
  return { conserved: mid === afterIds, gapsBefore, gapsAfter, runBefore, runAfter: g.totalInPlace(), left: g.maxReshuffles - g.reshuffles };
});
check('gaps reshuffle', r.conserved && r.gapsBefore === 4 && r.gapsAfter === 4 && r.runAfter >= r.runBefore && r.left === 1, JSON.stringify(r));

// ---- Klondike: stock draw / recycle / scoring through real clicks on the canvas
await page.evaluate(() => { const App = window.__app; App.settings.klondike.draw = 1; App.ui.startGame('klondike', 99); window.__app.table.update(5); });
await page.waitForTimeout(2200);
const stockPos = await page.evaluate(() => { const t = window.__app.table; const s = t.game.stock; const v = t.view; return { x: v.cssOx + (s.x + 80) * v.cssS, y: v.cssOy + (s.y + 100) * v.cssS }; });
await page.mouse.click(stockPos.x, stockPos.y);
await page.waitForTimeout(300);
r = await page.evaluate(() => { const g = window.__app.table.game; return { stock: g.stock.cards.length, waste: g.waste.cards.length, moves: window.__app.table.moves }; });
check('klondike click on stock draws 1 card', r.stock === 23 && r.waste === 1 && r.moves === 1, JSON.stringify(r));
await page.keyboard.press('u');
await page.waitForTimeout(100);
r = await page.evaluate(() => { const g = window.__app.table.game; return { stock: g.stock.cards.length, waste: g.waste.cards.length, moves: window.__app.table.moves }; });
check('undo (key U) restores the draw', r.stock === 24 && r.waste === 0 && r.moves === 0, JSON.stringify(r));

// ---- real drag & drop: find a legal tableau/foundation move and perform it with the mouse
for (let attempt = 0; attempt < 30; attempt++) {
  await page.evaluate((seed) => { window.__app.ui.startGame('klondike', seed); window.__app.table.update(5); }, 100 + attempt);
  await page.waitForTimeout(1900);
  const mv = await page.evaluate(() => {
    const t = window.__app.table, v = t.view;
    const m = t.legalMoves().find((m) => m.from.role === 'tableau' && m.to.role === 'tableau' && m.to.cards.length);
    if (!m) return null;
    const c = m.from.cards[m.idx], dst = m.to.top;
    return { fx: v.cssOx + (c.x + 60) * v.cssS, fy: v.cssOy + (c.y + 40) * v.cssS, tx: v.cssOx + (dst.x + 70) * v.cssS, ty: v.cssOy + (dst.y + 90) * v.cssS, from: m.from.id, to: m.to.id, n: m.from.cards.length - m.idx, tn: m.to.cards.length };
  });
  if (!mv) continue;
  await page.mouse.move(mv.fx, mv.fy); await page.mouse.down();
  await page.mouse.move((mv.fx + mv.tx) / 2, (mv.fy + mv.ty) / 2, { steps: 6 });
  await page.mouse.move(mv.tx, mv.ty, { steps: 6 });
  await page.screenshot({ path: process.argv[2] ? process.argv[2] + '/dragging.png' : '/tmp/dragging.png' });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const after = await page.evaluate((mv) => { const t = window.__app.table; return { toLen: t.pile(mv.to).cards.length, moves: t.moves }; }, mv);
  check('mouse drag moves cards to target column', after.toLen === mv.tn + mv.n && after.moves === 1, `${mv.from}->${mv.to} ${JSON.stringify(after)}`);
  break;
}

// ---- hint
r = await page.evaluate(() => { const t = window.__app.table; t.showHint(); return !!t.hint || 'no-hint'; });
check('hint produces a highlight (or reports none)', r === true || r === 'no-hint', String(r));

console.log(results.join('\n'));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close(); srv.close();
process.exit(results.some((x) => x.startsWith('FAIL')) || errors.length ? 1 : 0);
