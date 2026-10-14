'use strict';
/* Shared helpers, persistent settings and statistics. */
(function () {
  const App = (window.App = {});

  App.$ = (s, r = document) => r.querySelector(s);
  App.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  App.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  App.lerp = (a, b, t) => a + (b - a) * t;

  /* Small, fast, seedable PRNG (mulberry32). */
  App.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  App.shuffle = function (arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  };
  App.newSeed = () => (Math.random() * 4294967296) >>> 0;

  const KEY = 'solitaire5in1.v1';
  App.defaults = {
    music: 0.5,
    sfx: 0.8,
    bg: 'aurora',
    deck: 1,
    res: 'native', // native | 1080 | 1440 | 2160
    fps: 'max', // max | 30 | 60 | 120
    particles: true,
    showFps: false,
    klondike: { draw: 3, timed: false, autoplay: true },
    spider: { suits: 1 },
    freecell: { automove: true },
    golf: { loop: false },
    gaps: { shuffle: true },
  };
  App.GAME_IDS = ['klondike', 'spider', 'freecell', 'golf', 'gaps'];

  function emptyStats() {
    const s = {};
    App.GAME_IDS.forEach((g) => {
      s[g] = { played: 0, won: 0, best: null, bestTime: null, streak: 0, bestStreak: 0, totalTime: 0 };
    });
    return s;
  }
  function merge(dst, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
        dst[k] = merge(dst[k] && typeof dst[k] === 'object' ? dst[k] : {}, src[k]);
      } else dst[k] = src[k];
    }
    return dst;
  }

  App.settings = JSON.parse(JSON.stringify(App.defaults));
  App.stats = emptyStats();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) {
      if (raw.settings) merge(App.settings, raw.settings);
      if (raw.stats) merge(App.stats, raw.stats);
    }
  } catch (e) {
    /* storage unavailable: run with defaults */
  }
  App.save = function () {
    try {
      localStorage.setItem(KEY, JSON.stringify({ settings: App.settings, stats: App.stats }));
    } catch (e) {}
  };
  App.eraseStats = function () {
    App.stats = emptyStats();
    App.save();
  };
  App.eraseAll = function () {
    App.settings = JSON.parse(JSON.stringify(App.defaults));
    App.stats = emptyStats();
    App.save();
  };
  App.fmtTime = function (s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  };
})();
