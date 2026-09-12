// REVERB — World: owns one level's mutable state (tiles, movers, saws, shards,
// bells, crumbles, springs) and emits discrete events the Game reacts to.
// Gameplay never touches rendering or UI.
(function (RV) {
  "use strict";
  const C = RV.config;
  const T = RV.TILES;

  function World(def) {
    const level = RV.parseLevel(def);
    Object.assign(this, level);
    this.time = 0;
    this.crumbleMap = {};
    for (const cr of this.crumbles) this.crumbleMap[cr.ty * this.w + cr.tx] = cr;
    this.events = [];
    this.reveal = new RV.RevealField(this.w, this.h, this.tile);
    this.bellRings = []; // {x,y,r} expanding rings emitted by resonant bells
  }

  World.prototype = {
    emit(name, data) { this.events.push({ name, data }); },
    drainEvents() { const e = this.events; this.events = []; return e; },

    resetEntities() {
      for (const s of this.shards) s.taken = false;
      for (const b of this.bells) { b.resonant = false; b.ringT = 0; }
      for (const cr of this.crumbles) { cr.timer = 0; cr.broken = false; cr.fallY = 0; cr.fallVy = 0; }
      for (const s of this.springs) s.t = 0;
      for (const m of this.movers) m.phase = 0;
      for (const s of this.saws) { s.t = 0; s.pingT = Math.random() * 0.5; }
      this.time = 0;
      this.bellRings.length = 0;
      this.reveal.reset();
    },

    // ---------- tile queries ----------
    tileAt(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return T.SOLID;
      return this.tiles[ty * this.w + tx];
    },

    // ---------- per-step update (fixed dt) ----------
    update(dt, player) {
      this.time += dt;
      const t = this.tile;

      // movers (deterministic sine patrol)
      for (const m of this.movers) {
        m.phase += dt * m.speed / 60;
        const s = (Math.sin(m.phase) + 1) / 2;
        m.x = m.x0 + m.dx * s;
        m.y = m.y0 + m.dy * s;
      }

      // saws (ping-pong)
      for (const s of this.saws) {
        const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
        if (len < 1) { s.x = s.x0; s.y = s.y0; continue; }
        s.t = (s.t + dt * s.speed) % (len * 2);
        const d = s.t <= len ? s.t : len * 2 - s.t;
        s.x = s.x0 + (s.x1 - s.x0) * (d / len);
        s.y = s.y0 + (s.y1 - s.y0) * (d / len);
        // saws hum: emit small danger pings so moving saws self-locate
        s.pingT -= dt;
        if (s.pingT <= 0) {
          s.pingT = 0.55;
          this.reveal.dangerPing(s.x, s.y);
        }
      }

      // crumbles
      for (const cr of this.crumbles) {
        if (cr.broken) {
          cr.fallVy += 1400 * dt;
          cr.fallY += cr.fallVy * dt;
          continue;
        }
        if (cr.timer > 0) {
          cr.timer -= dt;
          if (cr.timer <= 0) {
            cr.broken = true;
            this.emit("crumbled", { cr });
          }
        }
      }

      // springs animate
      for (const s of this.springs) if (s.t > 0) s.t -= dt;

      // bells: resonant bells keep emitting reveal rings over nearby tiles
      for (const b of this.bells) {
        if (!b.resonant) continue;
        b.ringT -= dt;
        if (b.ringT <= 0) {
          b.ringT = 1.1;
          this.reveal.addRing(b.x, b.y, { speed: 500, maxR: 340, strength: 0.9 });
          this.bellRings.push({ x: b.x, y: b.y, r: 4, life: 1 });
        }
      }
      for (let i = this.bellRings.length - 1; i >= 0; i--) {
        const r = this.bellRings[i];
        r.r += 260 * dt; r.life -= dt * 0.8;
        if (r.life <= 0) this.bellRings.splice(i, 1);
      }

      // reveal field
      const pc = player.center();
      this.reveal.update(dt, pc.x, pc.y);

      // ---- interactions with player ----
      if (!player.dead) {
        const px = player.x, py = player.y, pw = player.w, ph = player.h;

        // shards
        for (const sh of this.shards) {
          if (sh.taken) continue;
          if (Math.abs(sh.x - pc.x) < 22 && Math.abs(sh.y - pc.y) < 24) {
            sh.taken = true;
            this.emit("shard", { shard: sh });
          }
        }

        // bells: player touching a bell with light on it resonates it
        for (const b of this.bells) {
          if (b.resonant) continue;
          if (Math.abs(b.x - pc.x) < 26 && Math.abs(b.y - pc.y) < 30) {
            const lit = this.reveal.litOverRect(b.x - 16, b.y - 16, 32, 32);
            if (lit > 0.25) {
              b.resonant = true;
              b.ringT = 0;
              this.emit("bell", { bell: b });
            }
          }
        }

        // springs
        const t = this.tile;
        const bx0 = Math.floor(px / t), bx1 = Math.floor((px + pw - 1) / t);
        const by0 = Math.floor(py / t), by1 = Math.floor((py + ph - 1) / t);
        for (let ty = by0; ty <= by1; ty++) {
          for (let tx = bx0; tx <= bx1; tx++) {
            if (this.tileAt(tx, ty) === T.SPRING) {
              // only when falling onto it
              if (player.vy >= 0 && py + ph <= (ty + 1) * t + 12) {
                player.vy = C.entities.springVy;
                player.onGround = false;
                player.canDash = true;
                const sp = this.springs.find((s) => s.tx === tx && s.ty === ty);
                if (sp) sp.t = 0.3;
                this.reveal.eventPing(tx * t + t / 2, ty * t + t / 2);
                this.emit("spring", { tx, ty });
              }
            }
          }
        }

        // crumble trigger: standing on a crumble tile
        if (player.onGround) {
          const fy = Math.floor((py + ph + 2) / t);
          for (let tx = bx0; tx <= bx1; tx++) {
            const cr = this.crumbleMap[fy * this.w + tx];
            if (cr && !cr.broken && cr.timer <= 0) cr.timer = C.entities.crumbleTime;
          }
        }

        // spikes: precise hitboxes
        for (let ty = by0; ty <= by1; ty++) {
          for (let tx = bx0; tx <= bx1; tx++) {
            const tt = this.tileAt(tx, ty);
            if (tt < T.SPIKE_U) continue;
            const hb = spikeHitbox(tt, tx, ty, t);
            if (RV.utils.aabb(px, py, pw, ph, hb.x, hb.y, hb.w, hb.h)) {
              this.hurt(player, "spike");
            }
          }
        }

        // saws
        for (const s of this.saws) {
          const d = Math.hypot(pc.x - s.x, pc.y - s.y);
          if (d < s.r + Math.min(pw, ph) / 2 - 4) this.hurt(player, "saw");
        }

        // fell out of the world
        if (py > this.h * t + 80) {
          player.dead = true;
          player.deadT = 0;
          this.emit("fell", {});
        }

        // exit gate
        const e = this.exit;
        if (RV.utils.aabb(px, py, pw, ph, e.x + 4, e.y + 4, e.w - 8, e.h - 4)) {
          this.emit("exit", {});
        }
      }
    },

    hurt(player, cause) {
      if (player.invuln > 0 || player.dead) return;
      player.invuln = C.player.iframes;
      this.emit("hurt", { cause });
    },
  };

  function spikeHitbox(tt, tx, ty, t) {
    switch (tt) {
      case T.SPIKE_U: return { x: tx * t + 3, y: ty * t + t - 12, w: t - 6, h: 12 };
      case T.SPIKE_D: return { x: tx * t + 3, y: ty * t, w: t - 6, h: 12 };
      case T.SPIKE_L: return { x: tx * t + t - 12, y: ty * t + 3, w: 12, h: t - 6 };
      case T.SPIKE_R: return { x: tx * t, y: ty * t + 3, w: 12, h: t - 6 };
    }
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  RV.World = World;
})(window.RV = window.RV || {});
