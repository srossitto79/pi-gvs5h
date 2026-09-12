/* LODESTAR — camera. Smooth follow with look-ahead and screen shake. */
window.LD = window.LD || {};

LD.Camera = (function () {
  const U = LD.U, C = LD.CONFIG;

  class Camera {
    constructor() {
      this.x = 0; this.y = 0;
      this.shake = 0;
      this.shakeX = 0; this.shakeY = 0;
      this.snap = true;
    }

    snapTo(x, y) { this.x = x; this.y = y; this.snap = true; }

    addShake(amount) { this.shake = Math.min(24, this.shake + amount); }

    update(dt, target, world) {
      const p = target;
      const lookX = p.facing * C.CAMERA.LOOK;
      const tx = p.cx + lookX - C.VIEW_W / 2;
      const ty = p.cy - C.VIEW_H / 2;

      if (this.snap) { this.x = tx; this.y = ty; this.snap = false; }
      else {
        this.x = U.damp(this.x, tx, C.CAMERA.LERP, dt);
        this.y = U.damp(this.y, ty, C.CAMERA.LERP, dt);
      }

      // clamp to world bounds
      const maxX = Math.max(0, world.w * C.TILE - C.VIEW_W);
      const maxY = Math.max(0, world.h * C.TILE - C.VIEW_H);
      this.x = U.clamp(this.x, 0, maxX);
      this.y = U.clamp(this.y, 0, maxY);

      // shake
      this.shake = U.damp(this.shake, 0, C.CAMERA.SHAKE_DECAY, dt);
      if (this.shake > 0.3) {
        this.shakeX = (Math.random() - 0.5) * this.shake;
        this.shakeY = (Math.random() - 0.5) * this.shake;
      } else { this.shakeX = 0; this.shakeY = 0; }
    }

    get ox() { return this.x + this.shakeX; }
    get oy() { return this.y + this.shakeY; }
  }

  return { Camera };
})();
