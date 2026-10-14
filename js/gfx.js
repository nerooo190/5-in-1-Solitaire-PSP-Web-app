'use strict';
/* Procedural graphics: card faces/backs, table slots, backgrounds, ornament, fireflies.
   Everything is vector-drawn into offscreen canvases at the exact output resolution,
   so cards stay razor sharp at 4K. */
(function () {
  const G = (App.gfx = {});
  const FONT = '"Myriad Pro","Segoe UI","Helvetica Neue",Arial,sans-serif';
  const PAD = 10; // virtual px of shadow room around every sprite
  G.PAD = PAD;
  G.RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  // suit index: 0 spades, 1 hearts, 2 clubs, 3 diamonds
  G.SUIT_COLOR = ['#15151f', '#d3202f', '#15151f', '#d3202f'];

  const PATHS = {
    heart:
      'M0,0.5 C-0.15,0.38 -0.5,0.12 -0.5,-0.16 C-0.5,-0.36 -0.36,-0.5 -0.2,-0.5 C-0.09,-0.5 -0.02,-0.44 0,-0.34 C0.02,-0.44 0.09,-0.5 0.2,-0.5 C0.36,-0.5 0.5,-0.36 0.5,-0.16 C0.5,0.12 0.15,0.38 0,0.5Z',
    spade:
      'M0,-0.5 C0.12,-0.36 0.5,-0.12 0.5,0.12 C0.5,0.32 0.36,0.42 0.22,0.42 C0.1,0.42 0.03,0.36 0,0.28 L0.14,0.5 L-0.14,0.5 L0,0.28 C-0.03,0.36 -0.1,0.42 -0.22,0.42 C-0.36,0.42 -0.5,0.32 -0.5,0.12 C-0.5,-0.12 -0.12,-0.36 0,-0.5Z',
    diamond:
      'M0,-0.5 C0.1,-0.25 0.3,-0.1 0.42,0 C0.3,0.1 0.1,0.25 0,0.5 C-0.1,0.25 -0.3,0.1 -0.42,0 C-0.3,-0.1 -0.1,-0.25 0,-0.5Z',
    club:
      'M0.24,-0.26 a0.24,0.24 0 1 0 -0.48,0 a0.24,0.24 0 1 0 0.48,0Z M0.5,0.1 a0.24,0.24 0 1 0 -0.48,0 a0.24,0.24 0 1 0 0.48,0Z M-0.02,0.1 a0.24,0.24 0 1 0 -0.48,0 a0.24,0.24 0 1 0 0.48,0Z M0,-0.05 L-0.14,0.5 L0.14,0.5Z M-0.2,-0.1 v0.3 h0.4 v-0.3Z',
  };
  G.SUIT_D = [PATHS.spade, PATHS.heart, PATHS.club, PATHS.diamond];
  const SUIT_P2D = G.SUIT_D.map((d) => new Path2D(d));

  function suit(ctx, s, x, y, size, color, flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, flip ? -size : size);
    ctx.fillStyle = color;
    ctx.fill(SUIT_P2D[s]);
    ctx.restore();
  }
  G.drawSuit = suit;

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /* ---------- sprite cache (invalidated when size/scale/deck change) ---------- */
  let sig = '';
  let faces = new Map();
  let backs = new Map();
  let slots = new Map();
  function checkSig(cw, ch, S) {
    const s = cw + 'x' + ch + '@' + S.toFixed(4);
    if (s !== sig) {
      sig = s;
      faces = new Map();
      backs = new Map();
      slots = new Map();
    }
  }

  function cardBase(ctx, cw, ch, fill, lifted) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.38)';
    ctx.shadowBlur = lifted ? 14 : 7;
    ctx.shadowOffsetY = lifted ? 6 : 3;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(0, 0, cw, ch, cw * 0.065);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(0.6, 0.6, cw - 1.2, ch - 1.2, cw * 0.065);
    ctx.stroke();
  }

  const PIPS = {
    1: [[0.5, 0.5]],
    2: [[0.5, 0], [0.5, 1]],
    3: [[0.5, 0], [0.5, 0.5], [0.5, 1]],
    4: [[0, 0], [1, 0], [0, 1], [1, 1]],
    5: [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
    6: [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
    7: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
    8: [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
    9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
    10: [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]],
  };

  function drawFace(ctx, s, rank, cw, ch) {
    const col = G.SUIT_COLOR[s];
    const grad = ctx.createLinearGradient(0, 0, cw * 0.3, ch);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#eceef4');
    cardBase(ctx, cw, ch, grad, false);

    const label = G.RANKS[rank - 1];
    const fs = cw * (label.length > 1 ? 0.2 : 0.235);
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + fs + 'px ' + FONT;
    const ix = cw * 0.15;
    const draw = (flip) => {
      ctx.save();
      if (flip) {
        ctx.translate(cw, ch);
        ctx.rotate(Math.PI);
      }
      ctx.fillStyle = col;
      ctx.font = '700 ' + fs + 'px ' + FONT;
      ctx.fillText(label, ix, ch * 0.085);
      suit(ctx, s, ix, ch * 0.185, cw * 0.15, col, false);
      ctx.restore();
    };
    draw(false);
    draw(true);

    const x0 = cw * 0.345,
      x1 = cw * 0.675,
      y0 = ch * 0.17,
      y1 = ch * 0.83;
    if (rank === 1) {
      suit(ctx, s, cw * 0.5, ch * 0.5, cw * 0.46, col, false);
      // soft ring around the ace
      ctx.strokeStyle = 'rgba(0,0,0,0.07)';
      ctx.lineWidth = cw * 0.012;
      ctx.beginPath();
      ctx.arc(cw * 0.5, ch * 0.5, cw * 0.36, 0, Math.PI * 2);
      ctx.stroke();
    } else if (rank <= 10) {
      const ps = cw * (rank >= 9 ? 0.19 : 0.22);
      PIPS[rank].forEach(([px, py]) => {
        const x = x0 + (x1 - x0) * px;
        const y = y0 + (y1 - y0) * py;
        suit(ctx, s, x, y, ps, col, py > 0.5);
      });
    } else {
      // court cards: framed panel, big letter, suit at both ends
      const fx = cw * 0.25,
        fy = ch * 0.13,
        fw = cw * 0.5,
        fh = ch * 0.74;
      const pg = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
      pg.addColorStop(0, s % 2 ? '#fbe3e6' : '#dfe3f3');
      pg.addColorStop(1, s % 2 ? '#f3c6cc' : '#c3cbe6');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.roundRect(fx, fy, fw, fh, cw * 0.04);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = cw * 0.014;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(fx, fy + fh / 2);
      ctx.lineTo(fx + fw, fy + fh / 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.stroke();
      suit(ctx, s, cw * 0.5, fy + fh * 0.17, cw * 0.17, col, false);
      suit(ctx, s, cw * 0.5, fy + fh * 0.83, cw * 0.17, col, true);
      ctx.fillStyle = col;
      ctx.font = '800 ' + cw * 0.42 + 'px Georgia,"Times New Roman",serif';
      ctx.fillText(label, cw * 0.5, ch * 0.5 + cw * 0.02);
      // crown / hat mark
      ctx.save();
      ctx.translate(cw * 0.5, ch * 0.5);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = cw * 0.012;
      ctx.beginPath();
      ctx.arc(0, 0, cw * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  const BACKS = [
    // [base1, base2, accent]
    ['#2f63d6', '#143483', 'rgba(255,255,255,0.28)'],
    ['#c4283a', '#7d1322', 'rgba(255,255,255,0.28)'],
    ['#1f9158', '#0d4f31', 'rgba(255,255,255,0.28)'],
    ['#7b3dc0', '#3e1a6e', 'rgba(255,255,255,0.28)'],
    ['#1b1b24', '#07070b', 'rgba(224,180,70,0.8)'],
    ['#14a3a8', '#0a5559', 'rgba(255,255,255,0.3)'],
    ['#e5812f', '#a24611', 'rgba(255,255,255,0.3)'],
  ];
  G.BACK_COUNT = BACKS.length;

  function drawBack(ctx, cw, ch, idx) {
    const [c1, c2, acc] = BACKS[idx % BACKS.length];
    cardBase(ctx, cw, ch, '#ffffff', false);
    const m = cw * 0.055;
    const x = m,
      y = m,
      w = cw - 2 * m,
      h = ch - 2 * m;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, cw * 0.035);
    ctx.clip();
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = acc;
    ctx.fillStyle = acc;
    ctx.lineWidth = Math.max(1, cw * 0.01);
    const st = cw * 0.1;
    switch (idx % BACKS.length) {
      case 0:
      case 4: {
        // diamond lattice
        for (let k = -ch; k < cw + ch; k += st) {
          ctx.beginPath();
          ctx.moveTo(x + k, y);
          ctx.lineTo(x + k + h, y + h);
          ctx.moveTo(x + k + h, y);
          ctx.lineTo(x + k, y + h);
          ctx.stroke();
        }
        break;
      }
      case 1: {
        // dots
        for (let yy = y + st / 2; yy < y + h; yy += st)
          for (let xx = x + st / 2 + (((yy - y) / st) % 2 ? st / 2 : 0); xx < x + w; xx += st) {
            ctx.beginPath();
            ctx.arc(xx, yy, cw * 0.022, 0, 7);
            ctx.fill();
          }
        break;
      }
      case 2: {
        // concentric rings
        ctx.translate(cw / 2, ch / 2);
        for (let r = cw * 0.06; r < ch; r += cw * 0.075) {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, 7);
          ctx.stroke();
        }
        break;
      }
      case 3: {
        // starburst
        ctx.translate(cw / 2, ch / 2);
        for (let a = 0; a < 48; a++) {
          ctx.rotate((Math.PI * 2) / 48);
          ctx.beginPath();
          ctx.moveTo(cw * 0.04, 0);
          ctx.lineTo(ch, 0);
          ctx.stroke();
        }
        break;
      }
      case 5: {
        // waves
        for (let yy = y; yy < y + h + st; yy += st * 0.7) {
          ctx.beginPath();
          for (let xx = x; xx <= x + w; xx += 3) {
            const v = yy + Math.sin((xx - x) / (cw * 0.1)) * cw * 0.03;
            if (xx === x) ctx.moveTo(xx, v);
            else ctx.lineTo(xx, v);
          }
          ctx.stroke();
        }
        break;
      }
      case 6: {
        // diagonal stripes
        ctx.lineWidth = cw * 0.045;
        for (let k = -h; k < w + h; k += st * 1.1) {
          ctx.beginPath();
          ctx.moveTo(x + k, y + h);
          ctx.lineTo(x + k + h, y);
          ctx.stroke();
        }
        break;
      }
    }
    ctx.restore();
    // medallion
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(0, 0, cw * 0.17, cw * 0.17, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = c2;
    ctx.beginPath();
    ctx.ellipse(0, 0, cw * 0.145, cw * 0.145, 0, 0, 7);
    ctx.fill();
    suit(ctx, (idx * 3 + 1) % 4, 0, 0, cw * 0.17, 'rgba(255,255,255,0.92)', false);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = Math.max(1, cw * 0.012);
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, w - 6, h - 6, cw * 0.03);
    ctx.stroke();
  }

  function spriteCanvas(cw, ch, S) {
    const c = mk((cw + 2 * PAD) * S, (ch + 2 * PAD) * S);
    const ctx = c.getContext('2d');
    ctx.scale(c.width / (cw + 2 * PAD), c.height / (ch + 2 * PAD));
    ctx.translate(PAD, PAD);
    return [c, ctx];
  }

  G.face = function (suitIdx, rank, cw, ch, S) {
    checkSig(cw, ch, S);
    const k = suitIdx * 13 + rank - 1;
    let c = faces.get(k);
    if (!c) {
      let ctx;
      [c, ctx] = spriteCanvas(cw, ch, S);
      drawFace(ctx, suitIdx, rank, cw, ch);
      faces.set(k, c);
    }
    return c;
  };
  G.back = function (deck, cw, ch, S) {
    checkSig(cw, ch, S);
    const k = deck + '';
    let c = backs.get(k);
    if (!c) {
      let ctx;
      [c, ctx] = spriteCanvas(cw, ch, S);
      drawBack(ctx, cw, ch, deck);
      backs.set(k, c);
    }
    return c;
  };
  G.slot = function (label, cw, ch, S) {
    checkSig(cw, ch, S);
    let c = slots.get(label);
    if (!c) {
      let ctx;
      [c, ctx] = spriteCanvas(cw, ch, S);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.roundRect(0, 0, cw, ch, cw * 0.065);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.lineWidth = Math.max(1.5, cw * 0.014);
      ctx.beginPath();
      ctx.roundRect(1, 1, cw - 2, ch - 2, cw * 0.065);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (label === 'R') {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = cw * 0.05;
        ctx.beginPath();
        ctx.arc(cw / 2, ch / 2, cw * 0.19, -0.5, Math.PI * 1.55);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cw / 2 + cw * 0.09, ch / 2 - cw * 0.3);
        ctx.lineTo(cw / 2 + cw * 0.27, ch / 2 - cw * 0.14);
        ctx.lineTo(cw / 2 + cw * 0.04, ch / 2 - cw * 0.12);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
      } else if (label === 'gap') {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.roundRect(0, 0, cw, ch, cw * 0.065);
        ctx.fill();
      } else if (label) {
        ctx.font = '700 ' + cw * 0.42 + 'px ' + FONT;
        ctx.fillText(label, cw / 2, ch / 2 + cw * 0.02);
      }
      slots.set(label, c);
    }
    return c;
  };

  /* ---------- backgrounds ---------- */
  G.BACKGROUNDS = {
    aurora: {
      name: 'Aurora',
      stops: [[0, '#a7b0ff'], [0.3, '#5b6dff'], [0.62, '#262d93'], [1, '#0d0e33']],
      blobs: [[0.2, 0.15, 0.4, '#ffffff', 0.18], [0.85, 0.5, 0.5, '#7f5bff', 0.25], [0.1, 0.9, 0.5, '#2a7bff', 0.2]],
    },
    edge: {
      name: 'Edge',
      stops: [[0, '#16424d'], [0.5, '#0c2530'], [1, '#050d14']],
      blobs: [[0.9, 0.1, 0.55, '#2ad4c8', 0.35], [0.1, 0.8, 0.45, '#1d6fa8', 0.3], [0.5, 0.5, 0.3, '#7cf5e3', 0.08]],
    },
    flow: {
      name: 'Flow',
      stops: [[0, '#8ff0b3'], [0.4, '#16a56b'], [0.75, '#0a5036'], [1, '#03221a']],
      blobs: [[0.8, 0.2, 0.5, '#e4ff9a', 0.3], [0.15, 0.7, 0.5, '#00d1a0', 0.25]],
    },
    mist: {
      name: 'Mist',
      stops: [[0, '#dbe3f0'], [0.45, '#8fa2c4'], [1, '#2d3d5c']],
      blobs: [[0.3, 0.2, 0.5, '#ffffff', 0.35], [0.8, 0.8, 0.5, '#4d6fb0', 0.3]],
    },
    radiance: {
      name: 'Radiance',
      stops: [[0, '#ffd88a'], [0.35, '#ff8a3d'], [0.7, '#8a2430'], [1, '#1b0a10']],
      blobs: [[0.5, 0.0, 0.7, '#fff2c4', 0.45], [0.1, 0.9, 0.4, '#ff3d6e', 0.25]],
    },
    surge: {
      name: 'Surge',
      stops: [[0, '#ff7ad9'], [0.35, '#8c2cff'], [0.7, '#2a0f6e'], [1, '#0d0524']],
      blobs: [[0.85, 0.15, 0.5, '#ffd0f5', 0.3], [0.1, 0.6, 0.5, '#3ad0ff', 0.2]],
    },
    viscosity: {
      name: 'Viscosity',
      stops: [[0, '#0f2a33'], [0.6, '#08161c'], [1, '#03080b']],
      blobs: [[0.25, 0.3, 0.35, '#18e0b0', 0.28], [0.75, 0.65, 0.4, '#2c7dff', 0.28], [0.55, 0.15, 0.25, '#b04dff', 0.22], [0.35, 0.85, 0.3, '#18e0b0', 0.18]],
    },
  };

  function bezier(p, t) {
    const u = 1 - t;
    return [
      u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
      u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1],
    ];
  }
  function swirl(ctx, segs, w, s, w0, w1) {
    // tapered brush stroke along chained cubic segments (coords normalised to canvas size)
    const N = 420;
    const total = segs.length * N;
    let i = 0;
    for (const seg of segs) {
      for (let k = 0; k < N; k++, i++) {
        const [x, y] = bezier(seg, k / N);
        const f = i / total;
        const r = (w0 + (w1 - w0) * Math.pow(f, 0.8)) * s;
        ctx.beginPath();
        ctx.arc(x * w, y * ctx.canvas.height, r, 0, 7);
        ctx.fill();
      }
    }
  }
  function ornament(ctx, w, h, alpha) {
    const s = h / 1080;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#05061a';
    swirl(ctx, [
      [[0.16, 0.33], [0.1, 0.18], [0.24, 0.0], [0.36, 0.2]],
      [[0.36, 0.2], [0.46, 0.46], [0.66, 0.38], [0.76, 0.18]],
      [[0.76, 0.18], [0.84, 0.04], [0.93, 0.07], [1.02, 0.1]],
    ], w, s, 10, 1.5);
    swirl(ctx, [[[0.28, 0.0], [0.3, 0.1], [0.42, 0.12], [0.44, 0.06]]], w, s, 4, 1);
    swirl(ctx, [[[0.5, 0.31], [0.5, 0.4], [0.42, 0.44], [0.39, 0.38]]], w, s, 5, 1.2);
    swirl(ctx, [[[0.7, 0.3], [0.74, 0.4], [0.8, 0.4], [0.82, 0.32]]], w, s, 4, 1);
    swirl(ctx, [[[0.9, 0.11], [0.93, 0.2], [0.99, 0.2], [0.99, 0.14]]], w, s, 3, 1);
    const glyphs = [[0.11, 0.3, 0, 46], [0.2, 0.08, 2, 30], [0.31, 0.09, 3, 24], [0.45, 0.34, 1, 40], [0.64, 0.14, 3, 34], [0.58, 0.31, 2, 48], [0.88, 0.1, 1, 68], [0.72, 0.03, 0, 24]];
    for (const [gx, gy, gs, gz] of glyphs) suit(ctx, gs, gx * w, gy * h, gz * s * 1.35, '#05061a', false);
    ctx.restore();
  }

  const bgCache = { key: '', canvas: null };
  G.background = function (name, w, h, mode) {
    const key = name + '|' + mode + '|' + w + 'x' + h;
    if (bgCache.key === key) return bgCache.canvas;
    const def = G.BACKGROUNDS[name] || G.BACKGROUNDS.aurora;
    const c = bgCache.canvas && bgCache.canvas.width === w && bgCache.canvas.height === h ? bgCache.canvas : mk(w, h);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, w * 0.15, h);
    def.stops.forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (const [bx, by, br, col, a] of def.blobs) {
      const rg = ctx.createRadialGradient(bx * w, by * h, 0, bx * w, by * h, br * Math.max(w, h));
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a;
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
    // vignette
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,10,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ornament(ctx, w, h, mode === 'menu' ? 0.92 : 0.32);
    bgCache.key = key;
    bgCache.canvas = c;
    return c;
  };

  /* soft glow used by fireflies */
  G.glow = (function () {
    const c = mk(64, 64);
    const ctx = c.getContext('2d');
    const rg = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,220,1)');
    rg.addColorStop(0.25, 'rgba(235,255,150,0.55)');
    rg.addColorStop(1, 'rgba(180,255,120,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 64, 64);
    return c;
  })();

  /* tiny preview of a card back for the options screen */
  G.backThumb = function (idx, w) {
    const h = Math.round((w * 7) / 5);
    const c = mk(w * 2 + 2 * PAD * 2, h * 2 + 2 * PAD * 2);
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    ctx.translate(PAD, PAD);
    drawBack(ctx, w, h, idx);
    return c;
  };
  G.faceThumb = function (s, rank, w) {
    const h = Math.round((w * 7) / 5);
    const c = mk(w * 2 + 2 * PAD * 2, h * 2 + 2 * PAD * 2);
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    ctx.translate(PAD, PAD);
    drawFace(ctx, s, rank, w, h);
    return c;
  };
  G.bgThumb = function (name, w, h) {
    const c = mk(w, h);
    const ctx = c.getContext('2d');
    const def = G.BACKGROUNDS[name];
    const g = ctx.createLinearGradient(0, 0, w * 0.15, h);
    def.stops.forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (const [bx, by, br, col, a] of def.blobs) {
      const rg = ctx.createRadialGradient(bx * w, by * h, 0, bx * w, by * h, br * Math.max(w, h));
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a;
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
    return c;
  };
})();
