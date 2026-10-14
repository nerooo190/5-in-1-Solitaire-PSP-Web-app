'use strict';
/* Menus, options, statistics, tutorial, HUD and dialogs (DOM overlay on top of the canvas table). */
(function () {
  const { $, $$ } = App;
  const UI = (App.ui = {});
  let table;
  let current = 'title';
  let history = [];
  let navIdx = -1;

  const SUIT_COLORS = ['#15151f', '#d3202f', '#15151f', '#d3202f'];
  const suitSVG = (i, color, cls) =>
    `<svg class="${cls || ''}" viewBox="-0.6 -0.6 1.2 1.2" aria-hidden="true"><path d="${App.gfx.SUIT_D[i]}" fill="${color || SUIT_COLORS[i]}"/></svg>`;
  const gearSVG = (cls) => {
    let teeth = '';
    for (let i = 0; i < 8; i++) teeth += `<rect x="-0.07" y="-0.5" width="0.14" height="0.2" rx="0.03" transform="rotate(${i * 45})" fill="#2536b8"/>`;
    return `<svg class="${cls}" viewBox="-0.6 -0.6 1.2 1.2"><circle r="0.28" fill="none" stroke="#2536b8" stroke-width="0.14"/>${teeth}<circle r="0.09" fill="#2536b8"/></svg>`;
  };

  const META = {
    klondike: {
      name: 'Klondike',
      sub: 'The classic',
      suit: 0,
      desc: 'The classic solitaire. Build four foundations from Ace to King by suit, working from seven tableau columns and a draw pile.',
      opts: [
        { key: 'draw', label: 'Draw cards', sub: 'Cards turned from the stock', choices: [[1, '1'], [3, '3']] },
        { key: 'timed', label: 'Timed game', sub: 'Score drops over time, bonus for speed', choices: [[false, 'Off'], [true, 'On']] },
        { key: 'autoplay', label: 'Autoplay', sub: 'Finish automatically once solved', choices: [[false, 'Off'], [true, 'On']] },
      ],
      best: 'Best score',
      tut: `<h3>Goal</h3><p>Move all 52 cards to the four foundation piles, Ace up to King, one suit per pile.</p>
<h3>Rules</h3><ul><li>Tableau: build down in alternating colours (red 6 on black 7). Any face-up run can be moved together.</li>
<li>Only a King (or a run starting with a King) can fill an empty column.</li>
<li>Click the stock to turn over 1 or 3 cards. Click the empty stock to recycle the waste.</li>
<li>Scoring: waste&#8594;tableau +5, any card to a foundation +10, turning a card +5, foundation&#8594;tableau &#8722;15.</li></ul>
<h3>Controls</h3><ul><li>Drag cards, or double-click / right-click to send a card to its best place.</li><li>U = undo &nbsp; H = hint &nbsp; P / Esc = pause</li></ul>`,
    },
    spider: {
      name: 'Spider',
      sub: '1 · 2 · 4 suits',
      suit: 2,
      desc: 'Two decks, ten columns. Assemble complete King-to-Ace runs of a single suit and they clear away. Choose one, two or four suits.',
      opts: [{ key: 'suits', label: 'Suits', sub: 'More suits, harder game', choices: [[1, '1'], [2, '2'], [4, '4']] }],
      best: 'Best score',
      tut: `<h3>Goal</h3><p>Remove all eight King-to-Ace runs of the same suit from the table.</p>
<h3>Rules</h3><ul><li>Build down by rank on any suit, but only same-suit runs can be moved together.</li>
<li>Click the stock to deal one card onto every column. Every column must have a card first.</li>
<li>A finished K&#8230;A run of one suit is removed automatically (+100). Each move costs 1 point.</li></ul>
<h3>Controls</h3><ul><li>Drag a run, or double-click for the best destination.</li><li>U = undo &nbsp; H = hint &nbsp; P / Esc = pause</li></ul>`,
    },
    freecell: {
      name: 'FreeCell',
      sub: 'Open information',
      suit: 1,
      desc: 'Every card is visible from the start. Use four free cells to untangle eight columns and send everything to the foundations.',
      opts: [{ key: 'automove', label: 'Auto-move safe cards', sub: 'Send obviously safe cards home', choices: [[false, 'Off'], [true, 'On']] }],
      best: 'Fewest moves',
      tut: `<h3>Goal</h3><p>Build all four foundations from Ace to King.</p>
<h3>Rules</h3><ul><li>Tableau builds down in alternating colours.</li><li>Four free cells each hold one card.</li>
<li>Move several cards at once if you have enough free cells and empty columns: (cells + 1) &times; 2<sup>empty columns</sup>.</li></ul>
<h3>Controls</h3><ul><li>Drag, or double-click to send a card to a foundation / column / free cell.</li><li>U = undo &nbsp; H = hint &nbsp; P / Esc = pause</li></ul>`,
    },
    golf: {
      name: 'Golf',
      sub: 'Clear 7 columns',
      suit: 3,
      desc: 'Seven columns of five cards. Play any exposed card one rank higher or lower than the waste card, and clear the whole table.',
      opts: [{ key: 'loop', label: 'Loop stacks', sub: 'Kings and Aces count as neighbours', choices: [[false, 'Off'], [true, 'On']] }],
      best: 'Fewest cards left',
      tut: `<h3>Goal</h3><p>Clear all 35 tableau cards onto the waste pile.</p>
<h3>Rules</h3><ul><li>Play the bottom card of any column if it is one rank above or below the top waste card (suit does not matter).</li>
<li>Click the stock to turn a new card onto the waste. There is no redeal.</li>
<li>With &quot;Loop stacks&quot; on, a King can go on an Ace and vice versa.</li></ul>
<h3>Controls</h3><ul><li>Click a column card to play it (or drag it onto the waste).</li><li>U = undo &nbsp; H = hint &nbsp; P / Esc = pause</li></ul>`,
    },
    gaps: {
      name: 'Gaps',
      sub: 'Order the rows',
      suit: 1,
      suit2: 0,
      desc: 'Aces are removed, leaving four gaps in 52 slots. Sort each row 2 to King of a single suit, moving cards into the gaps.',
      opts: [{ key: 'shuffle', label: 'Random shuffle', sub: 'Reshuffles deal the loose cards in random order', choices: [[false, 'Off'], [true, 'On']] }],
      best: 'Most cards in place',
      tut: `<h3>Goal</h3><p>Arrange every row as 2, 3, 4 &#8230; King of one suit, starting in the leftmost column.</p>
<h3>Rules</h3><ul><li>Move a card into a gap only if it is the next rank, same suit, of the card to the gap&#8217;s left. A gap in the first column takes any 2.</li>
<li>A gap after a King (or in the last column) is dead.</li>
<li>When you are stuck, Reshuffle gathers all cards that are not in a sorted run and deals them again. You have 2 reshuffles.</li></ul>
<h3>Controls</h3><ul><li>Drag a card into a gap, or double-click it.</li><li>R = reshuffle &nbsp; U = undo &nbsp; H = hint &nbsp; P / Esc = pause</li></ul>`,
    },
  };
  UI.META = META;

  /* ---------------- screens ---------------- */
  function el(id) {
    return $('#s-' + id);
  }
  UI.show = function (name, push) {
    if (push !== false && current !== name) history.push(current);
    $$('.screen').forEach((s) => s.classList.remove('on'));
    current = name;
    // HUD stays under overlays that belong to a running game
    if (['pause', 'result'].includes(name)) el('hud').classList.add('on');
    el(name).classList.add('on');
    navIdx = -1;
    $$('.nav').forEach((n) => n.classList.remove('nav'));
    const menuMode = ['title', 'menu', 'select', 'options', 'stats', 'tutorial'].includes(name);
    table.mode = menuMode ? 'menu' : 'game';
    table.bgMode = name === 'title' || name === 'menu' ? 'menu' : 'sub';
    table.dirty = true;
  };
  UI.back = function () {
    App.audio.play('back');
    const prev = history.pop() || 'menu';
    UI.show(prev, false);
    if (prev === 'menu') table.stop();
    if (prev === 'pause') table.mode = 'game';
  };

  UI.layout = function () {
    const v = table.view;
    const s = $('#stage').style;
    s.left = v.cssOx + 'px';
    s.top = v.cssOy + 'px';
    s.width = App.VW * v.cssS + 'px';
    s.height = App.VH * v.cssS + 'px';
    s.setProperty('--px', v.cssS + 'px');
    const perf = $('#perf').style;
    perf.right = '8px';
  };

  let toastT = 0;
  UI.toast = function (msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 2300);
  };

  /* ---------------- keyboard / focus navigation ---------------- */
  function navItems() {
    return $$('[data-nav]', el(current)).filter((n) => n.offsetParent !== null);
  }
  function setNav(i) {
    const items = navItems();
    if (!items.length) return;
    $$('.nav').forEach((n) => n.classList.remove('nav'));
    navIdx = (i + items.length) % items.length;
    items[navIdx].classList.add('nav');
    App.audio.play('over');
  }

  /* ---------------- title + menu ---------------- */
  function buildTitle() {
    $('#title-suits').innerHTML = [0, 1, 2, 3].map((i) => suitSVG(i, '#fff')).join('');
    $('#btn-start').addEventListener('click', () => {
      App.audio.init();
      App.audio.play('select');
      UI.show('menu');
    });
    el('title').addEventListener('pointerdown', (e) => {
      if (e.target.closest('#btn-start')) return;
      App.audio.init();
    });
  }

  function buildMenu() {
    const tiles = $('#tiles');
    const ids = [...App.GAME_IDS, 'options'];
    const n = ids.length;
    const w = 250,
      gap = 42;
    const total = n * w + (n - 1) * gap;
    const x0 = (1920 - total) / 2;
    ids.forEach((id, i) => {
      const m = id === 'options' ? { name: 'Options', sub: 'Sound · Video', suit: -1 } : META[id];
      const b = document.createElement('button');
      b.className = 'tile';
      b.dataset.nav = '';
      b.dataset.id = id;
      const mid = (n - 1) / 2;
      b.style.left = `calc(${x0 + i * (w + gap)} * var(--px))`;
      b.style.setProperty('--rot', ((i - mid) * 2.4).toFixed(2) + 'deg');
      b.style.setProperty('--lift', Math.pow(Math.abs(i - mid) / mid, 2) * 36);
      b.style.top = '0';
      b.style.transform = '';
      const icon = m.suit < 0 ? gearSVG('big') : suitSVG(m.suit, null, 'big');
      const corner = m.suit < 0 ? '' : suitSVG(m.suit2 != null ? m.suit2 : m.suit, null, 'corner');
      b.innerHTML = `${corner}${icon}<div class="name">${m.name}<small>${m.sub}</small></div>`;
      b.addEventListener('click', () => {
        App.audio.init();
        App.audio.play('select');
        if (id === 'options') openOptions();
        else openSelect(id);
      });
      b.addEventListener('mouseenter', () => App.audio.play('over'));
      tiles.appendChild(b);
    });
    $('#btn-stats').addEventListener('click', () => {
      App.audio.play('select');
      openStats();
    });
    $('#btn-fs').addEventListener('click', () => {
      App.audio.play('select');
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    });
  }

  /* ---------------- generic option rows ---------------- */
  function segRow(label, sub, choices, get, set) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="lbl">${label}${sub ? `<small>${sub}</small>` : ''}</div><div class="seg"></div>`;
    const seg = $('.seg', row);
    const paint = () => $$('button', seg).forEach((b, i) => b.classList.toggle('on', String(choices[i][0]) === String(get())));
    choices.forEach(([val, text]) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.addEventListener('click', () => {
        set(val);
        App.save();
        App.audio.play('select');
        paint();
      });
      seg.appendChild(b);
    });
    paint();
    return row;
  }
  function sliderRow(label, get, set) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="lbl">${label}</div><input class="range" type="range" min="0" max="100" step="1">`;
    const r = $('input', row);
    r.value = Math.round(get() * 100);
    r.addEventListener('input', () => {
      set(r.value / 100);
      App.audio.applyVolumes();
    });
    r.addEventListener('change', () => {
      App.save();
      App.audio.init();
      App.audio.play('select');
    });
    return row;
  }

  /* ---------------- game select ---------------- */
  let selId = null;
  function openSelect(id) {
    selId = id;
    const m = META[id];
    UI.show('select');
    $('#select-title').textContent = m.name;
    $('#select-desc').textContent = m.desc;
    $('#select-art').innerHTML = `<div class="tile">${suitSVG(m.suit2 != null ? m.suit2 : m.suit, null, 'corner')}${suitSVG(m.suit, null, 'big')}<div class="name">${m.name}<small>${m.sub}</small></div></div>`;
    const box = $('#select-opts');
    box.innerHTML = '';
    const o = App.settings[id];
    m.opts.forEach((d) => box.appendChild(segRow(d.label, d.sub, d.choices, () => o[d.key], (v) => (o[d.key] = v))));
    box.style.display = m.opts.length ? '' : 'none';
    const s = App.stats[id];
    const pct = s.played ? Math.round((s.won / s.played) * 100) : 0;
    $('#select-stats').innerHTML = `<span>Played <b>${s.played}</b></span><span>Won <b>${s.won}</b> (${pct}%)</span><span>${m.best} <b>${s.best == null ? '—' : s.best}</b></span><span>Best time <b>${s.bestTime == null ? '—' : App.fmtTime(s.bestTime)}</b></span><span>Streak <b>${s.streak}</b></span>`;
  }

  /* ---------------- options ---------------- */
  let optTab = 'audio';
  function openOptions() {
    UI.show('options');
    drawOptions();
  }
  function drawOptions() {
    const S = App.settings;
    const tabs = $('#opt-tabs');
    tabs.innerHTML = '';
    [['audio', 'Audio'], ['game', 'Game'], ['graphics', 'Graphics'], ['profile', 'Profile']].forEach(([id, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = id === optTab ? 'on' : '';
      b.addEventListener('click', () => {
        App.audio.play('select');
        optTab = id;
        drawOptions();
      });
      tabs.appendChild(b);
    });
    const body = $('#opt-body');
    body.innerHTML = '';
    if (optTab === 'audio') {
      body.appendChild(sliderRow('Music', () => S.music, (v) => (S.music = v)));
      body.appendChild(sliderRow('Sound effects', () => S.sfx, (v) => (S.sfx = v)));
    } else if (optTab === 'game') {
      const bgRow = document.createElement('div');
      bgRow.className = 'row';
      bgRow.innerHTML = '<div class="lbl">Background</div><div class="swatches"></div>';
      Object.keys(App.gfx.BACKGROUNDS).forEach((k) => {
        const b = document.createElement('button');
        b.className = 'swatch' + (S.bg === k ? ' on' : '');
        b.title = App.gfx.BACKGROUNDS[k].name;
        const c = App.gfx.bgThumb(k, 100, 62);
        b.appendChild(c);
        b.addEventListener('click', () => {
          S.bg = k;
          App.save();
          App.audio.play('select');
          table.dirty = true;
          $$('.swatch', bgRow).forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
        });
        $('.swatches', bgRow).appendChild(b);
      });
      body.appendChild(bgRow);
      const dkRow = document.createElement('div');
      dkRow.className = 'row';
      dkRow.innerHTML = '<div class="lbl">Card deck</div><div class="swatches"></div>';
      for (let i = 1; i <= App.gfx.BACK_COUNT; i++) {
        const b = document.createElement('button');
        b.className = 'swatch' + (S.deck === i ? ' on' : '');
        const c = App.gfx.backThumb(i - 1, 46);
        c.style.width = '56px';
        c.style.height = 'auto';
        b.appendChild(c);
        b.addEventListener('click', () => {
          S.deck = i;
          App.save();
          App.audio.play('select');
          table.dirty = true;
          $$('.swatch', dkRow).forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
        });
        $('.swatches', dkRow).appendChild(b);
      }
      body.appendChild(dkRow);
    } else if (optTab === 'graphics') {
      body.appendChild(
        segRow(
          'Render resolution',
          'Table is drawn at this height and scaled to the window. 4K = 3840×2160',
          [['native', 'Native'], ['1080', '1080p'], ['1440', '1440p'], ['2160', '4K']],
          () => S.res,
          (v) => {
            S.res = v;
            table.resize();
            UI.layout();
          }
        )
      );
      body.appendChild(
        segRow(
          'Frame rate limit',
          'Display rate follows your monitor (60 / 120 / 144 Hz …)',
          [['max', 'Display rate'], ['30', '30'], ['60', '60'], ['120', '120']],
          () => S.fps,
          (v) => (S.fps = v)
        )
      );
      body.appendChild(segRow('Ambient fireflies', 'Animated background particles', [[true, 'On'], [false, 'Off']], () => S.particles, (v) => {
        S.particles = v;
        table.dirty = true;
      }));
      body.appendChild(segRow('Performance overlay', 'Shows FPS, frame time, render cost and resolution (F)', [[false, 'Off'], [true, 'On']], () => S.showFps, (v) => {
        S.showFps = v;
        UI.applyPerf();
      }));
      const hz = document.createElement('div');
      hz.className = 'row';
      hz.innerHTML = `<div class="lbl">Detected display refresh<small>Measured from requestAnimationFrame</small></div><b>${App.perf && App.perf.hz ? App.perf.hz.toFixed(0) + ' Hz' : '…'}</b>`;
      body.appendChild(hz);
    } else {
      const mk = (label, sub, text, fn) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<div class="lbl">${label}<small>${sub}</small></div><button class="btn small">${text}</button>`;
        const b = $('button', row);
        let armed = 0;
        b.addEventListener('click', () => {
          if (!armed) {
            armed = setTimeout(() => {
              armed = 0;
              b.textContent = text;
            }, 3000);
            b.textContent = 'Click again to confirm';
            return;
          }
          clearTimeout(armed);
          armed = 0;
          b.textContent = text;
          fn();
          App.audio.play('select');
          UI.toast(label + ' — done');
        });
        return row;
      };
      body.appendChild(mk('Erase statistics', 'Resets played, won, streaks and records', 'Erase', () => App.eraseStats()));
      body.appendChild(
        mk('Erase everything', 'Statistics and all settings', 'Erase all', () => {
          App.eraseAll();
          table.resize();
          UI.layout();
          App.audio.applyVolumes();
          UI.applyPerf();
          drawOptions();
        })
      );
    }
  }

  /* ---------------- stats ---------------- */
  function openStats() {
    UI.show('stats');
    const rows = App.GAME_IDS.map((id) => {
      const s = App.stats[id];
      const m = META[id];
      const pct = s.played ? Math.round((s.won / s.played) * 100) + '%' : '—';
      return `<tr><td>${m.name}</td><td>${s.played}</td><td>${s.won}</td><td>${pct}</td><td>${s.best == null ? '—' : s.best}<br><small style="color:var(--ink-dim)">${m.best}</small></td><td>${s.bestTime == null ? '—' : App.fmtTime(s.bestTime)}</td><td>${s.streak} / ${s.bestStreak}</td><td>${App.fmtTime(s.totalTime)}</td></tr>`;
    }).join('');
    $('#stats-body').innerHTML = `<table class="st"><thead><tr><th>Game</th><th>Played</th><th>Won</th><th>Win rate</th><th>Best</th><th>Best time</th><th>Streak / best</th><th>Time played</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  /* ---------------- tutorial ---------------- */
  function openTutorial(id) {
    UI.show('tutorial');
    $('#tut-title').textContent = META[id].name + ' — How to play';
    $('#tut-body').innerHTML = META[id].tut;
  }

  /* ---------------- in-game ---------------- */
  let hudKey = '';
  function onHud(items) {
    const key = items.map((i) => i[0]).join('|');
    const box = $('#hud-stats');
    if (key !== hudKey) {
      hudKey = key;
      box.innerHTML = items.map(([l]) => `<div><span>${l}</span><b></b></div>`).join('');
    }
    const bs = $$('b', box);
    items.forEach(([, v], i) => {
      const s = String(v);
      if (bs[i].textContent !== s) bs[i].textContent = s;
    });
    // pulse reshuffle when the player is stuck-ish
    const extra = $('#btn-extra');
    if (table.gameId === 'gaps' && table.game) extra.disabled = !table.game.canReshuffle() || table.state !== 'playing';
  }

  UI.startGame = function (id, seed) {
    App.audio.init();
    const m = META[id];
    $('#hud-name').textContent = m.name;
    hudKey = '';
    const extra = $('#btn-extra');
    extra.classList.toggle('hidden', id !== 'gaps');
    table.paused = false;
    UI.show('hud', true);
    table.start(id, App.settings[id], seed);
  };

  function pause() {
    if (!table.game || table.state !== 'playing') return;
    table.paused = true;
    App.audio.play('select');
    UI.show('pause');
  }
  function resume() {
    table.paused = false;
    history = history.filter((h) => h !== 'pause');
    UI.show('hud', false);
    table.mode = 'game';
    table.dirty = true;
  }

  function onEnd(kind) {
    const rs = el('result');
    if (kind === 'resume') {
      if (current === 'result') {
        UI.show('hud', false);
        table.mode = 'game';
      }
      return;
    }
    const won = kind === 'won';
    $('#r-title').textContent = won ? 'You win!' : 'No more moves';
    const items = table.finalHud || table.game.hud(table);
    $('#r-stats').innerHTML = items.map(([l, v]) => `<div>${l}<b>${v}</b></div>`).join('');
    $('#r-undo').style.display = won ? 'none' : '';
    setTimeout(() => {
      if (table.state === 'won' || table.state === 'over') {
        UI.show('result', false);
        table.mode = 'game';
      }
    }, won ? 600 : 100);
    void rs;
  }

  function bindGame() {
    $('#btn-pause').addEventListener('click', pause);
    $('#btn-undo').addEventListener('click', () => table.undo());
    $('#btn-hint').addEventListener('click', () => table.showHint());
    $('#btn-extra').addEventListener('click', () => table.gameId === 'gaps' && table.game.reshuffle(table));
    $('#btn-new').addEventListener('click', () => {
      App.audio.play('select');
      UI.startGame(table.gameId);
    });
    $('#p-continue').addEventListener('click', () => {
      App.audio.play('select');
      resume();
    });
    $('#p-restart').addEventListener('click', () => {
      App.audio.play('select');
      const id = table.gameId;
      const seed = table.seed;
      UI.startGame(id, seed);
    });
    $('#p-new').addEventListener('click', () => {
      App.audio.play('select');
      UI.startGame(table.gameId);
    });
    $('#p-options').addEventListener('click', () => {
      App.audio.play('select');
      history.push('pause');
      UI.show('options', false);
      table.mode = 'game';
      drawOptions();
    });
    $('#p-quit').addEventListener('click', () => {
      App.audio.play('back');
      table.stop();
      history = [];
      UI.show('menu', false);
    });
    $('#r-again').addEventListener('click', () => {
      App.audio.play('select');
      UI.startGame(table.gameId);
    });
    $('#r-undo').addEventListener('click', () => table.undo());
    $('#r-quit').addEventListener('click', () => {
      App.audio.play('back');
      table.stop();
      history = [];
      UI.show('menu', false);
    });
  }

  UI.applyPerf = function () {
    $('#perf').classList.toggle('on', !!App.settings.showFps);
  };

  /* ---------------- init ---------------- */
  UI.init = function (t) {
    table = t;
    table.onHud = onHud;
    table.onEnd = onEnd;
    table.onToast = UI.toast;
    buildTitle();
    buildMenu();
    bindGame();
    $$('[data-back]').forEach((b) => b.addEventListener('click', () => UI.back()));
    $('#btn-newgame').addEventListener('click', () => {
      App.audio.play('select');
      history = ['menu'];
      UI.startGame(selId);
      history = ['menu'];
    });
    $('#btn-tutorial').addEventListener('click', () => {
      App.audio.play('select');
      openTutorial(selId);
    });
    UI.layout();
    UI.applyPerf();
    UI.show('title', false);

    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT' && e.key !== 'Enter' && e.key !== 'Escape') return;
      const k = e.key;
      if (current === 'title') {
        if (k === 'Enter' || k === ' ') {
          e.preventDefault();
          $('#btn-start').click();
        }
        return;
      }
      if (current === 'hud') {
        if (k === 'Escape' || k === 'p' || k === 'P') {
          e.preventDefault();
          pause();
        } else if (k === 'u' || k === 'U' || ((e.ctrlKey || e.metaKey) && k === 'z')) {
          e.preventDefault();
          table.undo();
        } else if (k === 'h' || k === 'H') table.showHint();
        else if (k === 'n' || k === 'N') $('#btn-new').click();
        else if ((k === 'r' || k === 'R') && table.gameId === 'gaps') table.game.reshuffle(table);
        else if (k === 'f' || k === 'F') {
          App.settings.showFps = !App.settings.showFps;
          App.save();
          UI.applyPerf();
        }
        return;
      }
      if (current === 'pause' && (k === 'Escape' || k === 'p' || k === 'P')) {
        e.preventDefault();
        resume();
        return;
      }
      if (k === 'Escape' && ['select', 'options', 'stats', 'tutorial'].includes(current)) {
        UI.back();
        return;
      }
      if (k === 'Escape' && current === 'menu') return;
      const items = navItems();
      if (!items.length) return;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'Tab') {
        e.preventDefault();
        setNav(navIdx + (e.shiftKey ? -1 : 1));
      } else if (k === 'ArrowLeft' || k === 'ArrowUp') {
        e.preventDefault();
        setNav(navIdx < 0 ? items.length - 1 : navIdx - 1);
      } else if (k === 'Enter' || k === ' ') {
        if (navIdx >= 0 && items[navIdx]) {
          e.preventDefault();
          items[navIdx].click();
        }
      }
    });
    window.addEventListener('mousemove', () => {
      if (navIdx >= 0) {
        $$('.nav').forEach((n) => n.classList.remove('nav'));
        navIdx = -1;
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && current === 'hud') pause();
    });
  };
})();
