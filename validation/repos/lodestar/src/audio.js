/* LODESTAR — procedural audio.
 * Everything is synthesized with the Web Audio API: a small step-sequenced
 * music loop (bass + lead + pad) and one-shot SFX. No asset files, no network.
 */
window.LD = window.LD || {};

LD.Audio = (function () {
  const U = LD.U;

  let ctx = null;
  let master, musicGain, sfxGain;
  let musicOn = true;
  let sfxOn = true;

  // ---- music sequencer state ----
  let seq = null;          // { timer, step, nextTime, level }
  const LOOKAHEAD = 0.12;  // s
  const TICK = 25;         // ms

  // minor pentatonic scale degrees (semitones from root)
  const PENTA = [0, 3, 5, 7, 10, 12, 15];
  // per-level root note (Hz) + tempo — gives each level its own mood
  const LEVELS = [
    { root: 110.0, bpm: 96 },   // A2  — calm
    { root: 123.47, bpm: 100 }, // Bb2 — curious
    { root: 98.0, bpm: 104 },   // G2  — tense
    { root: 116.54, bpm: 108 }, // A#2 — driving
    { root: 130.81, bpm: 112 }, // C3  — bright
    { root: 146.83, bpm: 118 }, // D3  — finale
  ];

  function noteHz(root, semis, oct) {
    return root * Math.pow(2, semis / 12) * (oct || 1);
  }

  // ------------------------------------------------------------------
  //  setup
  // ------------------------------------------------------------------
  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.5;
    musicGain.connect(master);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.8;
    sfxGain.connect(master);
    return true;
  }

  function resume() {
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  // ------------------------------------------------------------------
  //  low-level voice helpers
  // ------------------------------------------------------------------
  function env(gainNode, t0, a, d, peak, sustain, dur) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(peak, t0 + a);
    g.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t0 + a + d);
    g.setValueAtTime(Math.max(0.0001, sustain), t0 + dur - 0.02);
    g.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  function tone({ freq, type = "sine", t0, dur, peak = 0.3, sustain = 0.0,
                 dest = musicGain, slideTo = null, detune = 0 }) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    o.detune.value = detune;
    o.connect(g);
    g.connect(dest);
    env(g, t0, 0.008, dur * 0.4, peak, sustain, dur);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noiseBurst({ t0, dur = 0.2, peak = 0.3, hp = 800, lp = 6000, dest = sfxGain }) {
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hpF = ctx.createBiquadFilter();
    hpF.type = "highpass"; hpF.frequency.value = hp;
    const lpF = ctx.createBiquadFilter();
    lpF.type = "lowpass"; lpF.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.value = peak;
    src.connect(hpF); hpF.connect(lpF); lpF.connect(g); g.connect(dest);
    src.start(t0);
  }

  // ------------------------------------------------------------------
  //  SFX
  // ------------------------------------------------------------------
  const SFX = {
    jump() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone({ freq: 320, slideTo: 620, type: "square", t0: t, dur: 0.14, peak: 0.18, dest: sfxGain });
    },
    flip() {
      if (!ctx) return;
      const t = ctx.currentTime;
      // a magnetic "thunk" + rising shimmer
      tone({ freq: 140, slideTo: 90, type: "sine", t0: t, dur: 0.16, peak: 0.5, dest: sfxGain });
      tone({ freq: 500, slideTo: 1400, type: "triangle", t0: t + 0.02, dur: 0.22, peak: 0.16, dest: sfxGain });
      noiseBurst({ t0: t, dur: 0.12, peak: 0.12, hp: 1200, lp: 5000 });
    },
    pickup() {
      if (!ctx) return;
      const t = ctx.currentTime;
      // quick rising sparkle
      [0, 4, 7, 12].forEach((s, i) => {
        tone({ freq: noteHz(440, s, 1), type: "triangle", t0: t + i * 0.045, dur: 0.16, peak: 0.16, dest: sfxGain });
      });
    },
    gate() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone({ freq: 220, slideTo: 440, type: "sawtooth", t0: t, dur: 0.3, peak: 0.14, dest: sfxGain });
      tone({ freq: 660, type: "sine", t0: t + 0.1, dur: 0.25, peak: 0.12, dest: sfxGain });
    },
    stomp() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone({ freq: 200, slideTo: 70, type: "square", t0: t, dur: 0.16, peak: 0.3, dest: sfxGain });
      noiseBurst({ t0: t, dur: 0.1, peak: 0.2, hp: 300, lp: 2000 });
    },
    hurt() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone({ freq: 300, slideTo: 120, type: "sawtooth", t0: t, dur: 0.25, peak: 0.3, dest: sfxGain });
      noiseBurst({ t0: t, dur: 0.18, peak: 0.25, hp: 200, lp: 1500 });
    },
    death() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone({ freq: 400, slideTo: 60, type: "sawtooth", t0: t, dur: 0.5, peak: 0.35, dest: sfxGain });
      noiseBurst({ t0: t, dur: 0.4, peak: 0.3, hp: 100, lp: 1200 });
    },
    checkpoint() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [0, 7, 12].forEach((s, i) => {
        tone({ freq: noteHz(523.25, s, 1), type: "sine", t0: t + i * 0.08, dur: 0.3, peak: 0.18, dest: sfxGain });
      });
    },
    win() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [0, 4, 7, 12, 16].forEach((s, i) => {
        tone({ freq: noteHz(523.25, s, 1), type: "triangle", t0: t + i * 0.1, dur: 0.4, peak: 0.2, dest: sfxGain });
      });
      tone({ freq: noteHz(523.25, 12, 2), type: "sine", t0: t + 0.5, dur: 0.6, peak: 0.15, dest: sfxGain });
    },
    ui() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone({ freq: 660, type: "square", t0: t, dur: 0.06, peak: 0.1, dest: sfxGain });
    },
    confirm() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone({ freq: 520, slideTo: 780, type: "square", t0: t, dur: 0.12, peak: 0.14, dest: sfxGain });
    },
  };

  function play(name, opts) {
    if (!sfxOn) return;
    if (!ensure() || !ctx) return;
    resume();
    if (SFX[name]) SFX[name](opts);
  }

  // ------------------------------------------------------------------
  //  music sequencer
  // ------------------------------------------------------------------
  // 16-step patterns. Bass plays root/fifth; lead plays a pentatonic motif;
  // pad sustains a chord. Deterministic per level.
  function buildPattern(levelIdx) {
    const L = LEVELS[levelIdx % LEVELS.length];
    const root = L.root;
    // bass: root, root, fifth, root (per 4 steps)
    const bass = [0, 0, 7, 0, 0, 0, 7, 0, 0, 0, 7, 0, 12, 0, 7, 0];
    // lead motif (pentatonic degrees, -1 = rest)
    const lead = [0, -1, 3, -1, 5, -1, 3, 7, 10, -1, 7, -1, 5, 3, 0, -1];
    // pad chord (semitones)
    const pad = [0, 3, 7];
    return { root, bpm: L.bpm, bass, lead, pad };
  }

  function scheduleStep(step, t, pat) {
    const stepDur = 60 / pat.bpm / 2; // 8th notes
    // bass
    const b = pat.bass[step % 16];
    if (b >= 0) {
      tone({ freq: noteHz(pat.root, b, 0.5), type: "triangle", t0: t, dur: stepDur * 0.9, peak: 0.22, sustain: 0.05 });
    }
    // lead (every other step for breathing room)
    const l = pat.lead[step % 16];
    if (l >= 0 && step % 2 === 0) {
      tone({ freq: noteHz(pat.root, l, 2), type: "square", t0: t, dur: stepDur * 0.8, peak: 0.07, sustain: 0.02 });
    }
    // pad chord at bar start
    if (step % 8 === 0) {
      pat.pad.forEach(s => {
        tone({ freq: noteHz(pat.root, s, 1), type: "sine", t0: t, dur: stepDur * 7.5, peak: 0.05, sustain: 0.04 });
      });
    }
  }

  function startMusic(levelIdx) {
    if (!ensure() || !ctx) return;
    resume();
    stopMusic();
    const pat = buildPattern(levelIdx);
    const stepDur = 60 / pat.bpm / 2;
    seq = {
      pat, step: 0, nextTime: ctx.currentTime + 0.1, stepDur,
      timer: setInterval(() => {
        if (!seq) return;
        while (seq.nextTime < ctx.currentTime + LOOKAHEAD) {
          scheduleStep(seq.step, seq.nextTime, seq.pat);
          seq.nextTime += seq.stepDur;
          seq.step++;
        }
      }, TICK),
    };
  }

  function stopMusic() {
    if (seq) { clearInterval(seq.timer); seq = null; }
  }

  // ------------------------------------------------------------------
  //  public API
  // ------------------------------------------------------------------
  return {
    init() { ensure(); resume(); },
    resume,
    play,
    startMusic,
    stopMusic,
    setMusic(on) { musicOn = on; if (!on) stopMusic(); },
    setSfx(on) { sfxOn = on; },
    get musicOn() { return musicOn; },
    get sfxOn() { return sfxOn; },
    get ready() { return !!ctx; },
  };
})();
