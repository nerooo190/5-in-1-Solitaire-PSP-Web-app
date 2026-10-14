'use strict';
/* Rules for the five solitaire games: Klondike, Spider, FreeCell, Golf and Gaps. */
(function () {
  const Game = App.Game;
  const games = (App.games = {});

  const deck52 = (t) => {
    const out = [];
    for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) out.push(t.newCard(s, r));
    return out;
  };
  const sameColor = (a, b) => a.red === b.red;

  /* ============================== KLONDIKE ============================== */
  games.klondike = class Klondike extends Game {
    build(t, rnd) {
      const cw = (t.cw = 168),
        ch = (t.ch = 235);
      const pitch = 240,
        mx = 156;
      const X = (i) => mx + i * pitch;
      t.originX = X(0);
      t.originY = 118;
      this.drawN = this.opts.draw === 1 ? 1 : 3;
      this.recycles = 0;
      this.stock = t.newPile('stock', 'stock', 'stack', X(0), 118, { label: 'R' });
      this.waste = t.newPile('waste', 'waste', 'fanR', X(1), 118, { show: this.drawN, dx: 46, slotless: true });
      this.found = [];
      for (let i = 0; i < 4; i++) this.found.push(t.newPile('f' + i, 'foundation', 'stack', X(3 + i), 118, { label: 'A' }));
      this.tab = [];
      for (let i = 0; i < 7; i++)
        this.tab.push(t.newPile('t' + i, 'tableau', 'fan', X(i), 410, { label: 'K', dyDown: 26, dyUp: 58, minUp: 30, maxH: 975 - 410 - ch }));
      const cards = App.shuffle(deck52(t), rnd);
      for (let col = 0; col < 7; col++)
        for (let row = 0; row <= col; row++) t.deal(this.tab[col], cards.pop(), row === col);
      while (cards.length) t.deal(this.stock, cards.pop(), false);
      this.t = t;
    }
    canDrag(p, i) {
      const c = p.cards[i];
      if (!c) return false;
      if (p.role === 'waste' || p.role === 'foundation') return i === p.cards.length - 1;
      return p.role === 'tableau' && c.up;
    }
    canDrop(cards, from, to) {
      const c = cards[0];
      if (to.role === 'foundation') {
        if (cards.length !== 1) return false;
        const top = to.top;
        return top ? top.suit === c.suit && c.rank === top.rank + 1 : c.rank === 1;
      }
      if (to.role === 'tableau') {
        const top = to.top;
        if (!top) return c.rank === 13;
        return top.up && !sameColor(top, c) && top.rank === c.rank + 1;
      }
      return false;
    }
    afterMove(from, to, cards) {
      const t = this.t;
      let d = 0;
      if (from.role === 'waste') d += to.role === 'foundation' ? 10 : 5;
      else if (from.role === 'tableau' && to.role === 'foundation') d += 10;
      else if (from.role === 'foundation' && to.role === 'tableau') d -= 15;
      if (from.role === 'tableau' && from.top && !from.top.up) {
        from.top.up = true;
        d += 5;
      }
      t.score = Math.max(0, t.score + d);
    }
    onClick(p, idx, t) {
      if (p.role !== 'stock') return false;
      const st = this.stock,
        w = this.waste;
      if (st.cards.length) {
        t.beginAction();
        for (let i = 0; i < this.drawN && st.cards.length; i++) {
          const c = st.cards.pop();
          c.up = true;
          w.cards.push(c);
          c.pile = w;
        }
        t.endAction();
        App.audio.play('deal');
      } else if (w.cards.length) {
        t.beginAction();
        while (w.cards.length) {
          const c = w.cards.pop();
          c.up = false;
          st.cards.push(c);
          c.pile = st;
        }
        this.recycles++;
        if (this.drawN === 1) t.score = Math.max(0, t.score - 100);
        else if (this.recycles > 3) t.score = Math.max(0, t.score - 20);
        t.endAction();
        App.audio.play('flip');
      } else return false;
      return true;
    }
    autoTarget(p, idx, t) {
      const cs = p.cards.slice(idx);
      if (cs.length === 1) {
        for (const f of this.found) if (f !== p && this.canDrop(cs, p, f)) return f;
      }
      if (p.role === 'foundation') return null;
      let empty = null;
      for (const q of this.tab) {
        if (q === p || !this.canDrop(cs, p, q)) continue;
        if (q.cards.length) return q;
        if (!empty && idx > 0) empty = q;
      }
      return empty;
    }
    autoStep(t) {
      if (!this.opts.autoplay) return null;
      if (this.stock.cards.length || this.waste.cards.length) return null;
      if (this.tab.some((p) => p.cards.some((c) => !c.up))) return null;
      for (const p of this.tab) {
        const c = p.top;
        if (!c) continue;
        for (const f of this.found) if (this.canDrop([c], p, f)) return { from: p, idx: p.cards.length - 1, to: f };
      }
      return null;
    }
    onTick(t, sec) {
      if (this.opts.timed && sec % 10 === 0 && sec > 0) t.score = Math.max(0, t.score - 2);
    }
    isWon() {
      return this.found.reduce((n, p) => n + p.cards.length, 0) === 52;
    }
    hasSpecial() {
      return this.stock.cards.length > 0 || this.waste.cards.length > 0;
    }
    stockPile() {
      return this.stock.cards.length || this.waste.cards.length ? this.stock : null;
    }
    hud(t) {
      return [
        ['Score', t.score],
        ['Time', App.fmtTime(t.time)],
        ['Moves', t.moves],
      ];
    }
    hintScore(m) {
      if (m.to.role === 'foundation') return 100;
      let s = 20;
      if (m.from.role === 'tableau' && m.idx > 0 && !m.from.cards[m.idx - 1].up) s = 60;
      else if (m.from.role === 'tableau' && m.idx === 0) s = 40;
      if (m.from.role === 'waste') s += 10;
      if (m.from.role === 'foundation') s = 1;
      return s;
    }
    winBonus(t) {
      if (this.opts.timed && t.time > 30) t.score += Math.floor(700000 / t.time);
    }
    result(t) {
      return { score: t.score, better: 'high' };
    }
  };

  /* ================================ SPIDER ================================ */
  games.spider = class Spider extends Game {
    build(t, rnd) {
      const cw = (t.cw = 140),
        ch = (t.ch = 196);
      const pitch = 178,
        mx = 89;
      const X = (i) => mx + i * pitch;
      t.originX = X(9);
      t.originY = 118;
      this.stock = t.newPile('stock', 'stock', 'stack', X(9), 118, { label: 'R' });
      this.found = [];
      for (let i = 0; i < 8; i++) this.found.push(t.newPile('f' + i, 'foundation', 'stack', mx + i * 92, 118, { slotless: true }));
      this.tab = [];
      for (let i = 0; i < 10; i++)
        this.tab.push(t.newPile('t' + i, 'tableau', 'fan', X(i), 354, { dyDown: 18, dyUp: 44, minUp: 22, maxH: 985 - 354 - ch, label: '' }));
      const suits = this.opts.suits || 1;
      const set = suits === 1 ? [0] : suits === 2 ? [0, 1] : [0, 1, 2, 3];
      const cards = [];
      const per = 8 / set.length;
      for (const s of set) for (let k = 0; k < per; k++) for (let r = 1; r <= 13; r++) cards.push(t.newCard(s, r));
      App.shuffle(cards, rnd);
      for (let i = 0; i < 54; i++) {
        const col = i % 10;
        const row = Math.floor(i / 10);
        const last = i >= 44;
        t.deal(this.tab[col], cards.pop(), last);
        void row;
      }
      while (cards.length) t.deal(this.stock, cards.pop(), false);
      this.t = t;
      t.score = 500;
    }
    runLen(p, i) {
      const cs = p.cards;
      for (let k = i; k < cs.length - 1; k++) if (!(cs[k + 1].suit === cs[k].suit && cs[k + 1].rank === cs[k].rank - 1)) return false;
      return true;
    }
    canDrag(p, i) {
      if (p.role !== 'tableau') return false;
      const c = p.cards[i];
      return !!c && c.up && this.runLen(p, i);
    }
    canDrop(cards, from, to) {
      if (to.role !== 'tableau') return false;
      const top = to.top;
      return !top || top.rank === cards[0].rank + 1;
    }
    flipTop(p) {
      if (p.top && !p.top.up) p.top.up = true;
    }
    checkRun(p) {
      const cs = p.cards;
      if (cs.length < 13) return;
      const top = cs.length - 13;
      if (cs[top].rank !== 13 || !cs[top].up) return;
      for (let k = top; k < cs.length - 1; k++) {
        if (!(cs[k + 1].suit === cs[k].suit && cs[k + 1].rank === cs[k].rank - 1 && cs[k + 1].up)) return;
      }
      const dest = this.found.find((f) => !f.cards.length);
      if (!dest) return;
      const run = cs.splice(top);
      // aces land on top: reverse so the King sits at the bottom of the foundation stack
      for (const c of run) {
        dest.cards.push(c);
        c.pile = dest;
      }
      this.flipTop(p);
      this.t.score += 100;
      App.audio.play('found');
    }
    afterMove(from, to) {
      this.flipTop(from);
      this.t.score = Math.max(0, this.t.score - 1);
      this.checkRun(to);
    }
    onClick(p, idx, t) {
      if (p.role !== 'stock') return false;
      if (!this.stock.cards.length) return true;
      if (this.tab.some((q) => !q.cards.length)) {
        t.toast('Fill every empty column before dealing');
        App.audio.play('wrong');
        return true;
      }
      t.beginAction();
      for (const q of this.tab) {
        const c = this.stock.cards.pop();
        c.up = true;
        q.cards.push(c);
        c.pile = q;
      }
      t.score = Math.max(0, t.score - 1);
      for (const q of this.tab) this.checkRun(q);
      t.endAction();
      App.audio.play('deal');
      return true;
    }
    autoTarget(p, idx) {
      const cs = p.cards.slice(idx);
      let best = null,
        bs = -1;
      for (const q of this.tab) {
        if (q === p || !this.canDrop(cs, p, q)) continue;
        let s = 1;
        if (q.cards.length) {
          s = 10;
          if (q.top.suit === cs[0].suit) s += 20;
          // prefer not to break an existing same-suit run
        } else if (idx === 0) continue;
        if (s > bs) {
          bs = s;
          best = q;
        }
      }
      return best;
    }
    isWon() {
      return this.found.every((f) => f.cards.length === 13);
    }
    hasSpecial() {
      return this.stock.cards.length > 0;
    }
    stockPile() {
      return this.stock.cards.length ? this.stock : null;
    }
    hud(t) {
      return [
        ['Score', t.score],
        ['Time', App.fmtTime(t.time)],
        ['Moves', t.moves],
        ['Runs', this.found.filter((f) => f.cards.length).length + '/8'],
      ];
    }
    hintScore(m) {
      let s = 10;
      if (m.to.cards.length && m.to.top.suit === m.from.cards[m.idx].suit) s += 30;
      if (m.idx > 0 && !m.from.cards[m.idx - 1].up) s += 25;
      if (!m.to.cards.length) s -= 5;
      return s;
    }
    result(t) {
      return { score: t.score, better: 'high' };
    }
  };

  /* ================================ FREECELL ================================ */
  games.freecell = class FreeCell extends Game {
    build(t, rnd) {
      const cw = (t.cw = 160),
        ch = (t.ch = 224);
      const X = (i) => 127 + i * 215 + (i >= 4 ? 60 : 0);
      t.originX = X(3);
      t.originY = 118;
      this.cells = [];
      for (let i = 0; i < 4; i++) this.cells.push(t.newPile('c' + i, 'cell', 'stack', X(i), 118));
      this.found = [];
      for (let i = 0; i < 4; i++) this.found.push(t.newPile('f' + i, 'foundation', 'stack', X(4 + i), 118, { label: 'A' }));
      this.tab = [];
      for (let i = 0; i < 8; i++)
        this.tab.push(t.newPile('t' + i, 'tableau', 'fan', X(i), 380, { dyDown: 52, dyUp: 52, minUp: 26, maxH: 985 - 380 - ch }));
      const cards = App.shuffle(deck52(t), rnd);
      let i = 0;
      while (cards.length) {
        t.deal(this.tab[i % 8], cards.pop(), true);
        i++;
      }
      this.t = t;
    }
    seqOk(p, i) {
      const cs = p.cards;
      for (let k = i; k < cs.length - 1; k++) if (!(cs[k].rank === cs[k + 1].rank + 1 && !sameColor(cs[k], cs[k + 1]))) return false;
      return true;
    }
    canDrag(p, i) {
      if (p.role === 'cell') return i === 0 && p.cards.length === 1;
      if (p.role !== 'tableau') return false;
      return !!p.cards[i] && this.seqOk(p, i);
    }
    maxMove(toEmpty) {
      const free = this.cells.filter((c) => !c.cards.length).length;
      let empty = this.tab.filter((c) => !c.cards.length).length;
      if (toEmpty) empty = Math.max(0, empty - 1);
      return (free + 1) * Math.pow(2, empty);
    }
    canDrop(cards, from, to) {
      const c = cards[0];
      if (to.role === 'cell') return cards.length === 1 && !to.cards.length;
      if (to.role === 'foundation') {
        if (cards.length !== 1) return false;
        const top = to.top;
        return top ? top.suit === c.suit && c.rank === top.rank + 1 : c.rank === 1;
      }
      if (to.role === 'tableau') {
        const top = to.top;
        if (cards.length > this.maxMove(!top)) return false;
        if (!top) return true;
        return top.rank === c.rank + 1 && !sameColor(top, c);
      }
      return false;
    }
    afterMove() {}
    homeRank(suit) {
      const f = this.found.find((p) => p.top && p.top.suit === suit);
      return f ? f.top.rank : 0;
    }
    safe(c) {
      if (c.rank <= 2) return true;
      const opp = c.red ? [0, 2] : [1, 3];
      return opp.every((s) => this.homeRank(s) >= c.rank - 1);
    }
    autoStep() {
      if (!this.opts.automove) return null;
      const srcs = this.cells.concat(this.tab);
      for (const p of srcs) {
        const c = p.top;
        if (!c) continue;
        const dest = this.found.find((f) => this.canDrop([c], p, f));
        if (dest && (this.safe(c) || this.trivial())) return { from: p, idx: p.cards.length - 1, to: dest };
      }
      return null;
    }
    trivial() {
      // every column is already strictly descending and cells are empty -> pure foundation run
      return this.cells.every((c) => !c.cards.length) && this.tab.every((p) => p.cards.every((c, i) => i === 0 || p.cards[i - 1].rank > c.rank));
    }
    autoTarget(p, idx) {
      const cs = p.cards.slice(idx);
      if (cs.length === 1)
        for (const f of this.found) if (this.canDrop(cs, p, f)) return f;
      let empty = null;
      for (const q of this.tab) {
        if (q === p || !this.canDrop(cs, p, q)) continue;
        if (q.cards.length) return q;
        if (!empty && idx > 0) empty = q;
      }
      if (empty) return empty;
      if (cs.length === 1 && p.role !== 'cell') {
        const cell = this.cells.find((c) => !c.cards.length);
        if (cell) return cell;
      }
      return null;
    }
    isWon() {
      return this.found.reduce((n, p) => n + p.cards.length, 0) === 52;
    }
    hud(t) {
      return [
        ['Time', App.fmtTime(t.time)],
        ['Moves', t.moves],
        ['Home', this.found.reduce((n, p) => n + p.cards.length, 0) + '/52'],
      ];
    }
    hintScore(m) {
      if (m.to.role === 'foundation') return 100;
      if (m.to.role === 'cell') return 1;
      return m.to.cards.length ? 30 : 8;
    }
    result(t) {
      return { score: t.moves, better: 'low' };
    }
  };

  /* ================================== GOLF ================================== */
  games.golf = class Golf extends Game {
    build(t, rnd) {
      const cw = (t.cw = 178),
        ch = (t.ch = 250);
      const X = (i) => 151 + i * 240;
      t.originX = X(2);
      t.originY = 690;
      this.stock = t.newPile('stock', 'stock', 'stack', X(2), 690, {});
      this.waste = t.newPile('waste', 'waste', 'stack', X(3) + 10, 690, { label: '' });
      this.tab = [];
      for (let i = 0; i < 7; i++) this.tab.push(t.newPile('t' + i, 'tableau', 'fan', X(i), 118, { dyDown: 64, dyUp: 64, label: '', slotless: true }));
      const cards = App.shuffle(deck52(t), rnd);
      for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) t.deal(this.tab[col], cards.pop(), true);
      t.deal(this.waste, cards.pop(), true);
      while (cards.length) t.deal(this.stock, cards.pop(), false);
      this.t = t;
    }
    left() {
      return this.tab.reduce((n, p) => n + p.cards.length, 0);
    }
    canDrag(p, i) {
      return p.role === 'tableau' && i === p.cards.length - 1;
    }
    canDrop(cards, from, to) {
      if (to.role !== 'waste' || cards.length !== 1) return false;
      const top = to.top;
      if (!top) return false;
      const d = Math.abs(top.rank - cards[0].rank);
      return d === 1 || (this.opts.loop && d === 12);
    }
    onClick(p, idx, t) {
      if (p.role === 'stock') {
        if (!this.stock.cards.length) return true;
        t.beginAction();
        const c = this.stock.cards.pop();
        c.up = true;
        this.waste.cards.push(c);
        c.pile = this.waste;
        t.endAction();
        App.audio.play('deal');
        return true;
      }
      if (p.role === 'tableau' && idx === p.cards.length - 1) {
        if (this.canDrop([p.top], p, this.waste)) {
          t.commitMove(p, idx, this.waste);
        } else App.audio.play('wrong');
        return true;
      }
      return false;
    }
    autoTarget(p) {
      return this.canDrop([p.top], p, this.waste) ? this.waste : null;
    }
    isWon() {
      return this.left() === 0;
    }
    hasSpecial() {
      return this.stock.cards.length > 0;
    }
    stockPile() {
      return this.stock.cards.length ? this.stock : null;
    }
    hud(t) {
      return [
        ['Cards left', this.left()],
        ['Stock', this.stock.cards.length],
        ['Time', App.fmtTime(t.time)],
        ['Moves', t.moves],
      ];
    }
    hintScore() {
      return 50;
    }
    result() {
      return { score: this.left(), better: 'low', onLoss: true };
    }
  };

  /* ================================== GAPS ================================== */
  games.gaps = class Gaps extends Game {
    build(t, rnd) {
      const cw = (t.cw = 124),
        ch = (t.ch = 174);
      t.originX = 960;
      t.originY = 500;
      this.slots = [];
      for (let r = 0; r < 4; r++) {
        this.slots[r] = [];
        for (let c = 0; c < 13; c++) {
          const p = t.newPile('s' + r + '_' + c, 'slot', 'stack', 46 + c * 142, 130 + r * 210, { label: 'gap', row: r, col: c });
          this.slots[r][c] = p;
        }
      }
      const cards = App.shuffle(deck52(t), rnd);
      this.maxReshuffles = 2;
      this.reshuffles = 0;
      this.aces = [];
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 13; c++) {
          const card = cards.pop();
          if (card.rank === 1) {
            // aces are taken off the table, leaving four gaps
            card.pile = null;
            this.aces.push(card);
          } else t.deal(this.slots[r][c], card, true);
        }
      this.t = t;
    }
    left(p) {
      return p.col > 0 ? this.slots[p.row][p.col - 1].top : null;
    }
    allowed(p, c) {
      if (p.cards.length) return false;
      if (p.col === 0) return c.rank === 2;
      const l = this.slots[p.row][p.col - 1].top;
      return !!l && l.suit === c.suit && l.rank === c.rank - 1;
    }
    canDrag(p, i) {
      return p.role === 'slot' && p.cards.length === 1;
    }
    canDrop(cards, from, to) {
      return to.role === 'slot' && cards.length === 1 && this.allowed(to, cards[0]);
    }
    autoTarget(p) {
      const c = p.top;
      for (const row of this.slots) for (const q of row) if (this.allowed(q, c)) return q;
      return null;
    }
    inPlace(r) {
      const row = this.slots[r];
      let n = 0;
      for (let c = 0; c < 13; c++) {
        const card = row[c].top;
        if (!card) break;
        if (c === 0 ? card.rank !== 2 : !(card.suit === row[c - 1].top.suit && card.rank === row[c - 1].top.rank + 1)) break;
        n++;
      }
      return n;
    }
    totalInPlace() {
      return [0, 1, 2, 3].reduce((n, r) => n + this.inPlace(r), 0);
    }
    isWon() {
      return this.totalInPlace() === 48;
    }
    hasSpecial() {
      return this.reshuffles < this.maxReshuffles;
    }
    specialHint() {
      return 'No moves left — try a Reshuffle';
    }
    getExtra() {
      return this.reshuffles;
    }
    setExtra(v) {
      this.reshuffles = v;
    }
    canReshuffle() {
      return this.reshuffles < this.maxReshuffles;
    }
    reshuffle(t) {
      if (!this.canReshuffle() || t.state !== 'playing') return false;
      t.beginAction();
      const rnd = App.rng((t.seed ^ (0x9e3779b9 * (this.reshuffles + 1))) >>> 0);
      const pool = [];
      const free = [];
      for (let r = 0; r < 4; r++) {
        const keep = this.inPlace(r);
        for (let c = keep; c < 13; c++) {
          const p = this.slots[r][c];
          if (p.cards.length) pool.push(p.cards.pop());
          if (c === keep) continue; // first slot after the sorted run stays a gap
          free.push(p);
        }
      }
      // pool.length === free.length by construction
      if (this.opts.shuffle) App.shuffle(pool, rnd);
      for (const p of free) {
        const c = pool.pop();
        p.cards.push(c);
        c.pile = p;
      }
      this.reshuffles++;
      t.endAction();
      App.audio.play('reshuffle');
      return true;
    }
    hud(t) {
      return [
        ['In place', this.totalInPlace() + '/48'],
        ['Reshuffles', this.maxReshuffles - this.reshuffles],
        ['Time', App.fmtTime(t.time)],
        ['Moves', t.moves],
      ];
    }
    hintScore(m) {
      return 50 + (m.to.col === 0 ? 5 : 0);
    }
    result() {
      return { score: this.totalInPlace(), better: 'high', onLoss: true };
    }
  };
})();
