// REVERB — WebAudio synth: procedural music + SFX. No audio files.
(function (RV) {
  "use strict";

  function AudioEngine() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.started = false;
    this._seqTimer = null;
    this._track = null;
  }

  AudioEngine.prototype = {
    // Must be triggered from a user gesture.
    ensure() {
      if (this.started) {
        if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
        return true;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.34;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this.started = true;
      return true;
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.8;
    },

    // ---- generic tone helper ----
    tone(opts) {
      if (!this.started || !this.ctx) return;
      const t0 = this.ctx.currentTime + (opts.delay || 0);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = opts.type || "sine";
      osc.frequency.setValueAtTime(opts.f0, t0);
      if (opts.f1 != null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f1), t0 + (opts.slide || opts.dur));
      }
      const vol = opts.vol == null ? 0.25 : opts.vol;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack || 0.008));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
      let node = osc;
      if (opts.filter) {
        const f = this.ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = opts.filter;
        node.connect(f); node = f;
      }
      node.connect(g);
      g.connect(opts.bus === "music" ? this.musicGain : this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + opts.dur + 0.05);
    },

    noise(opts) {
      if (!this.started || !this.ctx) return;
      const t0 = this.ctx.currentTime + (opts.delay || 0);
      const dur = opts.dur || 0.2;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = opts.hp ? "highpass" : "lowpass";
      f.frequency.value = opts.freq || 900;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(opts.vol == null ? 0.2 : opts.vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t0);
    },

    // ---- SFX ----
    sfx(name) {
      if (!this.started) return;
      switch (name) {
        case "jump":
          this.tone({ type: "triangle", f0: 300, f1: 560, dur: 0.12, vol: 0.16 });
          break;
        case "land":
          this.tone({ type: "sine", f0: 180, f1: 90, dur: 0.09, vol: 0.14 });
          break;
        case "dash":
          this.noise({ dur: 0.16, freq: 1800, hp: true, vol: 0.16 });
          this.tone({ type: "sawtooth", f0: 220, f1: 660, dur: 0.14, vol: 0.07, filter: 1200 });
          break;
        case "shout":
          this.tone({ type: "sine", f0: 520, f1: 160, dur: 0.5, vol: 0.2 });
          this.tone({ type: "sine", f0: 780, f1: 240, dur: 0.45, vol: 0.09, delay: 0.02 });
          break;
        case "reveal": // soft tick when a hidden hazard is exposed near player
          this.tone({ type: "square", f0: 1400, f1: 900, dur: 0.03, vol: 0.02 });
          break;
        case "pickup":
          this.tone({ type: "sine", f0: 880, dur: 0.09, vol: 0.14 });
          this.tone({ type: "sine", f0: 1320, dur: 0.12, vol: 0.12, delay: 0.07 });
          break;
        case "spring":
          this.tone({ type: "square", f0: 260, f1: 900, dur: 0.22, vol: 0.12, filter: 2000 });
          break;
        case "crumble":
          this.noise({ dur: 0.25, freq: 500, vol: 0.18 });
          break;
        case "stomp":
          this.tone({ type: "square", f0: 500, f1: 120, dur: 0.16, vol: 0.16 });
          this.noise({ dur: 0.12, freq: 1200, vol: 0.1 });
          break;
        case "hurt":
          this.tone({ type: "sawtooth", f0: 320, f1: 70, dur: 0.35, vol: 0.22, filter: 900 });
          this.noise({ dur: 0.2, freq: 400, vol: 0.16 });
          break;
        case "death":
          this.tone({ type: "sawtooth", f0: 400, f1: 40, dur: 0.8, vol: 0.24, filter: 700 });
          break;
        case "gate":
          [523, 659, 784, 1047].forEach((f, i) =>
            this.tone({ type: "sine", f0: f, dur: 0.5, vol: 0.13, delay: i * 0.09 }));
          break;
        case "bell":
          this.tone({ type: "sine", f0: 1244, dur: 1.4, vol: 0.16 });
          this.tone({ type: "sine", f0: 1866, dur: 0.9, vol: 0.06 });
          this.tone({ type: "sine", f0: 2489, dur: 0.5, vol: 0.03 });
          break;
        case "ui":
          this.tone({ type: "square", f0: 660, dur: 0.05, vol: 0.07, filter: 3000 });
          break;
        case "checkpoint":
          this.tone({ type: "triangle", f0: 700, f1: 1100, dur: 0.25, vol: 0.14 });
          break;
      }
    },

    // ---- music: step sequencer, two moods ----
    // Gentle Dorian-ish arpeggio; "tense" track adds a low pulse for L5/L6.
    startMusic(track) {
      if (!this.started) return;
      this.stopMusic();
      this._track = track;
      const scale = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0]; // D major-ish pentatonic spread
      const arp = track === "tense"
        ? [0, 4, 7, 11, 7, 4, 2, 6]
        : [0, 4, 7, 12, 11, 7, 4, 2];
      const bass = track === "tense" ? [0, 0, 5, 3] : [0, 0, 5, 3];
      let step = 0;
      const bpm = track === "tense" ? 104 : 84;
      const beat = 60 / bpm / 2; // eighth notes
      const tick = () => {
        if (this._track == null) return;
        const s = step % 8;
        const idx = arp[s] % scale.length;
        const oct = arp[s] >= scale.length ? 2 : 1;
        const f = scale[idx] * oct;
        this.tone({
          type: track === "tense" ? "triangle" : "sine",
          f0: f, dur: beat * 2.4, vol: 0.085, bus: "music", attack: 0.02,
        });
        if (s % 4 === 0) {
          const bf = scale[bass[(step >> 2) % 4]] * 0.5;
          this.tone({ type: "sine", f0: bf, dur: beat * 3.4, vol: 0.13, bus: "music", attack: 0.03 });
        }
        if (track === "tense" && s % 2 === 1) {
          this.noise({ dur: 0.03, freq: 6000, hp: true, vol: 0.02 });
        }
        step++;
      };
      tick();
      this._seqTimer = setInterval(tick, beat * 1000);
    },

    stopMusic() {
      this._track = null;
      if (this._seqTimer) { clearInterval(this._seqTimer); this._seqTimer = null; }
    },
  };

  RV.audio = new AudioEngine();
})(window.RV = window.RV || {});
