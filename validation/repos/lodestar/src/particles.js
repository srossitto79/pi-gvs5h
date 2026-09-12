/* LODESTAR — particle system.
 * A single pooled system with a few named emitters. Particles are simple
 * points with velocity, drag, gravity, life, size and color.
 */
window.LD = window.LD || {};

LD.Particles = (function () {
  const U = LD.U;
  const MAX = 900;
  const pool = [];
  for (let i = 0; i < MAX; i++) {
    pool.push({
      active: false, x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 1, size: 2, color: "#fff",
      drag: 0, gravity: 0, glow: false, shrink: true,
    });
  }
  let cursor = 0;

  function spawn(p) {
    // find a free slot (ring buffer fallback)
    for (let i = 0; i < MAX; i++) {
      cursor = (cursor + 1) % MAX;
      const c = pool[cursor];
      if (!c.active) {
        Object.assign(c, {
          active: true, x: p.x, y: p.y,
          vx: p.vx || 0, vy: p.vy || 0,
          life: p.life || 0.5, maxLife: p.life || 0.5,
          size: p.size || 2, color: p.color || "#fff",
          drag: p.drag || 0, gravity: p.gravity || 0,
          glow: !!p.glow, shrink: p.shrink !== false,
        });
        return c;
      }
    }
    return null;
  }

  function burst(x, y, { count = 12, speed = 160, spread = U.TAU,
    angle = 0, life = 0.6, size = 3, color = "#fff", drag = 2,
    gravity = 0, glow = true } = {}) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      spawn({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.8),
        size: size * (0.6 + Math.random() * 0.8),
        color, drag, gravity, glow,
      });
    }
  }

  // named emitters -------------------------------------------------
  const emit = {
    // generic burst (delegates to the module-level burst)
    burst(x, y, opts) { burst(x, y, opts); },
    // running dust
    dust(x, y, dir, color) {
      spawn({
        x: x + (Math.random() - 0.5) * 10, y,
        vx: -dir * (30 + Math.random() * 40), vy: -(20 + Math.random() * 40),
        life: 0.4 + Math.random() * 0.3, size: 2 + Math.random() * 2,
        color, drag: 3, gravity: 60, glow: false,
      });
    },
    // jump puff
    jump(x, y, color) {
      burst(x, y, { count: 8, speed: 90, spread: 1.2, angle: Math.PI / 2,
        life: 0.4, size: 3, color, drag: 4, gravity: 200, glow: false });
    },
    // landing puff
    land(x, y, color) {
      burst(x, y, { count: 10, speed: 120, spread: 1.6, angle: Math.PI,
        life: 0.35, size: 3, color, drag: 5, gravity: 100, glow: false });
    },
    // polarity flip — ring of sparks
    flip(x, y, color) {
      burst(x, y, { count: 22, speed: 220, spread: U.TAU, life: 0.5,
        size: 3, color, drag: 3, gravity: 0, glow: true });
      burst(x, y, { count: 10, speed: 90, spread: U.TAU, life: 0.35,
        size: 2, color: U.PAL.ink, drag: 4, gravity: 0, glow: true });
    },
    // shard pickup sparkle
    pickup(x, y, color) {
      burst(x, y, { count: 16, speed: 180, spread: U.TAU, life: 0.5,
        size: 3, color, drag: 3, gravity: 0, glow: true });
      burst(x, y, { count: 6, speed: 60, spread: U.TAU, life: 0.7,
        size: 2, color: U.PAL.gold, drag: 2, gravity: -40, glow: true });
    },
    // shard trail (magnetic)
    trail(x, y, color) {
      spawn({
        x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
        life: 0.3 + Math.random() * 0.2, size: 2, color, drag: 1,
        gravity: 0, glow: true,
      });
    },
    // stomp
    stomp(x, y) {
      burst(x, y, { count: 14, speed: 200, spread: 1.8, angle: Math.PI,
        life: 0.4, size: 3, color: U.PAL.danger, drag: 4, gravity: 300, glow: true });
    },
    // death
    death(x, y) {
      burst(x, y, { count: 40, speed: 320, spread: U.TAU, life: 0.9,
        size: 4, color: U.PAL.amber, drag: 2, gravity: 200, glow: true });
      burst(x, y, { count: 20, speed: 160, spread: U.TAU, life: 0.6,
        size: 3, color: U.PAL.cyan, drag: 3, gravity: 100, glow: true });
    },
    // checkpoint
    checkpoint(x, y) {
      burst(x, y, { count: 24, speed: 140, spread: U.TAU, life: 0.8,
        size: 3, color: U.PAL.gold, drag: 2, gravity: -60, glow: true });
    },
    // portal swirl
    portal(x, y, color) {
      const a = Math.random() * U.TAU;
      const r = 26 + Math.random() * 10;
      spawn({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        vx: -Math.sin(a) * 60, vy: Math.cos(a) * 60,
        life: 0.6, size: 2.5, color, drag: 0.5, gravity: 0, glow: true,
      });
    },
    // field pulse
    field(x, y, color) {
      const a = Math.random() * U.TAU;
      spawn({
        x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 30,
        vx: Math.cos(a) * 40, vy: Math.sin(a) * 40,
        life: 0.5, size: 2, color, drag: 1, gravity: 0, glow: true,
      });
    },
  };

  function update(dt) {
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      if (p.drag) {
        const f = Math.max(0, 1 - p.drag * dt);
        p.vx *= f; p.vy *= f;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function draw(ctx, camX, camY) {
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      const size = p.shrink ? p.size * t : p.size;
      const x = p.x - camX, y = p.y - camY;
      if (x < -20 || x > LD.CONFIG.VIEW_W + 20 || y < -20 || y > LD.CONFIG.VIEW_H + 20) continue;
      ctx.globalAlpha = Math.min(1, t * 1.5);
      if (p.glow) {
        ctx.globalCompositeOperation = "lighter";
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.5, size), 0, U.TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
  }

  function clear() {
    for (let i = 0; i < MAX; i++) pool[i].active = false;
  }

  return { emit, update, draw, clear };
})();
