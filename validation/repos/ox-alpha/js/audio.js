/* ============================================================
   ECHO PROTOCOL — audio.js
   Fully synthesized WebAudio: SFX + ambient generative music.
   No external assets. Context unlocks on first user input.
   ============================================================ */
"use strict";
(function () {

  class AudioSys {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.muted = false;
      this._musicTimer = null;
      this._nextNote = 0;
      this._step = 0;
      this._seed = 1234;
    }

    init() {
      if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        // gentle limiter-ish curve
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 6;
        this.master.connect(comp); comp.connect(this.ctx.destination);

        this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 1.0; this.sfxGain.connect(this.master);
        this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.34; this.musicGain.connect(this.master);

        if (this.muted) this.setMuted(true);
        this.startMusic();
      } catch (e) { this.ctx = null; }
    }

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.55;
    }

    /* ---------------- low-level voices ---------------- */
    _env(gainNode, t, a, peak, d, sustainLevel) {
      const g = gainNode.gain;
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(peak, t + a);
      g.exponentialRampToValueAtTime(Math.max(0.0001, sustainLevel ?? peak * 0.4), t + a + d);
    }

    tone({ freq = 440, endFreq = null, type = "square", vol = 0.2, dur = 0.15, attack = 0.005, delay = 0, dest = null, bend = "exp" }) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (endFreq) {
        if (bend === "exp") o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
        else o.frequency.linearRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
      }
      this._env(g, t0, attack, vol, dur, 0.0001);
      o.connect(g); g.connect(dest || this.sfxGain);
      o.start(t0); o.stop(t0 + dur + attack + 0.05);
    }

    noise({ vol = 0.25, dur = 0.2, delay = 0, f0 = 1200, f1 = null, q = 1, type = "bandpass", dest = null }) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime + delay;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const flt = this.ctx.createBiquadFilter();
      flt.type = type; flt.Q.value = q;
      flt.frequency.setValueAtTime(f0, t0);
      if (f1) flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
      const g = this.ctx.createGain();
      this._env(g, t0, 0.004, vol, dur, 0.0001);
      src.connect(flt); flt.connect(g); g.connect(dest || this.sfxGain);
      src.start(t0);
    }

    /* ---------------- SFX library ---------------- */
    sJump()   { this.tone({ freq: 300, endFreq: 640, type: "square", vol: .12, dur: .16 }); }
    sDash()   { this.noise({ vol: .22, dur: .18, f0: 2400, f1: 400, q: .8 }); this.tone({ freq: 900, endFreq: 200, type:"sawtooth", vol:.06, dur:.14 }); }
    sLand()   { this.noise({ vol: .12, dur: .09, f0: 500, f1: 120, type: "lowpass" }); }
    sDeath()  { this.noise({ vol: .3, dur: .45, f0: 1800, f1: 90, q: .7 }); this.tone({ freq: 420, endFreq: 40, type: "sawtooth", vol: .2, dur: .5 }); }
    sShard()  { [880, 1174, 1568].forEach((f, i) => this.tone({ freq: f, type: "sine", vol: .14, dur: .3, delay: i * .07 })); }
    sSpring() { this.tone({ freq: 220, endFreq: 990, type: "sine", vol: .2, dur: .28 }); }
    sPlateOn(){ this.tone({ freq: 520, endFreq: 700, type: "triangle", vol: .14, dur: .1 }); }
    sPlateOff(){ this.tone({ freq: 480, endFreq: 330, type: "triangle", vol: .1, dur: .1 }); }
    sDoor(open){ this.tone({ freq: open ? 160 : 320, endFreq: open ? 340 : 150, type: "sawtooth", vol: .07, dur: .3 }); this.noise({ vol:.08, dur:.25, f0: open?600:900, f1: open?1400:300 }); }
    sEchoSave(){ [660, 830].forEach((f,i)=>this.tone({ freq:f, type:"sine", vol:.11, dur:.35, delay:i*.05 })); }
    sWin() {
      const seq = [523, 659, 784, 1047, 1319];
      seq.forEach((f, i) => this.tone({ freq: f, type: "triangle", vol: .16, dur: .38, delay: i * .09 }));
      this.noise({ vol: .1, dur: .6, f0: 4000, f1: 800, delay: .1 });
    }
    sFin() {
      const seq = [392, 523, 659, 784, 1047, 1319, 1568];
      seq.forEach((f, i) => this.tone({ freq: f, type: "triangle", vol: .15, dur: .6, delay: i * .13 }));
    }
    sUI()     { this.tone({ freq: 700, type: "square", vol: .07, dur: .06 }); }
    sUIBack() { this.tone({ freq: 420, type: "square", vol: .07, dur: .07 }); }
    sRecord() { this.tone({ freq: 1100, endFreq: 1700, type: "sine", vol: .09, dur: .2 }); }
    sTick()   { this.tone({ freq: 1300, type: "square", vol: .05, dur: .04 }); }

    /* ---------------- generative ambient music ---------------- */
    startMusic() {
      if (!this.ctx || this._musicTimer) return;
      this._nextNote = this.ctx.currentTime + 0.2;
      this._step = 0;
      this._rand = OX.Utils.rng(this._seed);
      // slow lookahead scheduler
      this._musicTimer = setInterval(() => this._schedule(), 90);
    }

    _schedule() {
      if (!this.ctx || this.muted) { if (this.ctx) this._nextNote = Math.max(this._nextNote, this.ctx.currentTime); return; }
      const spb = 60 / 68 / 2;             // eighth notes at 68 bpm
      while (this._nextNote < this.ctx.currentTime + 0.35) {
        this._playStep(this._step, this._nextNote, spb);
        this._step++;
        this._nextNote += spb;
      }
    }

    _playStep(step, t, spb) {
      const bar = Math.floor(step / 8) % 4;
      const s = step % 8;

      // Pad chord every bar — Am, F, C, G feel in a dark register
      if (s === 0) {
        const chords = [[110, 164.8, 261.6], [87.3, 130.8, 220], [130.8, 196, 329.6], [98, 146.8, 246.9]];
        const ch = chords[bar];
        ch.forEach((f, i) => {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          const flt = this.ctx.createBiquadFilter();
          flt.type = "lowpass"; flt.frequency.value = 900;
          o.type = "sawtooth";
          o.frequency.value = f * (i === 2 ? 1.002 : 1);
          const dur = spb * 8;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.05, t + 0.9);
          g.gain.linearRampToValueAtTime(0.038, t + dur * 0.6);
          g.gain.linearRampToValueAtTime(0.0001, t + dur);
          o.connect(flt); flt.connect(g); g.connect(this.musicGain);
          o.start(t); o.stop(t + dur + 0.1);
        });
      }

      // sparse pentatonic pluck melody
      const scale = [440, 523.25, 587.33, 659.25, 783.99, 880];
      if ((s === 2 || s === 5 || (s === 7 && bar % 2)) && this._rand() < 0.85) {
        const note = scale[Math.floor(this._rand() * scale.length)];
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = "sine"; o.frequency.value = note;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.07, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 3);
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + spb * 3 + 0.05);
        // echo ghost of the note (theme!)
        const o2 = this.ctx.createOscillator();
        const g2 = this.ctx.createGain();
        o2.type = "sine"; o2.frequency.value = note * 0.997;
        g2.gain.setValueAtTime(0.0001, t + spb * 1.5);
        g2.gain.linearRampToValueAtTime(0.028, t + spb * 1.52);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + spb * 3.5);
        o2.connect(g2); g2.connect(this.musicGain);
        o2.start(t + spb * 1.5); o2.stop(t + spb * 4);
      }

      // soft pulse
      if (s % 4 === 0) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(70, t);
        o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
        g.gain.setValueAtTime(0.09, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + 0.2);
      }
    }
  }

  OX.Audio = new AudioSys();
})();
