/* ============================================================
   ECHO PROTOCOL — entities.js
   Player, EchoGhost, and every interactive world object.
   All defs arrive in tile coordinates; classes convert to pixels.
   ============================================================ */
"use strict";
(function () {

  const T = () => OX.TILE;
  const clamp = (v, a, b) => OX.Utils.clamp(v, a, b);

  /* ============================================================
     PLAYER
     ============================================================ */
  const P = {
    W: 26, H: 38,
    ACC_GROUND: 3600, ACC_AIR: 2400,
    MAX_SPD: 330,
    FRICTION: 3200, AIR_DRAG: 700,
    GRAV: 2450, FALL_MAX: 1060,
    JUMP_V: -795, JUMP_CUT: .42,
    COYOTE: .09, BUFFER: .13,
    DASH_SPD: 690, DASH_TIME: .15,
    SPRING_V: -1235,
  };

  class Player {
    constructor(x, y) { // pixel spawn (top-left)
      this.w = P.W; this.h = P.H;
      this.spawnX = x; this.spawnY = y;
      this.reset();
    }

    reset() {
      this.x = this.spawnX; this.y = this.spawnY;
      this.vx = 0; this.vy = 0;
      this.facing = 1;
      this.grounded = false;
      this.coyote = 0; this.jumpBuf = 0;
      this.dashT = 0; this.canDash = true; this.dashCd = 0;
      this.standingOn = null;
      this.dead = false; this.deadT = 0;
      this.squash = 0; this.stretch = 0;
      this.animT = 0;
      this.jumpHeld = false;
      this.landedFx = false;
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

    poseBits() {
      let b = 0;
      if (this.dead) b |= 8;
      else if (this.dashT > 0) b |= 4;
      else if (!this.grounded) b |= 2;
      else if (Math.abs(this.vx) > 30) b |= 1;
      return b;
    }

    update(dt, input, world) {
      this.animT += dt;

      if (this.dead) {
        this.deadT -= dt;
        return;
      }

      /* ---- timers ---- */
      this.coyote = Math.max(0, this.coyote - dt);
      this.jumpBuf = Math.max(0, this.jumpBuf - dt);
      this.dashCd = Math.max(0, this.dashCd - dt);
      this.squash = Math.max(0, this.squash - dt * 4);
      this.stretch = Math.max(0, this.stretch - dt * 4);

      /* ---- ride moving platform ---- */
      if (this.standingOn && this.standingOn.alive !== false) {
        const m = this.standingOn;
        this.x += m.dxFrame; this.y += m.dyFrame;
      }
      this.standingOn = null;

      /* ---- dash ---- */
      if (input.consume("dash") && this.canDash && this.dashCd <= 0 && this.dashT <= 0) {
        const dir = input.isHeld("left") ? -1 : input.isHeld("right") ? 1 : this.facing;
        this.dashT = P.DASH_TIME;
        this.dashCd = .3;
        this.canDash = false;
        this.vx = dir * P.DASH_SPD;
        this.vy = 0;
        this.facing = dir;
        OX.Audio.sDash();
        OX.FX.burst(this.cx, this.cy, "#9ffcff", 10, 220);
        world.shake(3, .12);
      }

      /* ---- horizontal ---- */
      const left = input.isHeld("left"), right = input.isHeld("right");
      const acc = this.grounded ? P.ACC_GROUND : P.ACC_AIR;
      if (this.dashT > 0) {
        this.dashT -= dt;
        this.vy = 0; // hover-dash
      } else {
        if (left && !right) {
          this.vx -= acc * dt; this.facing = -1;
        } else if (right && !left) {
          this.vx += acc * dt; this.facing = 1;
        } else {
          const fr = (this.grounded ? P.FRICTION : P.AIR_DRAG) * dt;
          this.vx = OX.Utils.approach(this.vx, 0, fr);
        }
        this.vx = clamp(this.vx, -P.MAX_SPD * 1.05, P.MAX_SPD * 1.05);
      }

      /* ---- jump ---- */
      if (input.consume("jump")) this.jumpBuf = P.BUFFER;
      if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0)) {
        this.jumpBuf = 0; this.coyote = 0;
        this.vy = P.JUMP_V;
        this.grounded = false;
        this.stretch = 1;
        this.canDash = true; // generous: jump refreshes dash
        OX.Audio.sJump();
        OX.FX.dust(this.cx, this.y + this.h, 5, 90);
      }
      // variable height
      if (this.vy < 0 && !input.isHeld("jump") && !this.jumpHeld) {
        this.vy *= P.JUMP_CUT;
      }
      this.jumpHeld = this.vy < 0 && input.isHeld("jump");

      /* ---- gravity ---- */
      if (this.dashT <= 0) {
        this.vy += P.GRAV * dt;
        if (this.vy > P.FALL_MAX) this.vy = P.FALL_MAX;
      }

      /* ---- integrate & collide ---- */
      const wasAirborne = !this.grounded;
      this.grounded = false;
      world.moveBody(this, dt, true);

      if (this.grounded) {
        this.canDash = true;
        if (wasAirborne && !this.landedFx) {
          this.squash = 1;
          OX.Audio.sLand();
          OX.FX.dust(this.cx, this.y + this.h, 7, 130);
          this.landedFx = true;
        }
        this.landedFx = true;
      } else {
        this.landedFx = false;
      }

      // coyote granted when walking off a ledge
      if (!this.grounded && this.vy >= 0 && this._prevGrounded) this.coyote = P.COYOTE;
      this._prevGrounded = this.grounded;

      /* ---- run dust ---- */
      if (this.grounded && Math.abs(this.vx) > 200 && Math.random() < dt * 22) {
        OX.FX.spawn({
          x: this.cx - Math.sign(this.vx) * 10, y: this.y + this.h - 2,
          vx: -this.vx * .12, vy: -20 - Math.random() * 30,
          life: .3, size: 2.5, sizeEnd: 0, color: "rgba(140,170,210,.5)", drag: .92,
        });
      }

      /* ---- void fall ---- */
      if (this.y > world.pxH + 120) world.killPlayer("void", this.cx, this.cy);
    }
  }

  /* ============================================================
     ECHO GHOST — replays a recorded run, then settles forever
     ============================================================ */
  class EchoGhost {
    constructor(recording, loopNo) {
      this.xs = recording.xs; this.ys = recording.ys;
      this.fs = recording.fs; this.ps = recording.ps;
      this.len = recording.len;
      this.loopNo = loopNo;
      this.w = P.W; this.h = P.H;
      this.settled = false;
      this.settleT = 0;
      this.alive = true;
      this.flicker = Math.random() * 10;
    }

    update(frame) {
      const idx = Math.min(frame, this.len - 1);
      this.x = this.xs[idx]; this.y = this.ys[idx];
      this.pose = this.ps[idx];
      if (!this.settled && frame >= this.len - 1) {
        this.settled = true;
        OX.FX.ring(this.x + this.w / 2, this.y + this.h / 2, "#ffb347", 44, .5);
      }
      if (this.settled) this.settleT += 1 / 60;
      this.flicker += 1 / 60;
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  /* ============================================================
     PLATE (hold pad / latch switch)
     ============================================================ */
  class Plate {
    constructor(def) {
      this.tx = def.x; this.ty = def.y;
      this.link = def.link;
      this.mode = def.mode || "hold";
      this.w = OX.TILE - 8; this.h = 26;
      this.x = def.x * T() + 4;
      this.y = def.y * T() + T() - this.h;
      this.pressed = false;
      this.latched = false;
      this.pressAnim = 0;
      this.wasActive = false;
      this.flash = 0;
    }

    get active() { return this.mode === "latch" ? this.latched : this.pressed; }

    sense(rect) {
      const s = 6;
      return OX.Utils.aabb(rect.x, rect.y, rect.w, rect.h, this.x - s, this.y - 14, this.w + s * 2, this.h + 18);
    }

    update(dt, actors) {
      const hit = actors.some(a => this.sense(a.rect()));
      if (hit) {
        this.pressed = true;
        if (this.mode === "latch" && !this.latched) {
          this.latched = true;
          this.flash = 1;
          OX.Audio.sPlateOn();
          OX.FX.ring(this.x + this.w / 2, this.y, "#b06bff", 40, .5);
        } else if (this.mode === "hold" && !this.wasActive) {
          OX.Audio.sPlateOn();
          OX.FX.dust(this.x + this.w / 2, this.y + this.h, 4, 60);
        }
      } else {
        this.pressed = false;
      }
      const nowActive = this.active;
      if (this.mode === "hold" && nowActive !== this.wasActive) {
        if (nowActive) OX.Audio.sPlateOn(); else OX.Audio.sPlateOff();
      }
      this.wasActive = nowActive;
      this.pressAnim = OX.Utils.approach(this.pressAnim, nowActive ? 1 : 0, dt * 8);
      this.flash = Math.max(0, this.flash - dt * 2);
    }
  }

  /* ============================================================
     DOOR — vertical shutter, opens while its link is satisfied
     ============================================================ */
  class Door {
    constructor(def) {
      this.link = def.link;
      this.openT = 0;               // 0 closed … 1 open
      this.wasOpen = false;
      this.x = def.x * T() + 7;
      this.y = def.y * T();
      this.w = OX.TILE - 14;
      this.h = def.h * T();
      this.tilesY = def.y;
      this.tilesH = def.h;
      this.tx = def.x;
    }

    get solidRect() {
      // solid while mostly closed
      if (this.openT > .55) return null;
      return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    setOpen(open, dt) {
      if (open !== this.wasOpen) {
        OX.Audio.sDoor(open);
        this.wasOpen = open;
      }
      const target = open ? 1 : 0;
      const spd = open ? 5 : 3.4;
      this.openT = OX.Utils.approach(this.openT, target, dt * spd * (open ? 1 : 1));
    }

    blocksRay(px, py) {
      const r = this.solidRect;
      return r ? OX.Utils.aabb(px, py, 1, 1, r.x, r.y, r.w, r.h) : false;
    }
  }

  /* ============================================================
     LASER — pulsing beam raycast through open space
     ============================================================ */
  class Laser {
    constructor(def, world) {
      this.dir = def.dir;             // "u" | "d"
      this.period = def.period;
      this.duty = def.duty ?? .5;
      this.offset = def.offset || 0;
      this.tx = def.x; this.ty = def.y;
      this.ox = (def.x + .5) * T();
      this.oy = (def.y + .5) * T();
      this.world = world;
      this.beamLen = 0;
      this.beamRect = null;
      this.active = false;
      this.phase01 = 0;
      this.recalc();
    }

    activeAt(t) {
      const ph = ((t + this.offset) % this.period) / this.period;
      return ph;
    }

    recalc() {
      // cast from emitter outward until a solid tile
      const step = T() / 2;
      const dx = 0, dy = this.dir === "u" ? -step : step;
      let x = this.ox, y = this.oy;
      let len = 0;
      for (let i = 0; i < 80; i++) {
        x += dx; y += dy;
        len += step;
        if (this.world.solidAtPx(x, y)) break;
      }
      this.beamLen = len;
      const th = 12;
      this.beamRect = {
        x: this.ox - th / 2,
        y: this.dir === "u" ? this.oy - len : this.oy,
        w: th, h: len,
      };
    }

    update(t) {
      const ph = this.activeAt(t);
      this.phase01 = ph;
      const onFrac = this.duty;
      this.active = ph < onFrac;
      // warm-up: last 18% of the off window before firing
      this.charging = !this.active && ph > onFrac + (1 - onFrac) * .78;
    }

    hits(rect) {
      if (!this.active || !this.beamRect) return false;
      return OX.Utils.aabb(rect.x, rect.y, rect.w, rect.h,
        this.beamRect.x + 3, this.beamRect.y, this.beamRect.w - 6, this.beamRect.h);
    }
  }

  /* ============================================================
     MOVER — kinematic platform, one-way (land on top only)
     ============================================================ */
  class Mover {
    constructor(def) {
      this.bx = def.x * T(); this.by = def.y * T();
      this.dxTiles = def.dx; this.dyTiles = def.dy;
      this.ax = def.dx * T(); this.ay = def.dy * T();
      this.w = def.w * T(); this.h = Math.max(16, def.h * T());
      this.period = def.period;
      this.offset = def.offset || 0;
      this.t = this.offset;
      this.x = this.bx; this.y = this.by;
      this.dxFrame = 0; this.dyFrame = 0;
    }

    update(dt) {
      this.t += dt;
      const ang = OX.Utils.TAU * this.t / this.period;
      const k = .5 - .5 * Math.cos(ang);
      const nx = this.bx + this.ax * k;
      const ny = this.by + this.ay * k;
      this.dxFrame = nx - this.x;
      this.dyFrame = ny - this.y;
      this.x = nx; this.y = ny;
    }

    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  /* ============================================================
     SPRING
     ============================================================ */
  class Spring {
    constructor(def) {
      this.x = def.x * T() + 4;
      this.y = def.y * T() + T() - 18;
      this.w = OX.TILE - 8;
      this.h = 18;
      this.compress = 0;
      this.cd = 0;
    }

    update(dt) {
      this.cd = Math.max(0, this.cd - dt);
      this.compress = Math.max(0, this.compress - dt * 5);
    }

    tryBounce(body) {
      if (this.cd > 0) return false;
      const r = body.rect ? body.rect() : body;
      if (!OX.Utils.aabb(r.x, r.y, r.w, r.h, this.x, this.y - 4, this.w, this.h + 6)) return false;
      if (body.vy > -40 || body.vy === undefined) {
        body.vy = P.SPRING_V;
        body.canDash = true;
        body.coyote = 0;
        this.compress = 1; this.cd = .25;
        OX.Audio.sSpring();
        OX.FX.ring(this.x + this.w / 2, this.y, "#66ff99", 34, .35);
        return true;
      }
      return false;
    }
  }

  /* ============================================================
     SHARD + PORTAL
     ============================================================ */
  class Shard {
    constructor(tx, ty, idx) {
      this.cx = (tx + .5) * T();
      this.cy = (ty + .55) * T();
      this.idx = idx;
      this.collected = false;
      this.popT = 0;
      this.ph = tx * 1.7 + ty;
    }

    rect() { return { x: this.cx - 15, y: this.cy - 15, w: 30, h: 30 }; }

    collect() {
      this.collected = true;
      this.popT = .4;
      OX.Audio.sShard();
      OX.FX.burst(this.cx, this.cy, "#7df3ff", 16, 260);
      OX.FX.ring(this.cx, this.cy, "#7df3ff", 46, .45);
      OX.FX.floatText(this.cx, this.cy - 26, "SHARD", "#7df3ff");
    }
  }

  class Portal {
    constructor(tx, ty) {
      this.cx = (tx + .5) * T();
      this.cy = (ty + .62) * T();
      this.r = 34;
      this.spin = 0;
    }

    rect() { return { x: this.cx - 24, y: this.cy - 38, w: 48, h: 76 }; }
  }

  OX.Entities = { Player, EchoGhost, Plate, Door, Laser, Mover, Spring, Shard, Portal, PHYS: P };
})();
