'use strict';
/* Boot + the render loop. The loop runs on requestAnimationFrame so it automatically follows the
   display refresh rate (60/120/144 Hz …); an optional limiter caps it at 30/60/120. */
(function () {
  const canvas = document.getElementById('view');
  const table = (App.table = new App.Table(canvas));
  App.ui.init(table);

  const perf = (App.perf = { fps: 0, hz: 0, frameMs: 0, worstMs: 0, renderMs: 0 });
  const raw = []; // raw rAF intervals (for refresh-rate detection)
  const frames = []; // presented frame intervals
  let renderAcc = 0,
    renderN = 0;
  let last = 0,
    lastRaw = 0,
    lastOverlay = 0;

  let resizeT = 0;
  function onResize() {
    table.resize();
    App.ui.layout();
    // re-run once after the browser settles (fullscreen / DPR changes)
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      table.resize();
      App.ui.layout();
    }, 150);
  }
  window.addEventListener('resize', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', onResize);
  App.ui.layout();

  function median(a) {
    const s = a.slice().sort((x, y) => x - y);
    return s[s.length >> 1];
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (lastRaw) {
      raw.push(ts - lastRaw);
      if (raw.length > 90) raw.shift();
    }
    lastRaw = ts;

    const lim = App.settings.fps === 'max' ? 0 : +App.settings.fps;
    if (lim && ts - last < 1000 / lim - 2.5) return;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
    if (last) {
      frames.push(ts - last);
      if (frames.length > 240) frames.shift();
    }
    last = ts;

    table.update(dt);
    if (table.dirty) {
      const t0 = performance.now();
      table.render();
      table.dirty = false;
      renderAcc += performance.now() - t0;
      renderN++;
    }

    if (ts - lastOverlay > 500) {
      lastOverlay = ts;
      if (raw.length > 10) perf.hz = 1000 / median(raw);
      if (frames.length > 5) {
        let sum = 0,
          worst = 0;
        for (const f of frames) {
          sum += f;
          if (f > worst) worst = f;
        }
        perf.frameMs = sum / frames.length;
        perf.worstMs = worst;
        perf.fps = 1000 / perf.frameMs;
      }
      perf.renderMs = renderN ? renderAcc / renderN : 0;
      renderAcc = 0;
      renderN = 0;
      if (App.settings.showFps) {
        const v = table.view;
        document.getElementById('perf').textContent =
          `${perf.fps.toFixed(0)} FPS  (${perf.frameMs.toFixed(1)} ms, worst ${perf.worstMs.toFixed(1)})\n` +
          `render ${perf.renderMs.toFixed(2)} ms\n` +
          `canvas ${v.w}×${v.h}\n` +
          `display ~${perf.hz.toFixed(0)} Hz` +
          (App.settings.fps !== 'max' ? `  cap ${App.settings.fps}` : '');
      }
    }
  }
  requestAnimationFrame(frame);

  // test / debugging hook
  window.__app = App;
})();
