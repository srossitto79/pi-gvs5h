/* LODESTAR — game state machine + main loop.
 *
 * States: title -> playing <-> paused -> complete -> (next level | victory)
 * The loop runs a fixed 120 Hz physics step with an accumulator, then renders
 * once per animation frame. Progress (unlocked levels + best times) persists
 * in localStorage.
 */
window.LD = window.LD || {};

LD.Game = (function () {
  const U = LD.U, C = LD.CONFIG, PAL = U.PAL;
  const STEP = C.STEP;
  const LEVELS = LD.Levels.LEVELS;

  const S = {
    TITLE: "title",
    PLAYING: "playing",
    PAUSED: "paused",
    COMPLETE: "complete",
    VICTORY: "victory",
  };

  // ------------------------------------------------------------------
  //  persistence
  // ------------------------------------------------------------------
  function loadSave() {
    try {
      const raw = localStorage.getItem(C.SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s.unlocked === "number") return s;
      }
    } catch (e) { /* corrupted save — start fresh */ }
    return { unlocked: 1, best: {} };
  }
  function writeSave(save) {
    try { localStorage.setItem(C.SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ }
  }

  // ------------------------------------------------------------------
  //  Game
  // ------------------------------------------------------------------
  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.renderer = new LD.Renderer.Renderer(canvas);
      this.camera = new LD.Camera.Camera();
      // title screen reuses level 1's decoration for its parallax backdrop
      this.renderer.buildDeco(LEVELS[0]);

      this.state = S.TITLE;
      this.time = 0;
      this.world = null;
      this.levelIdx = 0;
      this.selectedLevel = 0;

      // run stats
      this.deaths = 0;
      this.levelDeaths = 0;
      this.totalTime = 0;
      this.totalShards = 0;

      // transient
      this.deathFlash = 0;
      this.deathTimer = 0;
      this.levelIntro = 0;
      this.lastResult = null;
      this.isLast = false;
      this.dustTimer = 0;
      this.portalTimer = 0;
      this.acc = 0;
      this._prevLeft = false;
      this._prevRight = false;

      this.save = loadSave();
      this.selectedLevel = Math.min(this.save.unlocked - 1, LEVELS.length - 1);
    }

    // ------------------------------------------------------------------
    //  state transitions
    // ------------------------------------------------------------------
    startLevel(idx) {
      this.levelIdx = idx;
      this.world = new LD.Entities.World(LEVELS[idx]);
      this.camera.snapTo(
        this.world.player.cx - C.VIEW_W / 2,
        this.world.player.cy - C.VIEW_H / 2
      );
      this.state = S.PLAYING;
      this.deathTimer = 0;
      this.levelDeaths = 0;
      this.levelIntro = 2.2;
      this.acc = 0;
      LD.Particles.clear();
      LD.Audio.startMusic(idx);
      LD.Audio.play("confirm");
    }

    toTitle() {
      this.state = S.TITLE;
      this.world = null;
      this.selectedLevel = Math.min(this.save.unlocked - 1, LEVELS.length - 1);
      LD.Audio.stopMusic();
    }

    completeLevel() {
      const w = this.world;
      this.lastResult = {
        time: w.time,
        shards: w.shardCount,
        total: w.totalShards,
        deaths: this.levelDeaths,
        par: w.par,
      };
      this.totalTime += w.time;
      this.totalShards += w.shardCount;

      // persist progress
      const idx = this.levelIdx;
      if (idx + 2 > this.save.unlocked) {
        this.save.unlocked = Math.min(LEVELS.length, idx + 2);
      }
      const prev = this.save.best[idx];
      if (!prev || w.time < prev.time) {
        this.save.best[idx] = { time: w.time, shards: w.shardCount, deaths: this.levelDeaths };
      }
      writeSave(this.save);

      this.isLast = idx + 1 >= LEVELS.length;
      this.state = S.COMPLETE;
      LD.Audio.play("win");
    }

    toggleMute() {
      const on = !LD.Audio.musicOn;
      LD.Audio.setMusic(on);
      LD.Audio.setSfx(on);
      if (on && this.state === S.PLAYING) LD.Audio.startMusic(this.levelIdx);
      LD.Audio.play("ui");
    }

    // ------------------------------------------------------------------
    //  world events (emitted by World.update)
    // ------------------------------------------------------------------
    handleWorldEvents() {
      const ev = this.world.events;
      if (ev.stomp) this.camera.addShake(4);
      if (ev.hurt) this.camera.addShake(9);
      if (ev.died) {
        this.deaths++;
        this.levelDeaths++;
        this.deathFlash = 0.5;
        this.deathTimer = 0.9;
        this.camera.addShake(14);
      }
      if (ev.won) this.completeLevel();
    }

    // ------------------------------------------------------------------
    //  per-frame update
    // ------------------------------------------------------------------
    update(dt) {
      this.time += dt;
      const input = LD.Input.state;

      if (input.mutePressed) this.toggleMute();

      switch (this.state) {
        // ---------------- title ----------------
        case S.TITLE: {
          // slow parallax drift
          this.camera.x = (this.camera.x + dt * 18) % (C.VIEW_W + 200);
          if (input.left && !this._prevLeft) {
            this.selectedLevel = Math.max(0, this.selectedLevel - 1);
            LD.Audio.play("ui");
          }
          if (input.right && !this._prevRight) {
            this.selectedLevel = Math.min(this.save.unlocked - 1, this.selectedLevel + 1);
            LD.Audio.play("ui");
          }
          if (input.confirmPressed) this.startLevel(this.selectedLevel);
          break;
        }

        // ---------------- playing ----------------
        case S.PLAYING: {
          if (input.pausePressed) {
            this.state = S.PAUSED;
            LD.Audio.play("ui");
            break;
          }
          if (input.restartPressed) {
            this.startLevel(this.levelIdx);
            break;
          }

          this.acc += dt;
          let steps = 0;
          while (this.acc >= STEP && steps < 8) {
            this.world.update(STEP, input);
            this.handleWorldEvents();
            this.acc -= STEP;
            steps++;
            if (this.state !== S.PLAYING) break; // won -> complete
          }
          if (steps >= 8) this.acc = 0; // spiral-of-death guard

          if (this.state === S.PLAYING) {
            this.camera.update(dt, this.world.player, this.world);
            this.ambient(dt);
            if (this.deathTimer > 0) {
              this.deathTimer -= dt;
              if (this.deathTimer <= 0) this.world.respawn();
            }
            if (this.levelIntro > 0) this.levelIntro -= dt;
            if (this.deathFlash > 0) this.deathFlash -= dt;
          }
          break;
        }

        // ---------------- paused ----------------
        case S.PAUSED: {
          if (input.confirmPressed) {
            this.state = S.PLAYING;
            LD.Audio.play("ui");
          } else if (input.pausePressed) {
            this.toTitle();
            LD.Audio.play("ui");
          } else if (input.restartPressed) {
            this.startLevel(this.levelIdx);
          }
          break;
        }

        // ---------------- level complete ----------------
        case S.COMPLETE: {
          if (input.confirmPressed) {
            if (this.isLast) {
              this.state = S.VICTORY;
              LD.Audio.stopMusic();
              LD.Audio.play("win");
            } else {
              this.startLevel(this.levelIdx + 1);
            }
          } else if (input.restartPressed) {
            this.startLevel(this.levelIdx);
          }
          break;
        }

        // ---------------- victory ----------------
        case S.VICTORY: {
          if (input.confirmPressed) {
            this.deaths = 0;
            this.totalTime = 0;
            this.totalShards = 0;
            this.toTitle();
            LD.Audio.play("ui");
          }
          break;
        }
      }

      this._prevLeft = input.left;
      this._prevRight = input.right;
    }

    // ambient particles: portal swirl + running dust
    ambient(dt) {
      const w = this.world, p = w.player;
      this.portalTimer -= dt;
      if (this.portalTimer <= 0) {
        this.portalTimer = 0.05;
        LD.Particles.emit.portal(w.portal.x, w.portal.y, PAL.portal);
      }
      if (!p.dead && p.grounded && Math.abs(p.vx) > 120) {
        this.dustTimer -= dt;
        if (this.dustTimer <= 0) {
          this.dustTimer = 0.06;
          const col = p.pol === 1 ? PAL.amber : PAL.cyan;
          const footY = p.pol === 1 ? p.y + p.h : p.y;
          LD.Particles.emit.dust(p.cx, footY, p.facing, col);
        }
      }
    }

    // ------------------------------------------------------------------
    //  render
    // ------------------------------------------------------------------
    render() {
      const ctx = this.renderer.ctx;

      if (this.state === S.TITLE) {
        this.renderer.drawBackground(ctx, this.camera, null);
        LD.UI.drawTitle(ctx, this);
        return;
      }

      this.renderer.render(this.world, this.camera);

      if (this.state === S.PLAYING || this.state === S.PAUSED) {
        LD.UI.drawHUD(ctx, this.world, this);
        if (this.levelIntro > 0) LD.UI.drawLevelIntro(ctx, this.world, this.levelIntro);
      }
      LD.UI.drawDeathFlash(ctx, this);
      if (this.state === S.PAUSED) LD.UI.drawPause(ctx, this);
      if (this.state === S.COMPLETE) LD.UI.drawLevelComplete(ctx, this);
      if (this.state === S.VICTORY) LD.UI.drawVictory(ctx, this);
    }
  }

  return { Game, STATES: S };
})();
