// REVERB — player: movement, feel (coyote/buffer/variable jump), dash, collision
(function (RV) {
  "use strict";
  const C = RV.config;
  const T = RV.TILES;

  function Player() {
    this.reset(C.spawn0 || { x: 0, y: 0 });
  }

  Player.prototype = {
    reset(pos) {
      this.x = pos.x; this.y = pos.y;
      this.w = C.player.w; this.h = C.player.h;
      this.vx = 0; this.vy = 0;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuf = 0;
      this.dashT = 0;
      this.canDash = true;
      this.facing = 1;
      this.invuln = 0;
      this.dead = false;
      this.deadT = 0;
      this.squash = 1;      // visual squash/stretch
      this.onMover = null;
      this.walkPhase = 0;
      this.jumpHeld = false;
      this.landImpact = 0;
    },

    center() { return { x: this.x + this.w / 2, y: this.y + this.h / 2 }; },

    // ---- collision helpers ----
    tileAt(world, tx, ty) {
      if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return T.SOLID;
      return world.tiles[ty * world.w + tx];
    },
    solidTile(world, tx, ty) {
      const t = this.tileAt(world, tx, ty);
      if (t === T.SOLID || t === T.HIDDEN) return true;
      if (t === T.CRUMBLE) {
        const cr = world.crumbleMap[ty * world.w + tx];
        return !cr || !cr.broken;
      }
      return false;
    },

    update(dt, input, world, fx) {
      const P = C.player;
      if (this.dead) { this.deadT += dt; return; }
      if (this.invuln > 0) this.invuln -= dt;

      // ---------- horizontal intent ----------
      const left = input.isDown("left"), right = input.isDown("right");
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      if (dir !== 0) this.facing = dir;

      // ---------- dash ----------
      if (input.justPressed("dash") && this.canDash && this.dashT <= 0) {
        this.dashT = P.dashTime;
        this.canDash = false;
        this.vx = this.facing * P.dashSpeed;
        this.vy = 0;
        fx.onDash(this);
      }
      if (this.dashT > 0) {
        this.dashT -= dt;
        // during dash: no gravity, constant speed
      } else {
        // ---------- horizontal movement ----------
        const accel = this.onGround ? P.accelGround : P.accelAir;
        if (dir !== 0) {
          this.vx += dir * accel * dt;
          if (Math.abs(this.vx) > P.moveSpeed) {
            this.vx = Math.sign(this.vx) * Math.max(P.moveSpeed, Math.abs(this.vx) * 0.985);
          }
        } else if (this.onGround) {
          const f = P.frictionGround * dt;
          if (Math.abs(this.vx) <= f) this.vx = 0;
          else this.vx -= Math.sign(this.vx) * f;
        } else {
          this.vx *= Math.pow(0.9, dt * 60 * 0.25);
        }

        // ---------- gravity ----------
        this.vy += P.gravity * dt;
        if (this.vy > P.maxFall) this.vy = P.maxFall;
      }

      // ---------- jump buffering + coyote ----------
      if (input.justPressed("jump")) this.jumpBuf = P.jumpBuffer;
      else this.jumpBuf -= dt;
      this.coyote -= dt;
      if (this.jumpBuf > 0 && (this.onGround || this.coyote > 0)) {
        this.vy = -P.jumpVel;
        this.jumpBuf = 0;
        this.coyote = 0;
        this.onGround = false;
        this.squash = 0.75;
        fx.onJump(this);
      }
      // variable height: release early -> cut
      const jumpHeld = input.isDown("jump");
      if (!jumpHeld && this.jumpHeld && this.vy < 0) this.vy *= P.jumpCut;
      this.jumpHeld = jumpHeld;

      // ---------- integrate + collide X ----------
      this.x += this.vx * dt;
      this.collideX(world);
      // ---------- integrate + collide Y ----------
      const wasAir = !this.onGround;
      const prevVy = this.vy;
      this.y += this.vy * dt;
      this.onMover = null;
      this.collideY(world, prevVy, fx);

      // one-way movers
      if (this.vy >= 0) {
        for (const m of world.movers) {
          const feet = this.y + this.h;
          if (this.x + this.w > m.x + 2 && this.x < m.x + m.w - 2 &&
              feet >= m.y - 1 && feet <= m.y + Math.max(10, this.vy * dt + 6)) {
            this.y = m.y - this.h;
            this.vy = 0;
            if (wasAir && prevVy > 250) { this.squash = 1.25; fx.onLand(this, prevVy); }
            this.onGround = true;
            this.coyote = C.player.coyote;
            this.canDash = true;
            this.onMover = m;
            break;
          }
        }
      }

      if (this.onGround) {
        this.coyote = P.coyote;
        this.canDash = true;
      }

      // squash/stretch relax
      this.squash += (1 - this.squash) * Math.min(1, dt * 12);
      if (Math.abs(this.vx) > 20 && this.onGround) this.walkPhase += dt * Math.abs(this.vx) / 26;
    },

    collideX(world) {
      const t = C.TILE;
      const y0 = Math.floor(this.y / t), y1 = Math.floor((this.y + this.h - 1) / t);
      if (this.vx > 0) {
        const tx = Math.floor((this.x + this.w - 1) / t);
        for (let ty = y0; ty <= y1; ty++) {
          if (this.solidTile(world, tx, ty)) {
            this.x = tx * t - this.w;
            this.vx = Math.min(0, this.vx);
            break;
          }
        }
      } else if (this.vx < 0) {
        const tx = Math.floor(this.x / t);
        for (let ty = y0; ty <= y1; ty++) {
          if (this.solidTile(world, tx, ty)) {
            this.x = (tx + 1) * t;
            this.vx = Math.max(0, this.vx);
            break;
          }
        }
      }
    },

    collideY(world, prevVy, fx) {
      const t = C.TILE;
      const x0 = Math.floor(this.x / t), x1 = Math.floor((this.x + this.w - 1) / t);
      this.onGround = false;
      if (this.vy > 0) {
        const ty = Math.floor((this.y + this.h - 1) / t);
        for (let tx = x0; tx <= x1; tx++) {
          if (this.solidTile(world, tx, ty)) {
            this.y = ty * t - this.h;
            if (prevVy > 260) {
              this.squash = 1.3;
              fx.onLand(this, prevVy);
            }
            this.vy = 0;
            this.onGround = true;
            break;
          }
        }
      } else if (this.vy < 0) {
        const ty = Math.floor(this.y / t);
        for (let tx = x0; tx <= x1; tx++) {
          if (this.solidTile(world, tx, ty)) {
            this.y = (ty + 1) * t;
            this.vy = 0;
            break;
          }
        }
      }
    },
  };

  // hooks are passed into update() by the game (keeps player decoupled from fx/audio)

  RV.Player = Player;
})(window.RV = window.RV || {});
