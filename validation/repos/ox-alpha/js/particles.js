/* ============================================================
   ECHO PROTOCOL — particles.js
   Pooled particle system + floating text.
   ============================================================ */
"use strict";
(function () {

  const MAX = 900;

  class FX {
    constructor() {
      this.pool = [];
      for (let i = 0; i < MAX; i++) this.pool.push({ alive: false });
      this.floaters = [];
    }

    clear() {
      for (const p of this.pool) p.alive = false;
      this.floaters.length = 0;
    }

    _get() {
      for (let i = 0; i < MAX; i++) {
        const p = this.pool[i];
        if (!p.alive) return p;
      }
      return null; // pool full — silently drop
    }

    spawn(o) {
      const p = this._get();
      if (!p) return null;
      p.alive = true;
      p.x = o.x; p.y = o.y;
      p.vx = o.vx || 0; p.vy = o.vy || 0;
      p.g = o.g ?? 0;                 // gravity
      p.drag = o.drag ?? 0.98;
      p.life = o.life ?? 0.6;
      p.maxLife = p.life;
      p.size = o.size ?? 3;
      p.sizeEnd = o.sizeEnd ?? 0;
      p.color = o.color || "#ffffff";
      p.color2 = o.color2 || null;
      p.shape = o.shape || "dot";     // dot | spark | ring | shard
      p.rot = o.rot || 0;
      p.vr = o.vr || 0;
      p.glow = o.glow ?? false;
      return p;
    }

    /* ---- preset emitters ---- */
    dust(x, y, n = 8, spread = 120) {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - .5) * 1.6;
        const sp = Math.random() * spread * 0.4 + 30;
        this.spawn({
          x: x + (Math.random() - .5) * 18, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.35,
          g: 300, drag: .9, life: .35 + Math.random() * .25,
          size: 2 + Math.random() * 3, sizeEnd: 0,
          color: "rgba(160,180,210,0.55)", shape: "dot",
        });
      }
    }

    trail(x, y, color, vx = 0, vy = 0) {
      this.spawn({
        x: x + (Math.random() - .5) * 6, y: y + (Math.random() - .5) * 10,
        vx: vx * .15, vy: vy * .1 - 8,
        life: .3 + Math.random() * .2, size: 3.5, sizeEnd: .5,
        color, shape: "dot", glow: true, drag: .94,
      });
    }

    burst(x, y, color, n = 26, speed = 380) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * OX.Utils.TAU;
        const sp = speed * (.3 + Math.random() * .7);
        this.spawn({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
          g: 900, drag: .965, life: .5 + Math.random() * .45,
          size: 2 + Math.random() * 3.5, sizeEnd: .5,
          color, shape: Math.random() < .5 ? "spark" : "dot", glow: true,
          rot: a, vr: (Math.random() - .5) * 12,
        });
      }
    }

    deathBurst(x, y) {
      // cyan core
      this.burst(x, y, "#35f0ff", 22, 430);
      this.burst(x, y, "#9ffcff", 14, 240);
      // debris chunks
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * OX.Utils.TAU;
        const sp = 150 + Math.random() * 260;
        this.spawn({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 140,
          g: 1300, drag: .99, life: .8 + Math.random() * .5,
          size: 4 + Math.random() * 4, sizeEnd: 1,
          color: "#1fb8cc", shape: "shard", rot: a, vr: (Math.random() - .5) * 16, glow: true,
        });
      }
      this.ring(x, y, "#35f0ff");
    }

    ring(x, y, color, maxR = 70, life = .4) {
      this.spawn({ x, y, life, size: 6, sizeEnd: maxR, color, shape: "ring", glow: true });
    }

    echoPoof(x, y) {
      this.burst(x, y, "#ffb347", 16, 260);
      this.ring(x, y, "#ffb347", 54, .5);
    }

    echoSave(x, y) {
      this.ring(x, y, "#ffb347", 90, .7);
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * OX.Utils.TAU;
        this.spawn({
          x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 40,
          g: -40, drag: .95, life: .7, size: 2.5, sizeEnd: .5,
          color: "#ffd28a", shape: "dot", glow: true,
        });
      }
    }

    confetti(x, y) {
      const cols = ["#35f0ff", "#b06bff", "#ffb347", "#66ff99", "#ff6b9d"];
      for (let i = 0; i < 46; i++) {
        const a = -Math.PI / 2 + (Math.random() - .5) * 2.2;
        const sp = 220 + Math.random() * 420;
        this.spawn({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          g: 700, drag: .985, life: 1 + Math.random() * .8,
          size: 3 + Math.random() * 3, sizeEnd: 1,
          color: cols[(Math.random() * cols.length) | 0],
          shape: Math.random() < .5 ? "shard" : "spark",
          rot: a, vr: (Math.random() - .5) * 20, glow: true,
        });
      }
    }

    portalSwirl(x, y, t) {
      if (Math.random() < .5) return;
      const a = Math.random() * OX.Utils.TAU;
      const r = 20 + Math.random() * 26;
      this.spawn({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 40 - 20,
        drag: .96, life: .6, size: 2, sizeEnd: 0,
        color: Math.random() < .5 ? "#c89bff" : "#e4d4ff", shape: "dot", glow: true,
      });
    }

    floatText(x, y, text, color = "#fff") {
      this.floaters.push({ x, y, text, color, life: 1.1, maxLife: 1.1, vy: -46 });
      if (this.floaters.length > 24) this.floaters.shift();
    }

    update(dt) {
      for (const p of this.pool) {
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0) { p.alive = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += p.g * dt;
        const dr = Math.pow(p.drag, dt * 60);
        p.vx *= dr; p.vy *= dr;
        p.rot += p.vr * dt;
      }
      for (let i = this.floaters.length - 1; i >= 0; i--) {
        const f = this.floaters[i];
        f.life -= dt;
        f.y += f.vy * dt;
        f.vy *= Math.pow(.96, dt * 60);
        if (f.life <= 0) this.floaters.splice(i, 1);
      }
    }
  }

  OX.FX = new FX();

  /* ---------------- draw helper used by renderer ---------------- */
  OX.drawParticles = function (ctx, camX, camY) {
    const fx = OX.FX;
    ctx.save();
    ctx.translate(-camX, -camY);
    for (const p of fx.pool) {
      if (!p.alive) continue;
      const lt = p.life / p.maxLife;
      let alpha = lt < .3 ? lt / .3 : 1;
      let size = OX.Utils.lerp(p.sizeEnd, p.size, lt);
      ctx.globalAlpha = alpha;
      if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 8; } else ctx.shadowBlur = 0;
      ctx.fillStyle = p.color;
      switch (p.shape) {
        case "ring": {
          ctx.globalAlpha = alpha * .8;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2.5 * lt + .5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, OX.Utils.TAU);
          ctx.stroke();
          break;
        }
        case "spark": {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          const len = size * (1 + Math.min(3, Math.hypot(p.vx, p.vy) / 200));
          ctx.fillRect(-len / 2, -size * .3, len, size * .6);
          ctx.restore();
          break;
        }
        case "shard": {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-size / 2, -size / 2, size, size);
          ctx.restore();
          break;
        }
        default:
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(.4, size), 0, OX.Utils.TAU);
          ctx.fill();
      }
    }
    // floating text
    ctx.textAlign = "center";
    ctx.font = "700 17px Consolas, monospace";
    for (const f of fx.floaters) {
      const lt = f.life / f.maxLife;
      ctx.globalAlpha = Math.min(1, lt * 2);
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color; ctx.shadowBlur = 10;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  };
})();
