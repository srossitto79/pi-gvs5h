// REVERB — Game: state machine, save data, event reactions. Ties every module
// together; renderer and UI only ever read from here.
(function (RV) {
  "use strict";
  const C = RV.config;
  const U = RV.utils;

  const STATE = { TITLE: "title", SELECT: "select", PLAYING: "playing", PAUSED: "paused", DEAD: "dead", CLEAR: "clear", COMPLETE: "complete" };

  function Game(canvas) {
    this.canvas = canvas;
    this.dpr = 1;
    this.renderer = new RV.Renderer(canvas);
    this.ui = new RV.UI();
    this.input = new RV.Input();
    this.camera = new RV.Camera(canvas.width, canvas.height);
    this.particles = new RV.Particles(600);

    this.state = STATE.TITLE;
    this.stateT = 0;
    this.tGlobal = 0;
    this.acc = 0; // fixed-step physics accumulator

    this.save = this.loadSave();
    this.levelIndex = 0;
    this.levelDef = null;
    this.world = null;
    this.player = new RV.Player();
    this.hearts = C.player.hearts;
    this.heartFlicker = 0;
    this.lastResult = null; // {time, rating, allShards}

    // fx hooks handed to the player (decouples player from audio/fx)
    const self = this;
    this.fx = {
      onJump(p) {
        RV.audio.sfx("jump");
        const c = p.center();
        self.world.reveal.eventPing(c.x, c.y);
        self.particles.burst(c.x, c.y + p.h / 2, 6, { speed: 90, life: 0.35, size: 2.4, color: "#8fb8ff", grav: 240, angle: Math.PI / 2, spread: Math.PI * 0.9 });
      },
      onLand(p, impact) {
        RV.audio.sfx("land");
        const c = p.center();
        self.world.reveal.eventPing(c.x, c.y + p.h / 2);
        const n = Math.min(12, 4 + impact / 90);
        self.particles.burst(c.x, c.y + p.h / 2, n, { speed: 130, life: 0.4, size: 2.6, color: "#9fb4e8", grav: 320, angle: 0, spread: Math.PI });
        if (impact > 700) self.camera.shake(4, 0.18);
      },
      onDash(p) {
        RV.audio.sfx("dash");
        const c = p.center();
        self.world.reveal.eventPing(c.x, c.y);
        self.particles.burst(c.x - p.facing * 10, c.y, 10, { speed: 70, life: 0.3, size: 3, color: "#ffb86b", drag: 0.9 });
      },
    };
  }

  // ---------- save data ----------
  Game.prototype.loadSave = function () {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(C.save.key)); } catch (e) { /* fresh */ }
    if (!s || typeof s.unlocked !== "number") s = { unlocked: 0, best: {}, cursor: 0 };
    return s;
  };
  Game.prototype.persist = function () {
    try { localStorage.setItem(C.save.key, JSON.stringify(this.save)); } catch (e) { /* private mode */ }
  };

  // ---------- level lifecycle ----------
  Game.prototype.startLevel = function (index) {
    this.levelIndex = Math.max(0, Math.min(RV.LEVELS.length - 1, index));
    this.levelDef = RV.LEVELS[this.levelIndex];
    this.world = new RV.World(this.levelDef);
    this.player.reset(this.world.spawn);
    this.hearts = C.player.hearts;
    this.heartFlicker = 0;
    this.particles.pool.forEach((p) => (p.alive = false));
    this.camera.setBounds(this.world.w * C.TILE, this.world.h * C.TILE);
    this.camera.snapTo(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2);
    this.acc = 0;
    this.setState(STATE.PLAYING);
    RV.audio.ensure();
    RV.audio.startMusic("calm");
  };

  Game.prototype.restartLevel = function () {
    this.startLevel(this.levelIndex);
  };

  Game.prototype.setState = function (s) {
    this.state = s;
    this.stateT = 0;
  };

  // respawn after a fall while hearts remain: restore crumbled tiles, keep shards
  Game.prototype.respawnAtSpawn = function () {
    for (const cr of this.world.crumbles) { cr.timer = 0; cr.broken = false; cr.fallY = 0; cr.fallVy = 0; }
    for (const sp of this.world.springs) sp.t = 0;
    this.player.reset(this.world.spawn);
    this.player.invuln = C.player.iframes;
    this.camera.snapTo(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2);
  };

  // ---------- per-frame ----------
  Game.prototype.frame = function (dt) {
    this.lastDt = dt;
    this.tGlobal += dt;
    this.stateT += dt;
    this.input.beginFrame();
    const inp = this.input;

    if (inp.justPressed("mute")) { RV.audio.ensure(); RV.audio.setMuted(!RV.audio.muted); }

    switch (this.state) {
      case STATE.TITLE:
        if (inp.justPressed("confirm")) {
          RV.audio.ensure();
          RV.audio.sfx("ui");
          this.setState(STATE.SELECT);
        }
        break;

      case STATE.SELECT: {
        const n = RV.LEVELS.length;
        if (inp.justPressed("left")) { this.save.cursor = (this.save.cursor + n - 1) % n; RV.audio.sfx("ui"); }
        if (inp.justPressed("right")) { this.save.cursor = (this.save.cursor + 1) % n; RV.audio.sfx("ui"); }
        if (inp.justPressed("confirm")) {
          if (this.save.cursor <= this.save.unlocked) {
            RV.audio.sfx("ui");
            this.startLevel(this.save.cursor);
          } else {
            RV.audio.sfx("hurt");
          }
        }
        for (let i = 0; i < n; i++) {
          if (inp.justPressed("level" + (i + 1)) && i <= this.save.unlocked) {
            this.save.cursor = i;
            this.startLevel(i);
          }
        }
        break;
      }

      case STATE.PLAYING:
        if (inp.justPressed("pause")) { this.setState(STATE.PAUSED); RV.audio.stopMusic(); return; }
        if (inp.justPressed("restart")) { this.restartLevel(); return; }
        // fixed-step physics accumulator
        this.acc += Math.min(dt, C.MAX_FRAME);
        while (this.acc >= C.STEP) { this.tick(C.STEP); this.acc -= C.STEP; }
        this.updatePlaying(dt);
        break;

      case STATE.PAUSED:
        if (inp.justPressed("pause")) { this.setState(STATE.PLAYING); RV.audio.startMusic(this.hearts === 1 ? "tense" : "calm"); }
        else if (inp.justPressed("restart")) { this.restartLevel(); }
        else if (inp.justPressed("confirm")) { RV.audio.stopMusic(); this.setState(STATE.SELECT); }
        break;

      case STATE.DEAD:
        if (inp.justPressed("restart") || (inp.justPressed("confirm") && this.stateT > 0.7)) this.restartLevel();
        break;

      case STATE.CLEAR:
        if (inp.justPressed("confirm") && this.stateT > 0.5) {
          if (this.levelIndex >= RV.LEVELS.length - 1) {
            RV.audio.stopMusic();
            RV.audio.sfx("gate");
            this.setState(STATE.COMPLETE);
          } else {
            this.startLevel(this.levelIndex + 1);
          }
        }
        break;

      case STATE.COMPLETE:
        if (inp.justPressed("confirm") && this.stateT > 0.5) {
          this.save.cursor = 0;
          this.setState(STATE.SELECT);
        }
        break;
    }

    if (this.heartFlicker > 0) this.heartFlicker -= dt;
  };

  Game.prototype.updatePlaying = function (dt) {
    const w = this.world, p = this.player;

    // shout (variable-rate: reacts to this frame's input edge)
    if (this.input.justPressed("shout")) {
      const c = p.center();
      if (w.reveal.shout(c.x, c.y)) {
        RV.audio.sfx("shout");
        this.camera.shake(3, 0.14);
        this.particles.burst(c.x, c.y, 14, { speed: 240, life: 0.5, size: 3, color: "#7fd8ff", drag: 0.9 });
      }
    }

    // death check (player.dead may have been set inside tick)
    if (p.dead && this.state === STATE.PLAYING) {
      RV.audio.sfx("death");
      RV.audio.stopMusic();
      this.camera.shake(9, 0.5);
      this.setState(STATE.DEAD);
    }

    // camera
    const c = p.center();
    this.camera.follow(c.x, c.y, p.vx, dt);

    // music intensity
    if (this.hearts === 1) RV.audio.startMusic("tense");
  };

  // fixed-step physics: called by the main loop's accumulator (and __stepFrames)
  Game.prototype.tick = function (dt) {
    if (this.state !== STATE.PLAYING) return;
    this.player.update(dt, this.input, this.world, this.fx);
    this.world.update(dt, this.player);
    this.handleWorldEvents();
  };

  Game.prototype.handleWorldEvents = function () {
    const w = this.world;
    for (const ev of w.drainEvents()) {
      switch (ev.name) {
        case "shard": {
          RV.audio.sfx("pickup");
          const s = ev.data.shard;
          this.particles.burst(s.x, s.y, 16, { speed: 190, life: 0.6, size: 3, color: ["#ffd27a", "#fff2d0"], grav: 60 });
          w.reveal.eventPing(s.x, s.y);
          break;
        }
        case "bell": {
          RV.audio.sfx("bell");
          const b = ev.data.bell;
          this.particles.burst(b.x, b.y, 22, { speed: 160, life: 0.9, size: 3.4, color: ["#ffc85c", "#ffe9b8"], grav: -30 });
          this.camera.shake(3, 0.2);
          break;
        }
        case "spring":
          RV.audio.sfx("spring");
          break;
        case "crumbled": {
          RV.audio.sfx("crumble");
          const cr = ev.data.cr;
          const t = C.TILE;
          this.particles.burst(cr.tx * t + t / 2, cr.ty * t + t / 2, 12, { speed: 120, life: 0.7, size: 4, color: "#b28054", grav: 500, kind: "shard" });
          break;
        }
        case "hurt": {
          this.hearts--;
          this.heartFlicker = 1;
          RV.audio.sfx("hurt");
          this.camera.shake(7, 0.3);
          const c = this.player.center();
          this.particles.burst(c.x, c.y, 14, { speed: 220, life: 0.5, size: 3, color: ["#ff5c74", "#ff9aa8"] });
          if (this.hearts <= 0) {
            this.player.dead = true;
            this.player.deadT = 0;
          }
          break;
        }
        case "fell": {
          this.hearts--;
          this.heartFlicker = 1;
          RV.audio.sfx("hurt");
          if (this.hearts <= 0) {
            this.player.dead = true; // world already set dead; keep consistent
          } else {
            this.respawnAtSpawn();
          }
          break;
        }
        case "exit": {
          this.onLevelClear();
          break;
        }
      }
    }
  };

  Game.prototype.onLevelClear = function () {
    const w = this.world;
    const time = w.time;
    const rating = U.ratingFor(time, this.levelDef.par);
    const allShards = w.shards.every((s) => s.taken);
    const prev = this.save.best[this.levelDef.id];
    if (!prev || time < prev.time) {
      this.save.best[this.levelDef.id] = { time, rating };
    }
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(RV.LEVELS.length - 1, this.levelIndex + 1));
    this.save.cursor = Math.min(RV.LEVELS.length - 1, this.levelIndex + 1);
    this.persist();
    this.lastResult = { time, rating, allShards };
    // stash shard counts for the clear screen
    this.levelDef._shardGot = w.shards.filter((s) => s.taken).length;
    this.levelDef._shardTotal = w.shards.length;
    RV.audio.sfx("gate");
    RV.audio.stopMusic();
    this.camera.shake(2, 0.2);
    this.setState(STATE.CLEAR);
  };

  // ---------- render ----------
  Game.prototype.render = function () {
    const ctx = this.canvas.getContext("2d");
    const dpr = this.dpr || 1;
    const W = this.canvas.width / dpr, H = this.canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.state === STATE.TITLE) {
      this.renderer.drawBackground(ctx, W, H, this.tGlobal * 22, 120, this.tGlobal);
      this.renderer.drawVignette(ctx, W, H);
      this.ui.drawTitle(ctx, W, H, this.tGlobal, this.save.unlocked > 0);
      return;
    }

    // in-world states share the world render
    if (this.world) {
      this.renderer.draw(this.world, this.player, this.camera, this.tGlobal, W, H);
      this.particles.update(this.lastDt || 1 / 60);
      this.particles.draw(ctx);
      this.ui.drawHUD(ctx, W, H, this);
    } else {
      this.renderer.drawBackground(ctx, W, H, this.tGlobal * 14, 60, this.tGlobal);
      this.renderer.drawVignette(ctx, W, H);
    }

    switch (this.state) {
      case STATE.SELECT: this.ui.drawSelect(ctx, W, H, this.tGlobal, this.save); break;
      case STATE.PAUSED: this.ui.drawPause(ctx, W, H); break;
      case STATE.DEAD: this.ui.drawDeath(ctx, W, H, this.stateT); break;
      case STATE.CLEAR: {
        const r = this.lastResult;
        this.ui.drawLevelComplete(ctx, W, H, this.stateT, this.levelDef, r.time, r.rating, r.allShards, this.levelIndex >= RV.LEVELS.length - 1);
        break;
      }
      case STATE.COMPLETE: {
        let total = 0;
        for (const def of RV.LEVELS) total += (this.save.best[def.id] || { time: def.par * 1.5 }).time;
        const parTotal = RV.LEVELS.reduce((a, d) => a + d.par, 0);
        const rank = U.ratingFor(total, parTotal) + " \u00B7 total echo rating";
        this.ui.drawComplete(ctx, W, H, this.tGlobal, total, rank);
        break;
      }
    }
  };

  // ---------- headless test driver ----------
  // Full pipeline frame (input -> fixed physics -> render) for automated tests.
  Game.prototype.__frame = function (dt) {
    this.frame(dt);
    this.render();
  };

  // Simulates n fixed frames (1/60 s each) without rendering; used by automated tests.
  Game.prototype.__stepFrames = function (n) {
    const dt = 1 / 60;
    for (let i = 0; i < n; i++) {
      this.input.beginFrame();
      if (this.state === STATE.PLAYING) {
        this.player.update(dt, this.input, this.world, this.fx);
        this.world.update(dt, this.player);
        this.handleWorldEvents();
        if (this.player.dead && this.state === STATE.PLAYING) this.setState(STATE.DEAD);
      }
      this.stateT += dt;
      this.tGlobal += dt;
    }
  };

  // simulate a keypress for tests
  Game.prototype.__press = function (action) {
    this.input._queue.push({ action, code: "__test", e: null });
  };

  RV.Game = Game;
})(window.RV = window.RV || {});
