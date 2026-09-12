// REVERB — pooled particle system
(function (RV) {
  "use strict";

  function Particles(max) {
    this.max = max || 600;
    this.pool = new Array(this.max);
    for (let i = 0; i < this.max; i++) {
      this.pool[i] = { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: "#fff", grav: 0, kind: "spark", spin: 0, rot: 0 };
    }
    this.cursor = 0;
  }

  Particles.prototype = {
    emit(opts) {
      // reuse the oldest slot if the pool is saturated
      let p = null;
      for (let n = 0; n < this.max; n++) {
        const c = this.pool[this.cursor];
        this.cursor = (this.cursor + 1) % this.max;
        if (!c.alive) { p = c; break; }
      }
      if (!p) { p = this.pool[this.cursor]; this.cursor = (this.cursor + 1) % this.max; }
      p.alive = true;
      p.x = opts.x; p.y = opts.y;
      p.vx = opts.vx || 0; p.vy = opts.vy || 0;
      p.maxLife = p.life = opts.life == null ? 0.6 : opts.life;
      p.size = opts.size == null ? 3 : opts.size;
      p.color = opts.color || "#9fe8ff";
      p.grav = opts.grav || 0;
      p.kind = opts.kind || "spark";
      p.drag = opts.drag == null ? 0.98 : opts.drag;
      p.rot = Math.random() * Math.PI * 2;
      p.spin = (Math.random() - 0.5) * 10;
      return p;
    },

    burst(x, y, n, opts) {
      opts = opts || {};
      for (let i = 0; i < n; i++) {
        const a = opts.angle == null ? Math.random() * Math.PI * 2 : opts.angle + (Math.random() - 0.5) * (opts.spread || Math.PI * 2);
        const sp = (opts.speed || 160) * (0.4 + Math.random() * 0.8);
        this.emit({
          x: x + (Math.random() - 0.5) * (opts.jitter || 4),
          y: y + (Math.random() - 0.5) * (opts.jitter || 4),
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: (opts.life || 0.6) * (0.6 + Math.random() * 0.7),
          size: (opts.size || 3) * (0.6 + Math.random() * 0.8),
          color: Array.isArray(opts.color) ? opts.color[(Math.random() * opts.color.length) | 0] : opts.color,
          grav: opts.grav, kind: opts.kind, drag: opts.drag,
        });
      }
    },

    update(dt) {
      for (let i = 0; i < this.max; i++) {
        const p = this.pool[i];
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0) { p.alive = false; continue; }
        p.vy += p.grav * dt;
        p.vx *= Math.pow(p.drag, dt * 60);
        p.vy *= Math.pow(p.drag, dt * 60);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
      }
    },

    draw(ctx) {
      for (let i = 0; i < this.max; i++) {
        const p = this.pool[i];
        if (!p.alive) continue;
        const t = p.life / p.maxLife;
        ctx.globalAlpha = Math.min(1, t * 1.4);
        if (p.kind === "spark") {
          ctx.fillStyle = p.color;
          const s = p.size * (0.5 + t * 0.5);
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        } else if (p.kind === "glow") {
          const r = p.size * (0.6 + t * 0.6);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, p.color);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        } else if (p.kind === "shard") {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.6, 0);
          ctx.lineTo(0, p.size);
          ctx.lineTo(-p.size * 0.6, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    },
  };

  RV.Particles = Particles;
})(window.RV = window.RV || {});
