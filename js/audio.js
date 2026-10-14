'use strict';
/* Fully synthesised audio (no samples): sound effects and a calm generative music bed. */
(function () {
  const A = (App.audio = { ctx: null });
  let master, sfxG, musicG, musicSend, noiseBuf, reverb;
  let musicTimer = null;
  let nextTime = 0;
  let step = 0;

  A.init = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (A.ctx = new AC({ latencyHint: 'interactive' }));
    master = c.createGain();
    master.gain.value = 0.9;
    master.connect(c.destination);
    sfxG = c.createGain();
    sfxG.connect(master);
    musicG = c.createGain();
    musicG.connect(master);

    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Cheap generated impulse response for a soft room reverb.
    const len = Math.floor(c.sampleRate * 2.2);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const o = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) o[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    reverb = c.createConvolver();
    reverb.buffer = ir;
    musicSend = c.createGain();
    musicSend.gain.value = 0.55;
    musicSend.connect(reverb);
    reverb.connect(musicG);

    A.applyVolumes();
    startMusic();
  };

  A.applyVolumes = function () {
    if (!A.ctx) return;
    const s = App.settings;
    sfxG.gain.value = s.sfx * s.sfx;
    musicG.gain.value = s.music * s.music * 0.6;
  };

  function tone(freq, t0, dur, o = {}) {
    const c = A.ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t0 + dur);
    const peak = o.gain == null ? 0.3 : o.gain;
    const atk = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    let out = g;
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      g.connect(f);
      out = f;
    }
    out.connect(o.dest || sfxG);
    if (o.send) out.connect(o.send);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, o = {}) {
    const c = A.ctx;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 2000, t0);
    if (o.slide) f.frequency.exponentialRampToValueAtTime(o.slide, t0 + dur);
    f.Q.value = o.q || 0.9;
    const g = c.createGain();
    const peak = o.gain == null ? 0.4 : o.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(sfxG);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const SFX = {
    deal(t) {
      noise(t, 0.07, { freq: 3200, slide: 1400, q: 1.2, gain: 0.35 });
    },
    place(t) {
      noise(t, 0.05, { freq: 1800, q: 0.8, gain: 0.3 });
      tone(180, t, 0.07, { gain: 0.18, slide: 90 });
    },
    flip(t) {
      noise(t, 0.05, { freq: 5200, slide: 2600, q: 1.5, gain: 0.22 });
    },
    found(t) {
      noise(t, 0.05, { freq: 2200, q: 0.8, gain: 0.25 });
      tone(midi(81), t, 0.28, { gain: 0.16, type: 'triangle' });
      tone(midi(88), t + 0.05, 0.4, { gain: 0.12, type: 'triangle' });
    },
    wrong(t) {
      tone(150, t, 0.16, { type: 'square', gain: 0.1, lp: 700, slide: 110 });
    },
    undo(t) {
      noise(t, 0.28, { freq: 3800, slide: 500, q: 1.1, gain: 0.3 });
      tone(520, t, 0.22, { slide: 220, gain: 0.1, type: 'triangle' });
    },
    select(t) {
      tone(midi(84), t, 0.12, { gain: 0.16, type: 'triangle' });
      tone(midi(91), t + 0.05, 0.16, { gain: 0.1, type: 'triangle' });
    },
    over(t) {
      tone(midi(88), t, 0.05, { gain: 0.05, type: 'triangle' });
    },
    back(t) {
      tone(midi(79), t, 0.1, { gain: 0.15, type: 'triangle' });
      tone(midi(72), t + 0.06, 0.16, { gain: 0.12, type: 'triangle' });
    },
    reshuffle(t) {
      for (let i = 0; i < 14; i++) noise(t + i * 0.045, 0.06, { freq: 2600 + Math.random() * 2400, q: 1.1, gain: 0.25 });
    },
    win(t) {
      const notes = [60, 64, 67, 72, 76, 79, 84, 88];
      notes.forEach((n, i) => {
        tone(midi(n), t + i * 0.11, 0.9, { gain: 0.16, type: 'triangle' });
        tone(midi(n - 12), t + i * 0.11, 0.9, { gain: 0.06, type: 'sine' });
      });
      [72, 76, 79, 84].forEach((n) => tone(midi(n), t + 0.95, 1.6, { gain: 0.14, type: 'triangle' }));
    },
    over_game(t) {
      [69, 65, 62, 57].forEach((n, i) => tone(midi(n), t + i * 0.22, 0.7, { gain: 0.14, type: 'triangle', lp: 1800 }));
    },
  };

  A.play = function (name) {
    if (!A.ctx || A.ctx.state !== 'running') return;
    if (App.settings.sfx <= 0) return;
    const fn = SFX[name];
    if (fn) fn(A.ctx.currentTime + 0.005);
  };

  /* ---- generative music: Am / F / C / G pads with sparse pentatonic plucks ---- */
  const PROG = [
    [57, 60, 64],
    [53, 57, 60],
    [48, 52, 55],
    [55, 59, 62],
  ];
  const PENTA = [69, 72, 74, 76, 79, 81, 84];
  const EIGHTH = 60 / 76 / 2;

  function startMusic() {
    if (musicTimer) return;
    nextTime = A.ctx.currentTime + 0.2;
    musicTimer = setInterval(schedule, 120);
  }

  function schedule() {
    const c = A.ctx;
    if (!c || c.state !== 'running') {
      if (c) nextTime = Math.max(nextTime, c.currentTime + 0.1);
      return;
    }
    if (App.settings.music <= 0.001) {
      nextTime = Math.max(nextTime, c.currentTime + 0.1);
      return;
    }
    while (nextTime < c.currentTime + 0.6) {
      const bar = Math.floor(step / 8) % PROG.length;
      const beat = step % 8;
      if (beat === 0) {
        const barDur = EIGHTH * 8;
        PROG[bar].forEach((n) =>
          tone(midi(n), nextTime, barDur + 0.6, {
            type: 'triangle',
            gain: 0.07,
            attack: 0.7,
            lp: 1100,
            dest: musicG,
            send: musicSend,
          })
        );
        tone(midi(PROG[bar][0] - 12), nextTime, barDur, { gain: 0.16, attack: 0.05, dest: musicG, lp: 400 });
      }
      if (Math.random() < (beat % 2 === 0 ? 0.55 : 0.3)) {
        const n = PENTA[Math.floor(Math.random() * PENTA.length)];
        tone(midi(n), nextTime, 1.4, { gain: 0.1, type: 'sine', dest: musicG, send: musicSend, attack: 0.006 });
      }
      nextTime += EIGHTH;
      step++;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!A.ctx) return;
    if (document.hidden) A.ctx.suspend();
    else A.ctx.resume();
  });
})();
