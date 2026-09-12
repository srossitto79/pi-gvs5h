/* LODESTAR — entities + level runtime.
 *
 * The core idea: the player is a magnetic spark with a POLARITY.
 *   pol = +1  (amber)  -> gravity pulls DOWN, you walk on floors.
 *   pol = -1  (cyan)   -> gravity pulls UP,   you walk on ceilings.
 * Flipping polarity inverts gravity. Gates only open to a matching polarity,
 * so the level forces you to switch surfaces. Shards are magnetically
 * attracted (amber) or repelled (cyan) by the player.
 *
 * A `World` wraps one parsed level: it owns every entity, runs the physics,
 * and reports discrete events (pickup / hurt / died / won / ...) that the
 * game loop reacts to.
 */
window.LD = window.LD || {};

LD.Entities = (function () {
  const U = LD.U, C = LD.CONFIG, T = C.TILE, PAL = U.PAL;

  // ------------------------------------------------------------------
  //  tile helpers
  // ------------------------------------------------------------------
  function solidAt(world, tx, ty) {
    if (tx < 0 || tx >= world.w) return true;   // side walls
    if (ty < 0) return true;                    // ceiling of the world
    if (ty >= world.h) return false;            // bottom: fall out & die
    return world.tiles[ty][tx] !== 0;
  }

  // axis-separated AABB vs tile grid. Mutates e.x/e.y/e.vx/e.vy/e.grounded.
  function moveX(e, world, dt) {
    e.x += e.vx * dt;
    const top = Math.floor(e.y / T);
    const bottom = Math.floor((e.y + e.h - 0.001) / T);
    if (e.vx > 0) {
      const tx = Math.floor((e.x + e.w - 0.001) / T);
      for (let ty = top; ty <= bottom; ty++) {
        if (solidAt(world, tx, ty)) { e.x = tx * T - e.w; e.vx = 0; break; }
      }
    } else if (e.vx < 0) {
      const tx = Math.floor(e.x / T);
      for (let ty = top; ty <= bottom; ty++) {
        if (solidAt(world, tx, ty)) { e.x = (tx + 1) * T; e.vx = 0; break; }
      }
    }
  }
  function moveY(e, world, dt) {
    e.y += e.vy * dt;
    const left = Math.floor(e.x / T);
    const right = Math.floor((e.x + e.w - 0.001) / T);
    if (e.vy > 0) {
      const ty = Math.floor((e.y + e.h - 0.001) / T);
      for (let tx = left; tx <= right; tx++) {
        if (solidAt(world, tx, ty)) {
          e.y = ty * T - e.h; e.vy = 0;
          if (e.pol === 1) e.grounded = true;
          break;
        }
      }
    } else if (e.vy < 0) {
      const ty = Math.floor(e.y / T);
      for (let tx = left; tx <= right; tx++) {
        if (solidAt(world, tx, ty)) {
          e.y = (ty + 1) * T; e.vy = 0;
          if (e.pol === -1) e.grounded = true;
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------
  //  Player
  // ------------------------------------------------------------------
  class Player {
    constructor(x, y) {
      this.w = C.PLAYER.W; this.h = C.PLAYER.H;
      this.x = x - this.w / 2; this.y = y - this.h / 2;
      this.vx = 0; this.vy = 0;
      this.pol = 1;
      this.grounded = false;
      this.facing = 1;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.invuln = 0;
      this.flipAnim = 0;
      this.squash = 1;
      this.cutArmed = false;
      this.dead = false;
    }
    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }

    update(dt, input, world) {
      const P = C.PLAYER;
      this.coyote = Math.max(0, this.coyote - dt);
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.flipAnim = Math.max(0, this.flipAnim - dt);

      // ---- polarity flip ----
      if (input.flipPressed && this.flipAnim <= 0) {
        this.pol *= -1;
        this.flipAnim = P.FLIP_TIME;
        this.invuln = Math.max(this.invuln, P.FLIP_INVULN);
        this.grounded = false;
        this.vy = 120 * this.pol;          // small nudge toward the new ground
        world.onFlip(this);
      }

      // ---- horizontal ----
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (dir !== 0) {
        this.facing = dir;
        const accel = this.grounded ? P.ACCEL : P.AIR_ACCEL;
        this.vx += dir * accel * dt;
        this.vx = U.clamp(this.vx, -P.MAX_SPEED, P.MAX_SPEED);
      } else {
        const fr = this.grounded ? P.FRICTION : P.AIR_DRAG;
        const s = Math.sign(this.vx);
        this.vx -= s * fr * dt;
        if (Math.sign(this.vx) !== s) this.vx = 0;
      }

      // ---- jump ----
      if (input.jumpPressed) this.jumpBuffer = P.JUMP_BUFFER;
      if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0)) {
        this.vy = -P.JUMP_V * this.pol;
        this.grounded = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.squash = 1.35;
        this.cutArmed = true;
        world.onJump(this);
      }
      // variable jump height — one-shot cut when jump is released mid-rise.
      // Only armed after an actual jump, so field lifts are never damped.
      if (this.cutArmed && !input.jumpHeld && this.vy * this.pol < 0) {
        this.vy *= P.JUMP_CUT;
        this.cutArmed = false;
      }
      if (this.grounded) this.cutArmed = false;

      // ---- gravity ----
      const falling = this.vy * this.pol > 0;
      this.vy += P.GRAVITY * this.pol * (falling ? P.FALL_GRAVITY : 1) * dt;
      if (this.vy * this.pol > P.MAX_FALL) this.vy = P.MAX_FALL * this.pol;

      // ---- magnetic fields push ----
      world.applyFields(this, dt);

      // ---- integrate + collide ----
      const wasGrounded = this.grounded;
      this.grounded = false;
      moveX(this, world, dt);
      moveY(this, world, dt);
      world.resolveGates(this);

      if (wasGrounded && !this.grounded) this.coyote = P.COYOTE;
      if (!wasGrounded && this.grounded) this.squash = 0.72;   // landing squash
      this.squash = U.damp(this.squash, 1, 14, dt);
    }
  }

  // ------------------------------------------------------------------
  //  Shard (collectible, magnetic)
  // ------------------------------------------------------------------
  class Shard {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.collected = false;
      this.phase = Math.random() * U.TAU;
    }
  }

  // ------------------------------------------------------------------
  //  Gate (full-height polarity barrier)
  // ------------------------------------------------------------------
  class Gate {
    constructor(x, y, pol) {
      this.x = x; this.y = y; this.pol = pol;
      this.open = pol === 1;   // updated each frame vs player polarity
      this.pulse = Math.random() * U.TAU;
    }
  }

  // ------------------------------------------------------------------
  //  Field (magnetic updraft)
  // ------------------------------------------------------------------
  class Field {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.r = C.FIELD.R;
      this.dir = { x: 0, y: -1 };
      this.strength = C.FIELD.STRENGTH;
      this.phase = Math.random() * U.TAU;
    }
  }

  // ------------------------------------------------------------------
  //  Enemy
  // ------------------------------------------------------------------
  class Enemy {
    constructor(x, y, type) {
      this.w = C.ENEMY.W; this.h = C.ENEMY.H;
      this.x = x - this.w / 2; this.y = y - this.h / 2;
      this.spawnX = this.x; this.spawnY = this.y;
      this.type = type;
      this.vx = 0; this.vy = 0;
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.dead = false;
      this.baseY = y;
      this.phase = Math.random() * U.TAU;
      this.speed = C.ENEMY.SPEED;
    }
    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
  }

  // ------------------------------------------------------------------
  //  Mover (moving platform)
  // ------------------------------------------------------------------
  class Mover {
    constructor(x, y, axis) {
      this.ox = x; this.oy = y;
      this.x = x; this.y = y;
      this.axis = axis;
      this.w = T; this.h = T * 0.6;
      this.range = T * 2.5;
      this.phase = Math.random() * U.TAU;
      this.speed = 1.1;
      this.dx = 0; this.dy = 0;
    }
    update(dt) {
      this.phase += dt * this.speed;
      const off = Math.sin(this.phase) * this.range;
      const nx = this.axis === "x" ? this.ox + off : this.ox;
      const ny = this.axis === "y" ? this.oy + off : this.oy;
      this.dx = nx - this.x; this.dy = ny - this.y;
      this.x = nx; this.y = ny;
    }
  }

  // ------------------------------------------------------------------
  //  Spike / Checkpoint / Portal (simple data)
  // ------------------------------------------------------------------
  class Spike { constructor(x, y, dir) { this.x = x; this.y = y; this.dir = dir; } }
  class Checkpoint { constructor(x, y) { this.x = x; this.y = y; this.active = false; } }
  class Portal { constructor(x, y) { this.x = x; this.y = y; this.phase = 0; } }

  // ------------------------------------------------------------------
  //  World — level runtime
  // ------------------------------------------------------------------
  class World {
    constructor(def) {
      this.def = def;
      this.id = def.id; this.name = def.name;
      this.w = def.w; this.h = def.h;
      this.tiles = def.tiles;
      this.spawn = def.spawn;
      this.portal = new Portal(def.portal.x, def.portal.y);
      this.par = def.par;

      this.player = new Player(def.spawn.x, def.spawn.y);
      this.shards = def.shards.map(s => new Shard(s.x, s.y));
      this.gates = def.gates.map(g => new Gate(g.x, g.y, g.pol));
      this.fields = def.fields.map(f => new Field(f.x, f.y));
      this.enemies = def.enemies.map(e => new Enemy(e.x, e.y, e.type));
      this.spikes = def.spikes.map(s => new Spike(s.x, s.y, s.dir));
      this.movers = def.movers.map(m => new Mover(m.x, m.y, m.axis));
      this.checkpoints = def.checkpoints.map(c => new Checkpoint(c.x, c.y));

      this.activeCheckpoint = null;
      this.shardCount = 0;
      this.totalShards = this.shards.length;
      this.time = 0;
      this.events = {};
    }

    // full reset (entering the level fresh)
    reset() {
      this.player = new Player(this.spawn.x, this.spawn.y);
      this.shards = this.def.shards.map(s => new Shard(s.x, s.y));
      this.enemies = this.def.enemies.map(e => new Enemy(e.x, e.y, e.type));
      this.checkpoints = this.def.checkpoints.map(c => new Checkpoint(c.x, c.y));
      this.activeCheckpoint = null;
      this.shardCount = 0;
      this.time = 0;
      this.events = {};
    }

    // respawn after death (keep collected shards)
    respawn() {
      const cp = this.activeCheckpoint || this.spawn;
      const p = this.player;
      p.x = cp.x - p.w / 2; p.y = cp.y - p.h / 2;
      p.vx = 0; p.vy = 0; p.pol = 1;
      p.dead = false; p.invuln = 1.2; p.grounded = false;
      for (const e of this.enemies) {
        e.dead = false;
        e.x = e.spawnX; e.y = e.spawnY;
        e.vx = 0; e.vy = 0; e.baseY = e.spawnY;
      }
    }

    // ---- player-facing hooks (called from Player.update) ----
    onFlip(p) { LD.Audio.play("flip"); LD.Particles.emit.flip(p.cx, p.cy, p.pol === 1 ? PAL.amber : PAL.cyan); }
    onJump(p) { LD.Audio.play("jump"); LD.Particles.emit.jump(p.cx, p.pol === 1 ? p.y + p.h : p.y, p.pol === 1 ? PAL.amber : PAL.cyan); }

    applyFields(p, dt) {
      for (const f of this.fields) {
        const dx = p.cx - f.x, dy = p.cy - f.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < f.r * f.r) {
          const t = 1 - Math.sqrt(d2) / f.r;
          p.vx += f.dir.x * f.strength * t * dt;
          p.vy += f.dir.y * f.strength * t * dt;
        }
      }
    }

    resolveGates(p) {
      for (const g of this.gates) {
        g.open = (p.pol === g.pol);
        if (g.open) continue;
        const gx = g.x - C.GATE.W / 2, gw = C.GATE.W, gh = this.h * T;
        if (U.aabb(p.x, p.y, p.w, p.h, gx, 0, gw, gh)) {
          const overlapLeft = (p.x + p.w) - gx;
          const overlapRight = (gx + gw) - p.x;
          if (overlapLeft < overlapRight) { p.x = gx - p.w; if (p.vx > 0) p.vx = 0; }
          else { p.x = gx + gw; if (p.vx < 0) p.vx = 0; }
        }
      }
    }

    // ---- per-system updates ----
    updateShards(dt, p) {
      const M = C.MAGNET, S = C.SHARD;
      for (const s of this.shards) {
        if (s.collected) continue;
        s.phase += dt * 3;
        const dx = p.cx - s.x, dy = p.cy - s.y;
        const d = Math.hypot(dx, dy) || 0.001;
        if (p.pol === 1) {
          if (d < M.ATTRACT_RANGE) {
            const f = M.ATTRACT_FORCE * (1 - d / M.ATTRACT_RANGE);
            s.vx += (dx / d) * f * dt; s.vy += (dy / d) * f * dt;
          }
        } else if (d < M.REPEL_RANGE) {
          const f = M.REPEL_FORCE * (1 - d / M.REPEL_RANGE);
          s.vx -= (dx / d) * f * dt; s.vy -= (dy / d) * f * dt;
        }
        const drag = Math.pow(S.DRAG, dt * 60);
        s.vx *= drag; s.vy *= drag;
        s.x += s.vx * dt; s.y += s.vy * dt;
        // bounce off solid tiles
        if (solidAt(this, Math.floor(s.x / T), Math.floor(s.y / T))) {
          s.x -= s.vx * dt; s.y -= s.vy * dt;
          s.vx *= -S.REST; s.vy *= -S.REST;
        }
        if (Math.abs(s.vx) + Math.abs(s.vy) > 50 && Math.random() < 0.5) {
          LD.Particles.emit.trail(s.x, s.y, p.pol === 1 ? PAL.amber : PAL.cyan);
        }
        if (d < S.PICKUP_R) {
          s.collected = true;
          this.shardCount++;
          this.events.pickup = true;
          LD.Audio.play("pickup");
          LD.Particles.emit.pickup(s.x, s.y, PAL.amber);
        }
      }
    }

    updateEnemies(dt) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.type === "crawler") {
          e.vx = e.dir * e.speed;
          // wall check
          const top = Math.floor((e.y + 3) / T), bottom = Math.floor((e.y + e.h - 3) / T);
          if (e.vx > 0) {
            const tx = Math.floor((e.x + e.w) / T);
            if (solidAt(this, tx, top) || solidAt(this, tx, bottom)) { e.x = tx * T - e.w - 0.1; e.dir = -1; }
          } else {
            const tx = Math.floor(e.x / T);
            if (solidAt(this, tx, top) || solidAt(this, tx, bottom)) { e.x = (tx + 1) * T + 0.1; e.dir = 1; }
          }
          // edge check
          const aheadX = e.dir > 0 ? e.x + e.w + 2 : e.x - 2;
          if (!solidAt(this, Math.floor(aheadX / T), Math.floor((e.y + e.h + 6) / T))) e.dir *= -1;
          // gravity
          e.vy += C.PLAYER.GRAVITY * dt;
          if (e.vy > C.PLAYER.MAX_FALL) e.vy = C.PLAYER.MAX_FALL;
          e.x += e.vx * dt; e.y += e.vy * dt;
          const left = Math.floor((e.x + 2) / T), right = Math.floor((e.x + e.w - 2) / T);
          if (e.vy > 0) {
            const ty = Math.floor((e.y + e.h) / T);
            for (let tx = left; tx <= right; tx++) if (solidAt(this, tx, ty)) { e.y = ty * T - e.h; e.vy = 0; break; }
          }
        } else {
          e.phase += dt * 2;
          e.y = e.baseY + Math.sin(e.phase) * 14;
          e.x += Math.cos(e.phase * 0.7) * 12 * dt;
        }
      }
    }

    checkEnemies(p) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (!U.aabb(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) continue;
        const movingToward = (p.pol === 1 && p.vy > 0) || (p.pol === -1 && p.vy < 0);
        const pFoot = p.pol === 1 ? p.y + p.h : p.y;
        const eMid = e.y + e.h / 2;
        const fromTop = p.pol === 1 ? pFoot < eMid + 10 : pFoot > eMid - 10;
        if (movingToward && fromTop) {
          e.dead = true;
          p.vy = -C.ENEMY.STOMP_BOUNCE * p.pol;
          this.events.stomp = true;
          LD.Audio.play("stomp");
          LD.Particles.emit.stomp(e.cx, e.cy);
        } else if (p.invuln <= 0) {
          this.hurtPlayer(p, e);
        }
      }
    }

    hurtPlayer(p, src) {
      if (p.invuln > 0) return;
      p.invuln = C.ENEMY.HURT_INVULN;
      const dx = p.cx - (src.cx || src.x);
      p.vx = (dx >= 0 ? 1 : -1) * 280;
      p.vy = -220 * p.pol;
      this.events.hurt = true;
      LD.Audio.play("hurt");
      LD.Particles.emit.burst(p.cx, p.cy, { count: 14, speed: 200, color: PAL.danger, glow: true });
    }

    checkSpikes(p) {
      for (const s of this.spikes) {
        const sx = s.x - T * 0.32;
        const sy = s.dir === 1 ? s.y - T * 0.4 : s.y - T * 0.1;
        if (U.aabb(p.x, p.y, p.w, p.h, sx, sy, T * 0.64, T * 0.5)) {
          if (p.invuln <= 0) { this.killPlayer(p); return; }
        }
      }
    }

    killPlayer(p) {
      if (p.dead) return;
      p.dead = true;
      this.events.died = true;
      LD.Audio.play("death");
      LD.Particles.emit.death(p.cx, p.cy);
    }

    checkCheckpoint(p) {
      for (const c of this.checkpoints) {
        if (!c.active && U.aabb(p.x, p.y, p.w, p.h, c.x - T / 2, c.y - T / 2, T, T)) {
          c.active = true;
          this.activeCheckpoint = c;
          this.events.checkpoint = true;
          LD.Audio.play("checkpoint");
          LD.Particles.emit.checkpoint(c.x, c.y);
        }
      }
    }

    checkPortal(p) {
      if (U.aabb(p.x, p.y, p.w, p.h, this.portal.x - T * 0.7, this.portal.y - T * 0.7, T * 1.4, T * 1.4)) {
        this.events.won = true;
      }
    }

    updateMovers(dt, p) {
      for (const m of this.movers) {
        m.update(dt);
        const mx = m.x - m.w / 2, my = m.y - m.h / 2;
        const overlapX = p.x + p.w > mx && p.x < mx + m.w;
        if (p.pol === 1) {
          if (p.vy >= 0 && overlapX && p.y + p.h >= my && p.y + p.h <= my + m.h + 10) {
            p.y = my - p.h; p.vy = 0; p.grounded = true; p.x += m.dx;
          }
        } else {
          if (p.vy <= 0 && overlapX && p.y <= my + m.h && p.y >= my - 10) {
            p.y = my + m.h; p.vy = 0; p.grounded = true; p.x += m.dx;
          }
        }
      }
    }

    // ---- main step ----
    update(dt, input) {
      this.events = {};
      this.time += dt;
      this.portal.phase += dt;
      for (const g of this.gates) g.pulse += dt;
      for (const f of this.fields) f.phase += dt;

      if (!this.player.dead) this.player.update(dt, input, this);

      this.updateShards(dt, this.player);
      this.updateEnemies(dt);
      this.updateMovers(dt, this.player);
      if (!this.player.dead) {
        this.checkEnemies(this.player);
        this.checkSpikes(this.player);
        this.checkCheckpoint(this.player);
        this.checkPortal(this.player);
      }
      // fell out of the world
      const p = this.player;
      if (!p.dead && (p.y > this.h * T + 120 || p.y < -260 || p.x < -260 || p.x > this.w * T + 260)) {
        this.killPlayer(p);
      }
    }
  }

  return { World, Player, Shard, Gate, Field, Enemy, Mover, Spike, Checkpoint, Portal };
})();
