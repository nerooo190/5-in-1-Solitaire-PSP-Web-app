'use strict';
/* The card table: piles, cards, animation, drag & drop, undo, hints, win celebration.
   Rendering is Canvas2D at the true output resolution; sprites are cached so a frame is
   only a handful of drawImage calls (this is what makes 4K @ 120 fps feasible). */
(function () {
  const gfx = App.gfx;
  const VW = 1920,
    VH = 1080,
    PAD = gfx.PAD;

  class Card {
    constructor(uid, suit, rank) {
      this.uid = uid;
      this.suit = suit;
      this.rank = rank;
      this.up = false;
      this.shown = false;
      this.x = 0;
      this.y = 0;
      this.tx = 0;
      this.ty = 0;
      this.delay = 0;
      this.z = 0;
      this.flipT = -1;
      this.drag = false;
      this.pile = null;
      this.moving = false;
    }
    get red() {
      return this.suit === 1 || this.suit === 3;
    }
  }

  class Pile {
    constructor(id, role, kind, x, y, o) {
      this.id = id;
      this.role = role; // stock waste foundation tableau cell slot
      this.kind = kind; // stack | fan | fanR
      this.x = x;
      this.y = y;
      this.cards = [];
      this.label = '';
      Object.assign(this, o || {});
    }
    get top() {
      return this.cards[this.cards.length - 1];
    }
  }

  /* Base class for the five rule sets (see games.js). */
  class Game {
    constructor(opts) {
      this.opts = opts || {};
    }
    build() {}
    canDrag() {
      return false;
    }
    canDrop() {
      return false;
    }
    afterMove() {}
    onClick() {
      return false;
    }
    autoTarget() {
      return null;
    }
    autoStep() {
      return null;
    }
    onTick() {}
    isWon() {
      return false;
    }
    hasSpecial() {
      return false;
    }
    hud() {
      return [];
    }
    getExtra() {
      return null;
    }
    setExtra() {}
    hintScore(m) {
      return m.to.role === 'foundation' ? 100 : 10;
    }
    winBonus() {}
    result() {
      return { score: 0, better: 'high' };
    }
  }

  const ease = (t) => 1 - Math.pow(1 - t, 3);

  class Table {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.view = { cssS: 1, cssOx: 0, cssOy: 0, k: 1, S: 1, ox: 0, oy: 0, w: 1, h: 1 };
      this.mode = 'menu';
      this.game = null;
      this.gameId = null;
      this.piles = [];
      this.cards = [];
      this.undoStack = [];
      this.score = 0;
      this.moves = 0;
      this.time = 0;
      this.timerOn = false;
      this.paused = false;
      this.state = 'idle'; // idle playing won over
      this.cw = 168;
      this.ch = 235;
      this.zc = 0;
      this.drag = null;
      this.press = null;
      this.lastClick = { uid: -1, t: 0 };
      this.hint = null;
      this.dropHi = null;
      this.bounce = [];
      this.trail = null;
      this.autoToken = 0;
      this.dealSeq = [];
      this.fireflies = [];
      this.t0 = 0;
      this.frameT = 0;
      this.hudAcc = 0;
      this.dirty = true;
      this.recorded = true;
      this.onHud = null;
      this.onEnd = null;
      this.onToast = null;
      this.resize();
      this.initFireflies();
      this.bindInput();
    }

    /* ---------- sizing ---------- */
    resize() {
      const W = window.innerWidth,
        H = window.innerHeight;
      const cssS = Math.min(W / VW, H / VH);
      const res = App.settings.res;
      let k = res === 'native' ? window.devicePixelRatio || 1 : +res / (VH * cssS);
      const maxW = 7680;
      if (W * k > maxW) k = maxW / W;
      const pw = Math.max(2, Math.round(W * k)),
        ph = Math.max(2, Math.round(H * k));
      if (this.cv.width !== pw || this.cv.height !== ph) {
        this.cv.width = pw;
        this.cv.height = ph;
      }
      this.cv.style.width = W + 'px';
      this.cv.style.height = H + 'px';
      const kx = pw / W;
      this.view = {
        cssS,
        cssOx: (W - VW * cssS) / 2,
        cssOy: (H - VH * cssS) / 2,
        k: kx,
        S: cssS * kx,
        ox: ((W - VW * cssS) / 2) * kx,
        oy: ((H - VH * cssS) / 2) * kx,
        w: pw,
        h: ph,
        W,
        H,
      };
      if (this.trail) this.trail = null;
      this.dirty = true;
    }

    initFireflies() {
      this.fireflies = [];
      for (let i = 0; i < 46; i++) {
        this.fireflies.push({
          x: Math.random() * VW,
          y: Math.random() * VH,
          vx: (Math.random() - 0.5) * 18,
          vy: (Math.random() - 0.5) * 18,
          ph: Math.random() * 6.28,
          sp: 0.4 + Math.random() * 1.1,
          s: 14 + Math.random() * 26,
        });
      }
    }

    /* ---------- game lifecycle ---------- */
    start(gameId, opts, seed) {
      this.cancelAuto();
      if (this.game) this.abandon();
      const GameClass = App.games[gameId];
      this.gameId = gameId;
      this.opts = opts;
      this.seed = seed == null ? App.newSeed() : seed;
      this.game = new GameClass(opts);
      this.piles = [];
      this.cards = [];
      this.undoStack = [];
      this.bounce = [];
      this.trail = null;
      this.hint = null;
      this.drag = null;
      this.press = null;
      this.score = 0;
      this.moves = 0;
      this.time = 0;
      this.timerOn = false;
      this.paused = false;
      this.dealSeq = [];
      this.zc = 0;
      this.state = 'playing';
      this.recorded = false;
      this.mode = 'game';
      this.rnd = App.rng(this.seed);
      this.game.build(this, this.rnd);
      this.cards.forEach((c) => {
        c.x = this.originX;
        c.y = this.originY;
      });
      // stagger the deal animation
      const n = this.dealSeq.length;
      const step = Math.min(0.03, 1.1 / Math.max(1, n));
      this.layoutAll();
      this.dealSeq.forEach((c, i) => {
        c.delay = 0.12 + i * step;
        c.shown = false;
        c.x = this.originX;
        c.y = this.originY;
      });
      this.cards.forEach((c) => {
        if (!c.pile) return;
        c.shown = false;
      });
      this.dealSound(n, step);
      this.updateHud();
      this.dirty = true;
    }

    dealSound(n, step) {
      const count = Math.min(14, Math.ceil(n / 4));
      for (let i = 0; i < count; i++) setTimeout(() => App.audio.play('deal'), 120 + i * ((n * step * 1000) / count));
    }

    restart() {
      if (!this.gameId) return;
      this.start(this.gameId, this.opts, this.seed);
    }

    stop() {
      this.cancelAuto();
      if (this.game) this.abandon();
      this.game = null;
      this.gameId = null;
      this.piles = [];
      this.cards = [];
      this.state = 'idle';
      this.mode = 'menu';
      this.bounce = [];
      this.trail = null;
      this.dirty = true;
    }

    abandon() {
      if (this.state === 'playing' && this.moves > 0) this.recordResult(false, true);
    }

    newPile(id, role, kind, x, y, o) {
      const p = new Pile(id, role, kind, x, y, o);
      this.piles.push(p);
      return p;
    }
    pile(id) {
      return this.piles.find((p) => p.id === id);
    }
    newCard(suit, rank) {
      const c = new Card(this.cards.length, suit, rank);
      this.cards.push(c);
      return c;
    }
    /* deal a card onto a pile during build; remembers the order for the deal animation */
    deal(pile, card, up) {
      pile.cards.push(card);
      card.pile = pile;
      card.up = !!up;
      this.dealSeq.push(card);
    }

    /* ---------- layout ---------- */
    layoutAll() {
      for (const p of this.piles) this.layoutPile(p);
    }

    setTarget(c, x, y) {
      if (Math.abs(x - c.tx) > 0.5 || Math.abs(y - c.ty) > 0.5) {
        c.tx = x;
        c.ty = y;
        c.z = ++this.zc;
      }
    }

    layoutPile(p) {
      const cs = p.cards,
        n = cs.length;
      if (p.kind === 'stack') {
        for (let i = 0; i < n; i++) this.setTarget(cs[i], p.x, p.y);
      } else if (p.kind === 'fanR') {
        const show = p.show || 3;
        for (let i = 0; i < n; i++) {
          const j = Math.max(0, i - (n - show));
          this.setTarget(cs[i], p.x + j * p.dx, p.y);
        }
      } else {
        let down = 0,
          up = 0;
        for (let i = 0; i < n - 1; i++) cs[i].up ? up++ : down++;
        const dDown = p.dyDown,
          dUp = p.dyUp;
        let sDown = dDown,
          sUp = dUp;
        const total = down * dDown + up * dUp;
        if (p.maxH && total > p.maxH) {
          sUp = Math.max(p.minUp || 20, (p.maxH - down * dDown) / Math.max(1, up));
          if (down * dDown + up * sUp > p.maxH) {
            const f = p.maxH / (down * dDown + up * sUp);
            sUp *= f;
            sDown *= f;
          }
        }
        let y = p.y;
        for (let i = 0; i < n; i++) {
          this.setTarget(cs[i], p.x, y);
          y += cs[i].up ? sUp : sDown;
        }
      }
    }

    pileRect(p) {
      const cw = this.cw,
        ch = this.ch;
      const n = p.cards.length;
      if (!n) return { x: p.x, y: p.y, w: cw, h: ch };
      const last = p.cards[n - 1];
      if (p.kind === 'fan') return { x: p.x, y: p.y, w: cw, h: Math.max(ch, last.ty - p.y + ch) };
      if (p.kind === 'fanR') return { x: p.x, y: p.y, w: Math.max(cw, last.tx - p.x + cw), h: ch };
      return { x: p.x, y: p.y, w: cw, h: ch };
    }

    /* ---------- snapshots / undo ---------- */
    snap() {
      return {
        piles: this.piles.map((p) => p.cards.map((c) => c.uid * 2 + (c.up ? 1 : 0))),
        score: this.score,
        moves: this.moves,
        extra: this.game.getExtra(),
      };
    }
    pushUndo() {
      this.undoStack.push(this.snap());
      if (this.undoStack.length > 600) this.undoStack.shift();
    }
    restore(s) {
      this.cards.forEach((c) => (c.pile = null));
      this.piles.forEach((p, i) => {
        p.cards = s.piles[i].map((v) => {
          const c = this.cards[v >> 1];
          c.up = !!(v & 1);
          c.pile = p;
          return c;
        });
      });
      this.score = s.score;
      this.moves = s.moves;
      this.game.setExtra(s.extra);
      this.layoutAll();
      this.dirty = true;
    }
    undo() {
      if (this.state !== 'playing' && this.state !== 'over') return false;
      if (!this.undoStack.length) {
        App.audio.play('wrong');
        return false;
      }
      this.cancelAuto();
      this.state = 'playing';
      this.restore(this.undoStack.pop());
      this.hint = null;
      App.audio.play('undo');
      this.updateHud();
      this.onEnd && this.onEnd('resume');
      return true;
    }

    /* ---------- actions ---------- */
    startTimer() {
      this.timerOn = true;
    }

    /* Perform a user (or auto) move of cards[idx..] from `from` to `to`. */
    commitMove(from, idx, to, o) {
      o = o || {};
      const cards = from.cards.slice(idx);
      if (!cards.length || from === to || !this.game.canDrop(cards, from, to)) return false;
      if (!o.noUndo) this.pushUndo();
      this.startTimer();
      from.cards.splice(idx);
      for (const c of cards) {
        to.cards.push(c);
        c.pile = to;
      }
      this.moves++;
      this.lastAuto = !!o.auto;
      this.game.afterMove(from, to, cards);
      this.layoutAll();
      this.hint = null;
      App.audio.play(to.role === 'foundation' ? 'found' : 'place');
      this.afterAction();
      return true;
    }

    /* A non-move action taken by the game (stock draw, deal, reshuffle). Game calls this first. */
    beginAction() {
      this.pushUndo();
      this.startTimer();
      this.moves++;
      this.hint = null;
    }
    endAction() {
      this.layoutAll();
      this.afterAction();
    }

    afterAction() {
      this.updateHud();
      this.dirty = true;
      if (this.game.isWon()) {
        this.win();
        return;
      }
      this.cancelAutoTimer();
      const token = this.autoToken;
      this.autoTimer = setTimeout(() => {
        if (token !== this.autoToken) return;
        this.autoRun(token);
      }, this.lastAuto ? 110 : 260);
    }

    cancelAutoTimer() {
      clearTimeout(this.autoTimer);
    }
    cancelAuto() {
      this.autoToken++;
      clearTimeout(this.autoTimer);
      clearTimeout(this.stuckTimer);
    }

    autoRun(token) {
      if (token !== this.autoToken || this.state !== 'playing' || this.paused) return;
      const mv = this.game.autoStep(this);
      if (mv) {
        this.commitMove(mv.from, mv.idx, mv.to, { noUndo: true, auto: true });
        return;
      }
      // nothing automatic left: check for a dead end
      clearTimeout(this.stuckTimer);
      this.stuckTimer = setTimeout(() => {
        if (token !== this.autoToken || this.state !== 'playing') return;
        if (!this.hasMoves()) this.gameOver();
      }, 500);
    }

    legalMoves() {
      const res = [];
      const g = this.game;
      for (const p of this.piles) {
        if (!p.cards.length) continue;
        for (let i = 0; i < p.cards.length; i++) {
          if (!g.canDrag(p, i)) continue;
          const cards = p.cards.slice(i);
          for (const q of this.piles) if (q !== p && g.canDrop(cards, p, q)) res.push({ from: p, idx: i, to: q });
        }
      }
      return res;
    }
    hasMoves() {
      return this.game.hasSpecial(this) || this.legalMoves().length > 0;
    }

    showHint() {
      if (this.state !== 'playing') return;
      const moves = this.legalMoves().filter((m) => {
        // skip pointless "whole column to an empty column" shuffles
        if (m.idx === 0 && m.to.role === 'tableau' && !m.to.cards.length && m.from.role === 'tableau') return false;
        return true;
      });
      let best = null,
        bs = -1;
      for (const m of moves) {
        const s = this.game.hintScore(m, this);
        if (s > bs) {
          bs = s;
          best = m;
        }
      }
      if (best) {
        this.hint = { cards: best.from.cards.slice(best.idx), to: best.to, t: performance.now() };
        App.audio.play('select');
      } else if (this.game.hasSpecial(this)) {
        const sp = this.game.specialHint ? this.game.specialHint(this) : null;
        this.toast(sp || 'No moves — use the stock or reshuffle');
        if (this.game.stockPile) {
          const sp2 = this.game.stockPile(this);
          if (sp2) this.hint = { cards: sp2.cards.slice(-1), to: sp2, t: performance.now() };
        }
      } else this.toast('No more moves');
      this.dirty = true;
    }

    toast(msg) {
      this.onToast && this.onToast(msg);
    }

    win() {
      if (this.state === 'won') return;
      this.cancelAuto();
      this.state = 'won';
      this.timerOn = false;
      this.game.winBonus(this);
      this.updateHud();
      this.finalHud = this.game.hud(this);
      this.recordResult(true);
      App.audio.play('win');
      this.celebrate();
      this.onEnd && this.onEnd('won');
    }
    gameOver() {
      if (this.state !== 'playing') return;
      this.finalHud = this.game.hud(this);
      this.state = 'over';
      this.timerOn = false;
      this.recordResult(false);
      App.audio.play('over_game');
      this.onEnd && this.onEnd('over');
    }

    recordResult(won, abandoned) {
      if (this.recorded || !this.gameId) return;
      this.recorded = true;
      const s = App.stats[this.gameId];
      const r = this.game.result(this);
      s.played++;
      s.totalTime += Math.floor(this.time);
      if (won) {
        s.won++;
        s.streak++;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        if (s.bestTime == null || this.time < s.bestTime) s.bestTime = Math.floor(this.time);
      } else s.streak = 0;
      if ((won || r.onLoss) && r.score != null && (!abandoned || r.onLoss)) {
        if (s.best == null || (r.better === 'high' ? r.score > s.best : r.score < s.best)) s.best = r.score;
      }
      App.save();
    }

    updateHud() {
      this.onHud && this.onHud(this.game ? this.game.hud(this) : [], this);
    }

    /* ---------- win celebration: the classic bouncing cards ---------- */
    celebrate() {
      const list = [];
      this.piles.forEach((p) => p.cards.forEach((c) => list.push(c)));
      list.reverse();
      this.bounce = [];
      list.forEach((c, i) => {
        c.up = c.shown = true;
        c.flipT = -1;
        c.drag = false;
        const dir = Math.random() < 0.5 ? -1 : 1;
        this.bounce.push({
          c,
          delay: i * 0.07,
          x: c.x,
          y: c.y,
          vx: dir * (160 + Math.random() * 420),
          vy: -(100 + Math.random() * 500),
          live: false,
        });
      });
      this.cards.forEach((c) => (c.pile = null));
      this.piles.forEach((p) => (p.cards = []));
      this.trail = null;
    }

    stepBounce(dt) {
      if (!this.bounce.length) return;
      const cw = this.cw,
        ch = this.ch;
      let n = Math.ceil(dt / (1 / 120));
      n = Math.max(1, Math.min(8, n));
      const h = dt / n;
      if (!this.trail) {
        this.trail = document.createElement('canvas');
        this.trail.width = this.view.w;
        this.trail.height = this.view.h;
      }
      const tctx = this.trail.getContext('2d');
      const v = this.view;
      // fade old trails (time based) so the table stays readable behind the celebration
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.globalCompositeOperation = 'destination-out';
      tctx.fillStyle = 'rgba(0,0,0,' + (1 - Math.exp(-dt * 2.6)).toFixed(3) + ')';
      tctx.fillRect(0, 0, this.trail.width, this.trail.height);
      tctx.globalCompositeOperation = 'source-over';
      tctx.setTransform(v.S, 0, 0, v.S, v.ox, v.oy);
      for (let s = 0; s < n; s++) {
        for (let i = this.bounce.length - 1; i >= 0; i--) {
          const b = this.bounce[i];
          if (b.delay > 0) {
            b.delay -= h;
            continue;
          }
          b.live = true;
          b.vy += 2300 * h;
          b.x += b.vx * h;
          b.y += b.vy * h;
          const floor = VH - ch;
          if (b.y > floor) {
            b.y = floor;
            b.vy = -b.vy * 0.8;
          }
          const spr = gfx.face(b.c.suit, b.c.rank, cw, ch, v.S);
          tctx.drawImage(spr, b.x - PAD, b.y - PAD, cw + 2 * PAD, ch + 2 * PAD);
          b.c.x = b.x;
          b.c.y = b.y;
          if (b.x < -cw * 1.5 || b.x > VW + cw * 1.5) this.bounce.splice(i, 1);
        }
      }
      this.dirty = true;
    }

    /* ---------- per-frame update ---------- */
    update(dt) {
      this.frameT += dt;
      let moving = false;
      if (this.mode === 'game') {
        if (this.timerOn && this.state === 'playing' && !this.paused) {
          this.time += dt;
          this.hudAcc += dt;
          if (this.hudAcc >= 0.25) {
            const prev = Math.floor(this.time - this.hudAcc);
            this.hudAcc = 0;
            if (Math.floor(this.time) !== prev) this.game.onTick(this, Math.floor(this.time));
            this.updateHud();
          }
        }
        const k = 1 - Math.exp(-dt * 15);
        for (const c of this.cards) {
          if (!c.pile) continue;
          if (c.drag) {
            moving = true;
            continue;
          }
          if (c.delay > 0) {
            c.delay -= dt;
            moving = true;
            continue;
          }
          const dx = c.tx - c.x,
            dy = c.ty - c.y;
          if (dx > 0.35 || dx < -0.35 || dy > 0.35 || dy < -0.35) {
            c.x += dx * k;
            c.y += dy * k;
            c.moving = true;
            moving = true;
          } else {
            c.x = c.tx;
            c.y = c.ty;
            c.moving = false;
          }
          if (c.up !== c.shown && c.flipT < 0) c.flipT = 0;
          if (c.flipT >= 0) {
            c.flipT += dt / 0.2;
            moving = true;
            if (c.flipT >= 0.5 && c.shown !== c.up) c.shown = c.up;
            if (c.flipT >= 1) c.flipT = -1;
          }
        }
        this.stepBounce(dt);
        if (this.bounce.length) moving = true;
        if (this.hint) {
          moving = true;
          if (performance.now() - this.hint.t > 2600) this.hint = null;
        }
      }
      if (App.settings.particles) {
        for (const f of this.fireflies) {
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.ph += f.sp * dt;
          f.vx += (Math.random() - 0.5) * 12 * dt;
          f.vy += (Math.random() - 0.5) * 12 * dt;
          f.vx = App.clamp(f.vx, -22, 22);
          f.vy = App.clamp(f.vy, -22, 22);
          if (f.x < -40) f.x = VW + 40;
          if (f.x > VW + 40) f.x = -40;
          if (f.y < -40) f.y = VH + 40;
          if (f.y > VH + 40) f.y = -40;
        }
        moving = true;
      }
      if (moving) this.dirty = true;
    }

    /* ---------- drawing ---------- */
    render() {
      const ctx = this.ctx,
        v = this.view;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(gfx.background(App.settings.bg, v.w, v.h, this.mode === 'menu' && this.bgMode === 'menu' ? 'menu' : 'game'), 0, 0);
      ctx.setTransform(v.S, 0, 0, v.S, v.ox, v.oy);
      if (App.settings.particles) this.drawFireflies(ctx);
      if (this.mode !== 'game') return;
      if (this.trail) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.trail, 0, 0);
        ctx.setTransform(v.S, 0, 0, v.S, v.ox, v.oy);
      }
      const cw = this.cw,
        ch = this.ch,
        S = v.S;
      // empty slots
      for (const p of this.piles) {
        if (p.slotless) continue;
        const s = gfx.slot(p.label || '', cw, ch, S);
        ctx.drawImage(s, p.x - PAD, p.y - PAD, cw + 2 * PAD, ch + 2 * PAD);
      }
      if (this.dropHi) this.drawHighlights(ctx, this.dropHi.map((p) => this.pileRect(p)), 'rgba(140,255,170,', 0.9);
      const moving = [];
      const deck = App.settings.deck - 1;
      for (const p of this.piles) {
        const cs = p.cards,
          n = cs.length;
        const from = p.kind === 'stack' && n > 3 ? n - 3 : 0;
        for (let i = from; i < n; i++) {
          const c = cs[i];
          if (c.moving || c.delay > 0 || c.drag || c.flipT >= 0) moving.push(c);
          else this.drawCard(ctx, c, deck, 1, S);
        }
      }
      if (moving.length) {
        moving.sort((a, b) => (a.drag === b.drag ? a.z - b.z : a.drag ? 1 : -1));
        for (const c of moving) this.drawCard(ctx, c, deck, c.drag ? 1.04 : 1, S);
      }
      if (this.hint) {
        const t = (performance.now() - this.hint.t) / 1000;
        const a = 0.55 + 0.45 * Math.sin(t * 9);
        const rects = [];
        const first = this.hint.cards[0];
        if (first) {
          const last = this.hint.cards[this.hint.cards.length - 1];
          rects.push({ x: first.x, y: first.y, w: cw, h: last.y - first.y + ch });
        }
        rects.push(this.pileRect(this.hint.to));
        this.drawHighlights(ctx, rects, 'rgba(255,235,120,', a);
      }
    }

    drawHighlights(ctx, rects, col, a) {
      ctx.save();
      ctx.lineWidth = 6;
      ctx.strokeStyle = col + a + ')';
      ctx.shadowColor = col + '0.9)';
      ctx.shadowBlur = 18;
      for (const r of rects) {
        ctx.beginPath();
        ctx.roundRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 14);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawCard(ctx, c, deck, scale, S) {
      const cw = this.cw,
        ch = this.ch;
      let sx = 1;
      if (c.flipT >= 0) sx = Math.max(0.03, Math.abs(Math.cos(Math.PI * c.flipT)));
      const spr = c.shown ? gfx.face(c.suit, c.rank, cw, ch, S) : gfx.back(deck, cw, ch, S);
      const w = (cw + 2 * PAD) * sx * scale,
        h = (ch + 2 * PAD) * scale;
      const cx = c.x + cw / 2,
        cy = c.y + ch / 2;
      ctx.drawImage(spr, cx - w / 2, cy - h / 2 - (scale > 1 ? 6 : 0), w, h);
    }

    drawFireflies(ctx) {
      const t = this.frameT;
      const g = gfx.glow;
      for (const f of this.fireflies) {
        const a = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(f.ph));
        ctx.globalAlpha = a;
        const s = f.s;
        ctx.drawImage(g, f.x - s, f.y - s + Math.sin(t * 0.4 + f.ph) * 4, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
    }

    /* ---------- input ---------- */
    toVirtual(e) {
      const v = this.view;
      return { x: (e.clientX - v.cssOx) / v.cssS, y: (e.clientY - v.cssOy) / v.cssS };
    }

    hit(x, y) {
      const cw = this.cw,
        ch = this.ch;
      for (const p of this.piles) {
        const cs = p.cards;
        for (let i = cs.length - 1; i >= 0; i--) {
          const c = cs[i];
          if (x >= c.x && x <= c.x + cw && y >= c.y && y <= c.y + ch) return { pile: p, idx: i, card: c };
          if (p.kind === 'stack') break; // stacked cards share a rect
        }
      }
      for (const p of this.piles)
        if (!p.cards.length && x >= p.x && x <= p.x + cw && y >= p.y && y <= p.y + ch) return { pile: p, idx: -1, card: null };
      return null;
    }

    bindInput() {
      const cv = this.cv;
      cv.style.touchAction = 'none';
      cv.addEventListener('pointerdown', (e) => this.onDown(e));
      cv.addEventListener('pointermove', (e) => this.onMove(e));
      cv.addEventListener('pointerup', (e) => this.onUp(e));
      cv.addEventListener('pointercancel', (e) => this.onUp(e, true));
      cv.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.mode !== 'game' || this.state !== 'playing' || this.paused) return;
        const p = this.toVirtual(e);
        const h = this.hit(p.x, p.y);
        if (h && h.card) this.autoMove(h.pile, h.idx);
      });
    }

    canPlay() {
      return this.mode === 'game' && this.state === 'playing' && !this.paused && this.game;
    }

    onDown(e) {
      App.audio.init();
      if (!this.canPlay() || e.button > 0) return;
      const p = this.toVirtual(e);
      const h = this.hit(p.x, p.y);
      this.press = null;
      if (!h) return;
      this.cv.setPointerCapture(e.pointerId);
      const press = { h, x: e.clientX, y: e.clientY, vx: p.x, vy: p.y, t: performance.now(), dragging: false };
      if (h.card && this.game.canDrag(h.pile, h.idx)) {
        const cards = h.pile.cards.slice(h.idx);
        press.cards = cards;
        press.offx = p.x - cards[0].x;
        press.offy = p.y - cards[0].y;
        press.rel = cards.map((c) => [c.x - cards[0].x, c.y - cards[0].y]);
      }
      this.press = press;
    }

    onMove(e) {
      const pr = this.press;
      if (!pr) {
        if (this.canPlay() && e.pointerType === 'mouse') {
          const p = this.toVirtual(e);
          const h = this.hit(p.x, p.y);
          this.cv.style.cursor = h && (h.pile.role === 'stock' || (h.card && this.game.canDrag(h.pile, h.idx))) ? 'pointer' : 'default';
        }
        return;
      }
      const p = this.toVirtual(e);
      if (!pr.dragging) {
        if (!pr.cards) return;
        if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 6) return;
        pr.dragging = true;
        this.hint = null;
        pr.cards.forEach((c) => {
          c.drag = true;
          c.z = ++this.zc;
        });
        this.dropHi = this.piles.filter((q) => q !== pr.h.pile && this.game.canDrop(pr.cards, pr.h.pile, q));
        this.cv.style.cursor = 'grabbing';
      }
      const base = { x: p.x - pr.offx, y: p.y - pr.offy };
      pr.cards.forEach((c, i) => {
        c.x = base.x + pr.rel[i][0];
        c.y = base.y + pr.rel[i][1];
      });
      this.dirty = true;
    }

    onUp(e, cancel) {
      const pr = this.press;
      this.press = null;
      this.dropHi = null;
      this.cv.style.cursor = 'default';
      if (!pr) return;
      if (pr.dragging) {
        const cards = pr.cards;
        cards.forEach((c) => (c.drag = false));
        const from = pr.h.pile;
        let target = null;
        if (!cancel) target = this.findDrop(cards, from);
        if (target) this.commitMove(from, pr.h.idx, target);
        else {
          // returns home; buzz only if dropped on top of some other pile
          if (!cancel && this.overlapsOther(cards[0], from)) App.audio.play('wrong');
          cards.forEach((c) => (c.z = ++this.zc));
        }
        this.dirty = true;
        return;
      }
      if (cancel) return;
      // plain click / tap
      const now = performance.now();
      const h = pr.h;
      const uid = h.card ? h.card.uid : -2 - this.piles.indexOf(h.pile);
      const dbl = this.lastClick.uid === uid && now - this.lastClick.t < 380;
      this.lastClick = { uid, t: now };
      if (!dbl || h.pile.role === 'stock') {
        if (this.game.onClick(h.pile, h.idx, this)) return;
      }
      if (dbl && h.card) {
        this.lastClick = { uid: -1, t: 0 };
        this.autoMove(h.pile, h.idx);
      }
    }

    autoMove(pile, idx) {
      if (!this.canPlay() || !this.game.canDrag(pile, idx)) return false;
      const to = this.game.autoTarget(pile, idx, this);
      if (to) return this.commitMove(pile, idx, to);
      App.audio.play('wrong');
      return false;
    }

    overlapsOther(card, from) {
      const cw = this.cw,
        ch = this.ch;
      for (const p of this.piles) {
        if (p === from) continue;
        const r = this.pileRect(p);
        const ox = Math.min(card.x + cw, r.x + r.w) - Math.max(card.x, r.x);
        const oy = Math.min(card.y + ch, r.y + r.h) - Math.max(card.y, r.y);
        if (ox > cw * 0.4 && oy > ch * 0.4) return true;
      }
      return false;
    }

    findDrop(cards, from) {
      const cw = this.cw,
        ch = this.ch;
      const c0 = cards[0];
      let best = null,
        ba = cw * ch * 0.12;
      for (const q of this.piles) {
        if (q === from || !this.game.canDrop(cards, from, q)) continue;
        const r = this.pileRect(q);
        const ox = Math.min(c0.x + cw, r.x + r.w) - Math.max(c0.x, r.x);
        const oy = Math.min(c0.y + ch, r.y + r.h) - Math.max(c0.y, r.y);
        if (ox <= 0 || oy <= 0) continue;
        const a = ox * oy;
        if (a > ba) {
          ba = a;
          best = q;
        }
      }
      return best;
    }
  }

  App.Table = Table;
  App.Game = Game;
  App.VW = VW;
  App.VH = VH;
})();
