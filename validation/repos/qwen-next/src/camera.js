// REVERB — smooth-follow camera with lookahead and shake
(function (RV) {
  "use strict";

  function Camera(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.x = 0; this.y = 0;
    this.shakeT = 0; this.shakeMag = 0;
    this.boundsW = viewW; this.boundsH = viewH;
  }

  Camera.prototype = {
    snapTo(px, py) {
      this.x = px - this.viewW / 2;
      this.y = py - this.viewH / 2;
      this.clamp();
    },
    setBounds(w, h) {
      this.boundsW = Math.max(w, this.viewW);
      this.boundsH = Math.max(h, this.viewH);
    },
    follow(px, py, vx, dt) {
      const lookX = px + Math.sign(vx || 0) * 60;
      const lookY = py - 20;
      const k = 1 - Math.pow(0.0018, dt);
      const tx = lookX - this.viewW / 2;
      const ty = lookY - this.viewH / 2;
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
      this.clamp();
      if (this.shakeT > 0) this.shakeT -= dt;
    },
    shake(mag, dur) {
      this.shakeMag = Math.max(this.shakeMag, mag);
      this.shakeT = Math.max(this.shakeT, dur);
    },
    offset() {
      if (this.shakeT <= 0) return { x: 0, y: 0 };
      const m = this.shakeMag * Math.min(1, this.shakeT * 3);
      return { x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m };
    },
    clamp() {
      const maxX = Math.max(0, this.boundsW - this.viewW);
      const maxY = Math.max(0, this.boundsH - this.viewH);
      if (this.boundsW <= this.viewW) { this.x = (this.boundsW - this.viewW) / 2; }
      else this.x = Math.max(0, Math.min(maxX, this.x));
      if (this.boundsH <= this.viewH) { this.y = (this.boundsH - this.viewH) / 2; }
      else this.y = Math.max(0, Math.min(maxY, this.y));
    },
  };

  RV.Camera = Camera;
})(window.RV = window.RV || {});
