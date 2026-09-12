// REVERB — the signature mechanic: a light/sonar reveal field over a tile grid.
// Terrain is always faintly visible; hazards are invisible until a reveal ring
// washes over them. Rings come from the player's passive pulse, actions
// (jump/land/dash), shouts (E), resonating bells, and the hum of nearby saws.
(function (RV) {
  "use strict";
  const cfg = RV.config.reveal;

  function RevealField(wTiles, hTiles, tile) {
    this.w = wTiles;
    this.h = hTiles;
    this.tile = tile;
    this.lit = new Float32Array(wTiles * hTiles);
    this.seen = new Uint8Array(wTiles * hTiles);
    this.rings = []; // {x,y,r,speed,maxR,strength,warn}
    this.passiveTimer = 0.4;
    this._ringId = 0;
  }

  RevealField.prototype = {
    reset() {
      this.lit.fill(0);
      this.seen.fill(0);
      this.rings.length = 0;
      this.passiveTimer = 0.4;
    },

    addRing(x, y, opts) {
      this.rings.push({
        x, y, r: opts.r0 || 6,
        speed: opts.speed, maxR: opts.maxR,
        strength: opts.strength == null ? 1 : opts.strength,
        warn: !!opts.warn,
      });
      if (this.rings.length > 24) this.rings.shift();
      return this._ringId++;
    },

    passivePing(x, y) {
      this.addRing(x, y, cfg.passive);
    },
    eventPing(x, y) {
      this.addRing(x, y, cfg.event);
    },
    shout(x, y) {
      if (this.shoutCd > 0) return false;
      this.addRing(x, y, cfg.shout);
      this.shoutCd = cfg.shout.cooldown;
      return true;
    },
    dangerPing(x, y) {
      this.addRing(x, y, { speed: 240, maxR: 150, strength: 0.55, warn: true });
    },

    update(dt, px, py) {
      if (this.shoutCd > 0) this.shoutCd -= dt;

      // automatic passive pulse from the player
      this.passiveTimer -= dt;
      if (this.passiveTimer <= 0) {
        this.passiveTimer = cfg.passive.every;
        this.passivePing(px, py);
      }

      // advance rings and paint the band they sweep
      const t = this.tile;
      const band = t * 1.15;
      for (let ri = this.rings.length - 1; ri >= 0; ri--) {
        const ring = this.rings[ri];
        ring.r += ring.speed * dt;
        if (ring.r >= ring.maxR) { this.rings.splice(ri, 1); continue; }

        const fade = 1 - ring.r / ring.maxR;
        const add = ring.strength * (0.35 + 0.65 * fade);
        const inner = ring.r - band, outer = ring.r + band;
        const x0 = Math.max(0, Math.floor((ring.x - outer) / t));
        const x1 = Math.min(this.w - 1, Math.ceil((ring.x + outer) / t));
        const y0 = Math.max(0, Math.floor((ring.y - outer) / t));
        const y1 = Math.min(this.h - 1, Math.ceil((ring.y + outer) / t));
        for (let ty = y0; ty <= y1; ty++) {
          const cy = (ty + 0.5) * t;
          for (let tx = x0; tx <= x1; tx++) {
            const cx = (tx + 0.5) * t;
            const d = Math.hypot(cx - ring.x, cy - ring.y);
            const off = Math.abs(d - ring.r);
            if (off < band) {
              const k = add * (1 - off / band);
              const idx = ty * this.w + tx;
              if (k > this.lit[idx]) this.lit[idx] = Math.min(1, k);
              if (this.lit[idx] > 0.02) this.seen[idx] = 1;
            }
          }
        }
      }

      // decay toward the faint "memory" of tiles already seen
      const mem = cfg.echoSeenMemory;
      for (let i = 0; i < this.lit.length; i++) {
        const floor = this.seen[i] ? mem : 0;
        const v = this.lit[i] - cfg.litDecay * dt;
        this.lit[i] = v > floor ? v : floor;
      }

      // ambient presence glow around the player (never fully blind up close)
      const R = cfg.ambientRadius;
      const ax0 = Math.max(0, Math.floor((px - R) / t));
      const ax1 = Math.min(this.w - 1, Math.ceil((px + R) / t));
      const ay0 = Math.max(0, Math.floor((py - R) / t));
      const ay1 = Math.min(this.h - 1, Math.ceil((py + R) / t));
      for (let ty = ay0; ty <= ay1; ty++) {
        const cy = (ty + 0.5) * t;
        for (let tx = ax0; tx <= ax1; tx++) {
          const cx = (tx + 0.5) * t;
          const d = Math.hypot(cx - px, cy - py);
          if (d < R) {
            const idx = ty * this.w + tx;
            const f = cfg.ambientFloor * (1 - d / R);
            if (f > this.lit[idx]) this.lit[idx] = f;
          }
        }
      }
    },

    litAtTile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return 0;
      return this.lit[ty * this.w + tx];
    },

    // max lit over a world-space rect (for hazard-sized visibility)
    litOverRect(x, y, w, h) {
      const t = this.tile;
      const x0 = Math.floor(x / t), x1 = Math.floor((x + w) / t);
      const y0 = Math.floor(y / t), y1 = Math.floor((y + h) / t);
      let m = 0;
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const v = this.litAtTile(tx, ty);
          if (v > m) m = v;
        }
      }
      return m;
    },
  };

  RV.RevealField = RevealField;
})(window.RV = window.RV || {});
