// In-browser rules test: random/greedy playouts with invariants, undo checks and forced wins.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
await page.goto(`http://localhost:${srv.address().port}/`);
await page.waitForTimeout(300);

const res = await page.evaluate(async () => {
  const App = window.__app, t = App.table, out = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const count = () => t.piles.reduce((n, p) => n + p.cards.length, 0) + (t.game.aces ? t.game.aces.length : 0) + 0;
  const expected = { klondike: 52, spider: 104, freecell: 52, golf: 52, gaps: 52 };
  const sig = () => JSON.stringify(t.piles.map((p) => p.cards.map((c) => c.uid * 2 + (c.up ? 1 : 0))));
  for (const id of App.GAME_IDS) {
    const variants = id === 'spider' ? [1, 2, 4] : [0];
    for (const v of variants) {
      let plays = 0, wins = 0, bad = [], maxMoves = 0, undoOk = true, stuck = 0;
      for (let seed = 1; seed <= 25; seed++) {
        const opts = JSON.parse(JSON.stringify(App.settings[id]));
        if (id === 'spider') opts.suits = v;
        if (id === 'klondike') opts.draw = seed % 2 ? 1 : 3;
        if (id === 'golf') opts.loop = seed % 2 === 0;
        t.start(id, opts, seed * 7919);
        t.mode = 'game';
        t.update(5);
        if (count() !== expected[id]) bad.push(`${id} seed ${seed}: card count ${count()}`);
        let guard = 0, moves = 0;
        while (t.state === 'playing' && guard++ < 1500) {
          const before = sig();
          const lm = t.legalMoves().filter((m) => !(m.idx === 0 && m.to.role === 'tableau' && !m.to.cards.length && m.from.role === 'tableau'));
          let did = false;
          // prefer high hint score, random tie-break + epsilon exploration
          if (lm.length) {
            lm.forEach((m) => (m.s = t.game.hintScore(m, t) + Math.random() * 15));
            lm.sort((a, b) => b.s - a.s);
            const pick = Math.random() < 0.15 ? lm[Math.floor(Math.random() * lm.length)] : lm[0];
            const snapBefore = sig();
            did = t.commitMove(pick.from, pick.idx, pick.to, {});
            if (did) {
              moves++;
              if (moves % 17 === 0) { // undo + redo consistency
                const after = sig();
                t.undo();
                if (sig() !== snapBefore) undoOk = false;
                t.commitMove(pick.from, pick.idx, pick.to, {});
                if (sig() !== after) undoOk = false;
              }
            }
          }
          if (!did && t.game.hasSpecial(t)) {
            // special action: stock/deal/reshuffle
            const g = t.game;
            if (id === 'gaps') did = g.reshuffle(t);
            else if (g.stock && g.stock.cards.length) { did = g.onClick(g.stock, -1, t) !== false; }
            else if (id === 'klondike' && g.waste.cards.length) did = g.onClick(g.stock, -1, t);
          }
          t.cancelAuto();
          // run auto steps ourselves (instead of timers)
          for (let k = 0; k < 60; k++) { const mv = t.game.autoStep(t); if (!mv) break; t.commitMove(mv.from, mv.idx, mv.to, { noUndo: true, auto: true }); t.cancelAuto(); }
          t.update(2);
          if (t.state !== 'playing') break;
          if (!did) { if (!t.hasMoves()) { t.gameOver(); stuck++; } else break; }
          if (count() !== expected[id]) { bad.push(`${id} seed ${seed}: count drift ${count()}`); break; }
        }
        plays++;
        maxMoves = Math.max(maxMoves, moves);
        if (t.state === 'won') wins++;
      }
      out.push(`${id}${id === 'spider' ? '/' + v + 'suit' : ''}: ${plays} games, ${wins} won, ${stuck} stuck, max moves ${maxMoves}, undo ${undoOk ? 'ok' : 'FAIL'}${bad.length ? ' BAD: ' + bad.slice(0, 3).join('; ') : ''}`);
    }
  }
  // forced win flow
  t.start('klondike', App.settings.klondike, 5); t.mode = 'game';
  const all = []; t.piles.forEach((p) => p.cards.splice(0).forEach((c) => all.push(c)));
  all.sort((a, b) => a.suit - b.suit || a.rank - b.rank);
  all.forEach((c, i) => { const f = t.piles.find((p) => p.id === 'f' + c.suit); c.up = true; f.cards.push(c); c.pile = f; });
  t.moves = 1; t.afterAction();
  out.push('forced klondike win -> state ' + t.state + ', bouncers ' + t.bounce.length);
  for (let i = 0; i < 120; i++) t.update(1 / 60);
  out.push('after 2s of celebration: bouncers ' + t.bounce.length + ', stats klondike ' + JSON.stringify(App.stats.klondike));
  return out;
});
console.log(res.join('\n'));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close(); srv.close();
