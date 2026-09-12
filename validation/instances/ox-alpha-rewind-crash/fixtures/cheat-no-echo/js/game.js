/* ============================================================
   ECHO PROTOCOL — game.js
   World simulation, loop/recording system, state machine,
   camera, collisions, persistence.
   ============================================================ */
"use strict";
(function () {

  const T = () => OX.TILE;
  const U = OX.Utils;

  const STATE = {
    TITLE: "title", LEVELS: "levels", HELP: "help",
    PLAYING: "playing", PAUSED: "paused",
    COMPLETE: "complete", FIN: "fin",
  };

  const MAX_RECORD_FRAMES = 60 * 240; // 4 minutes safety cap

  class Game {
    constructor(renderer, ui) {
      this.renderer = renderer;
      this.ui = ui;
      this.state = STATE.TITLE;
      this.save = U.loadSave();

      OX.Audio.muted = this.save.muted;

      this.level = null;
      this.player = null;
      this.echoes = [];
      this.recording = null;

      this.worldTime = 0;
      this.frame = 0;
      this.loopNo = 1;
      this.resets = 0;
      this.levelTime = 0;
      this.shardMask = 0;
      this.shardsCollected = 0;
      this.plateTouchedThisLoop = false;

      this.camera = { x: 0, y: 0 };
      this.shakeT = 0; this.shakeDur = .001; this.shakeMag = 0;
      this.dangerFlash = 0;
      this.pendingFade = null;

      // empty world until a sector loads (title screen renders safely)
      this.player = null;
      this.portal = null;
      this.plates = []; this.doors = []; this.lasers = [];
      this.movers = []; this.springs = []; this.shards = [];

      this._extraSolids = [];
    }

    /* ================= lifecycle ================= */
    _leaveWorld() {
      this.level = null;
      this.renderer.terrainCanvas = null;
      OX.FX.clear();
    }

    enterTitle() {
      this._leaveWorld();
      this.state = STATE.TITLE;
      this.ui.showScreen("title");
    }

    enterLevels() {
      this._leaveWorld();
      this.state = STATE.LEVELS;
      this.ui.buildLevelGrid();
      this.ui.showScreen("levels");
    }

    enterHelp() {
      this._leaveWorld();
      this.state = STATE.HELP;
      this.ui.showScreen("help");
    }

    startLevel(index, opts = {}) {
      const lvl = OX.LEVELS[index];
      if (!lvl) return;
      this.levelIndex = index;
      this.level = lvl;
      this.renderer.buildTerrain(lvl);

      /* --- parse terrain --- */
      let spawn = { x: T(), y: T() }, exitTile = null;
      this.shardTiles = [];
      lvl.grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const c = row[x];
          if (c === "P") spawn = { x: x * T() + (T() - OX.Entities.PHYS.W) / 2, y: (y + 1) * T() - OX.Entities.PHYS.H };
          else if (c === "X") exitTile = { x, y };
          else if (c === "*") this.shardTiles.push({ x, y });
        }
      });

      this.pxW = lvl.W * T();
      this.pxH = lvl.H * T();

      /* --- instantiate entities --- */
      const E = OX.Entities;
      this.player = new E.Player(spawn.x, spawn.y);
      this.portal = new E.Portal(exitTile.x, exitTile.y);
      this.plates = (lvl.plates || []).map(d => new E.Plate(d));
      this.doors = (lvl.doors || []).map(d => new E.Door(d));
      this.lasers = (lvl.lasers || []).map(d => new E.Laser(d, this));
      this.movers = (lvl.movers || []).map(d => new E.Mover(d));
      this.springs = (lvl.springs || []).map(d => new E.Spring(d));
      this.shards = this.shardTiles.map((s, i) => new E.Shard(s.x, s.y, i));

      /* --- session state --- */
      this.echoes = [];
      this.recording = this._newRecording();
      this.loopNo = 1;
      this.resets = 0;
      this.levelTime = 0;
      this.shardMask = 0;
      this.shardsCollected = 0;
      this.worldTime = 0;
      this.frame = 0;
      this.completing = false;

      this.camera.x = U.clamp(this.player.cx - OX.VW / 2, Math.min(0, (this.pxW - OX.VW) / 2), Math.max(0, this.pxW - OX.VW));
      this.camera.y = U.clamp(this.player.cy - OX.VH / 2, Math.min(0, (this.pxH - OX.VH) / 2), Math.max(0, this.pxH - OX.VH));

      this.state = STATE.PLAYING;
      this.ui.hideAllScreens();
      this.ui.updateHud();
      this.ui.hint("");
      if (!opts.silent) {
        this.ui.toast(`SECTOR 0${index + 1} — ${lvl.name}`);
      }
    }

    _newRecording() {
      return { xs: [], ys: [], ps: [], len: 0 };
    }

    /* ================= loop control ================= */
    /** Rewind: commit current run as an echo and restart the loop. */
    rewindLoop(fromDeath) {
      // commit echo
      const rec = this.recording;
      let meaningful = rec.len > 25;
      if (meaningful) {
        let minX = Infinity, maxX = -Infinity;
        for (let i = 0; i < rec.len; i += 4) {
          if (rec.xs[i] < minX) minX = rec.xs[i];
          if (rec.xs[i] > maxX) maxX = rec.xs[i];
        }
        meaningful = (maxX - minX > 40) || this.plateTouchedThisLoop || fromDeath;
      }
      if (meaningful) {
        const ghost = new OX.Entities.EchoGhost(rec, this.loopNo);
        void ghost;
        OX.Audio.sEchoSave();
        // enforce cap
        while (this.echoes.length > this.level.maxEchoes) {
          const old = this.echoes.shift();
          OX.FX.echoPoof(old.cx, old.cy);
        }
        if (fromDeath) OX.FX.echoSave(this.player.spawnX + 13, this.player.spawnY + 19);
        this.ui.toast(`ECHO L${this.loopNo} ${fromDeath ? "LOST — " : ""}RECORDED`, 1500);
      } else {
        OX.FX.ring(this.player.spawnX + 13, this.player.spawnY + 19, "#35f0ff", 40, .4);
      }

      this.resets++;
      this.loopNo++;
      this._resetLoop();
    }

    /** Reset everything that must be identical every loop. */
    _resetLoop() {
      this.player.reset();
      this.recording = this._newRecording();
      this.frame = 0;
      this.worldTime = 0;
      this.plateTouchedThisLoop = false;

      // dynamic objects back to their loop-zero state
      this.doors.forEach(d => { d.openT = 0; d.wasOpen = false; });
      this.plates.forEach(p => { p.pressed = false; p.latched = false; p.wasActive = false; p.pressAnim = 0; p.flash = 0; });
      this.springs.forEach(s => { s.cd = 0; s.compress = 0; });
      this.movers.forEach(m => {
        m.t = m.offset;
        const ang = U.TAU * m.t / m.period;
        const k = .5 - .5 * Math.cos(ang);
        m.x = m.bx + m.ax * k; m.y = m.by + m.ay * k;
        m.dxFrame = 0; m.dyFrame = 0;
      });
      this.lasers.forEach(() => {}); // time-based, nothing to do

      // brief spawn flash
      OX.FX.ring(this.player.spawnX + 13, this.player.spawnY + 19, "#35f0ff", 46, .45);
    }

    clearEchoes() {
      if (!this.echoes.length) return;
      this.echoes.forEach(e => OX.FX.echoPoof(e.cx, e.cy));
      this.echoes.length = 0;
      this.ui.toast("ECHOES DISMISSED");
      OX.Audio.sUIBack();
    }

    killPlayer(cause, cx, cy) {
      if (this.player.dead || this.completing) return;
      this.player.dead = true;
      this.player.deadT = .8;
      this.player.vx = 0; this.player.vy = 0;
      OX.FX.deathBurst(cx, cy);
      OX.Audio.sDeath();
      this.shake(7, .35);
      this.dangerFlash = 1;
    }

    completeLevel() {
      if (this.completing) return;   // guard: celebration window
      this.completing = true;
      const id = this.level.id;
      const time = this.levelTime;
      const prev = this.save.best[id];
      const record = !prev || time < prev.time;
      if (record) {
        this.save.best[id] = {
          time,
          loops: Math.min(prev ? prev.loops : 99, this.loopNo),
          shards: (prev ? prev.shards | this.shardMask : this.shardMask),
        };
      } else {
        this.save.best[id].shards |= this.shardMask;
        this.save.best[id].loops = Math.min(this.save.best[id].loops, this.loopNo);
      }
      this.save.unlocked = Math.max(this.save.unlocked, Math.min(OX.LEVEL_COUNT, this.levelIndex + 2));
      U.writeSave(this.save);

      OX.Audio.sWin();
      OX.FX.confetti(this.portal.cx, this.portal.cy);
      this.shake(4, .3);

      const last = this.levelIndex + 1 >= OX.LEVEL_COUNT;
      setTimeout(() => {
        this.completing = false;
        if (last) {
          this.state = STATE.FIN;
          this.ui.fillFinale();
          this.ui.showScreen("fin");
          OX.Audio.sFin();
        } else {
          this.state = STATE.COMPLETE;
          this.ui.fillComplete({ time, record, shards: this.shardsCollected });
          this.ui.showScreen("complete");
        }
      }, 900);
    }

    /* ================= actions from UI ================= */
    onAction(a) {
      switch (a) {
        case "start": {
          // resume at furthest unlocked sector
          this.startLevel(Math.min(this.save.unlocked - 1, OX.LEVEL_COUNT - 1));
          break;
        }
        case "levels": this.enterLevels(); break;
        case "help": this.enterHelp(); break;
        case "back-title": this.enterTitle(); break;
        case "resume": this.togglePause(); break;
        case "restart-loop": this.togglePause(); this.rewindLoop(false); break;
        case "restart-sector": this.togglePause(); this.startLevel(this.levelIndex, { silent: true }); this.ui.toast("SECTOR RESTARTED"); break;
        case "goto-levels": this.enterLevels(); break;
        case "next": this.startLevel(Math.min(this.levelIndex + 1, OX.LEVEL_COUNT - 1)); break;
        case "replay": this.startLevel(this.levelIndex, { silent: true }); break;
        case "wipe-save":
          if (this._wipeArmed) {
            this.save = U._normalize({});
            U.writeSave(this.save);
            this._wipeArmed = false;
            this.ui.buildLevelGrid();
            this.ui.toast("SAVE WIPED");
          } else {
            this._wipeArmed = true;
            this.ui.toast("CLICK AGAIN TO CONFIRM WIPE", 2600);
            setTimeout(() => { this._wipeArmed = false; }, 3000);
          }
          break;
      }
    }

    togglePause() {
      if (this.state === STATE.PLAYING) {
        this.state = STATE.PAUSED;
        this.ui.fillPause();
        this.ui.showScreen("pause");
        OX.Audio.sUI();
      } else if (this.state === STATE.PAUSED) {
        this.state = STATE.PLAYING;
        this.ui.hideAllScreens();
        OX.Audio.sUIBack();
      }
    }

    /* ================= physics helpers ================= */
    solidTile(tx, ty) {
      const l = this.level;
      if (tx < 0 || ty < 0 || tx >= l.W || ty >= l.H) return false;
      return l.rows[ty][tx] === "#";
    }

    solidAtPx(px, py) {
      const tx = Math.floor(px / T()), ty = Math.floor(py / T());
      if (ty < 0 || ty >= this.pxH / T()) return true;   // out of vertical bounds terminates rays
      if (tx < 0 || tx >= this.pxW / T()) return true;
      return this.solidTile(tx, ty);
    }

    _tileSolidForBody(tx, ty) { return this.solidTile(tx, ty); }

    /** Axis-separated AABB movement vs tiles + dynamic solids + one-ways. */
    moveBody(b, dt, isPlayer) {
      const T_ = T();

      /* ---------- X axis ---------- */
      b.x += b.vx * dt;
      {
        const r = b.rect ? b.rect() : b;
        let x0 = Math.floor(r.x / T_), x1 = Math.floor((r.x + r.w - .01) / T_);
        let y0 = Math.floor(r.y / T_), y1 = Math.floor((r.y + r.h - .01) / T_);
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (!this._tileSolidForBody(tx, ty)) continue;
            const rx = tx * T_, ry = ty * T_;
            if (r.x < rx + T_ && r.x + r.w > rx && r.y < ry + T_ && r.y + r.h > ry) {
              if (b.vx > 0) { b.x -= (r.x + r.w) - rx; }
              else if (b.vx < 0) { b.x += rx + T_ - r.x; }
              b.vx = 0;
            }
          }
        }
        // dynamic solids (closed doors)
        for (const s of this._extraSolids) {
          if (OX.Utils.aabb(r.x, r.y, r.w, r.h, s.x, s.y, s.w, s.h)) {
            if (b.vx > 0) b.x -= (r.x + r.w) - s.x;
            else if (b.vx < 0) b.x += s.x + s.w - r.x;
            b.vx = 0;
            r.x = b.x;
          }
        }
      }

      /* ---------- Y axis ---------- */
      const prevBottom = b.y + b.h;
      const prevTop = b.y;
      b.y += b.vy * dt;
      b.grounded = false;
      {
        const r = b.rect ? b.rect() : b;
        let x0 = Math.floor(r.x / T_), x1 = Math.floor((r.x + r.w - .01) / T_);
        let y0 = Math.floor(r.y / T_), y1 = Math.floor((r.y + r.h - .01) / T_);
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            const ch = this.level.rows[ty] && this.level.rows[ty][tx];
            const rx = tx * T_, ry = ty * T_;

            if (ch === "#" && r.x < rx + T_ && r.x + r.w > rx && r.y < ry + T_ && r.y + r.h > ry) {
              if (b.vy > 0) {
                b.y -= (r.y + r.h) - ry;
                b.grounded = true;
              } else if (b.vy < 0) {
                b.y += ry + T_ - r.y;
              }
              b.vy = 0;
            }
            // one-way platform '='
            else if (ch === "=" && b.vy >= 0 &&
              prevBottom <= ry + 8 &&
              r.x < rx + T_ && r.x + r.w > rx &&
              r.y < ry + 16 && r.y + r.h > ry) {
              b.y -= (r.y + r.h) - ry;
              b.vy = 0;
              b.grounded = true;
            }
          }
        }
        // dynamic solids (doors)
        for (const s of this._extraSolids) {
          if (OX.Utils.aabb(r.x, r.y, r.w, r.h, s.x, s.y, s.w, s.h)) {
            if (b.vy > 0) { b.y -= (r.y + r.h) - s.y; b.grounded = true; }
            else if (b.vy < 0) { b.y += s.y + s.h - r.y; }
            b.vy = 0;
          }
        }
        // movers: one-way tops only
        for (const m of this.movers) {
          if (b.vy >= 0 && prevBottom <= m.y + 10 &&
            r.x < m.x + m.w && r.x + r.w > m.x &&
            r.y < m.y + m.h && r.y + r.h > m.y) {
            b.y -= (r.y + r.h) - m.y;
            b.vy = 0;
            b.grounded = true;
            if (isPlayer) b.standingOn = m;
          }
        }
      }
      if (b.rect) { /* keep rect-derived fields consistent */ }
    }

    /* ================= link logic ================= */
    linkActive(expr) {
      return expr.split("+").every(part => {
        const pl = this.plates.find(p => p.link === part);
        return pl ? pl.active : false;
      });
    }

    /* ================= per-frame step ================= */
    step(dt) {
      const inp = OX.Input;

      if (this.state !== STATE.PLAYING) {
        // menus still animate particles + clock
        this.worldTime += dt;
        OX.FX.update(dt);
        this._menuKeys(inp);
        return;
      }

      /* ---- global keys ---- */
      if (inp.consume("pause")) { this.togglePause(); return; }
      if (inp.consume("mute")) {
        this.save.muted = !this.save.muted;
        OX.Audio.setMuted(this.save.muted);
        U.writeSave(this.save);
        this.ui.toast(this.save.muted ? "AUDIO MUTED" : "AUDIO ON", 1000);
      }

      this.levelTime += dt;
      this.worldTime += dt;
      this.dangerFlash = Math.max(0, this.dangerFlash - dt * 3);
      if (this.shakeT > 0) this.shakeT -= dt;

      const pl = this.player;

      if (pl.dead) {
        pl.deadT -= dt;
        OX.FX.update(dt);
        if (pl.deadT <= 0) this.rewindLoop(true);
        return;
      }

      if (inp.consume("rewind")) { this.rewindLoop(false); return; }
      if (inp.consume("clearEchoes")) this.clearEchoes();

      /* ---- movers first (fresh deltas for carrying) ---- */
      this.movers.forEach(m => m.update(dt));

      /* ---- rebuild dynamic solid list ---- */
      this._extraSolids.length = 0;
      for (const d of this.doors) {
        const r = d.solidRect;
        if (r) this._extraSolids.push(r);
      }

      /* ---- player ---- */
      pl.update(dt, inp, this);

      /* ---- record sample ---- */
      if (this.recording.len < MAX_RECORD_FRAMES) {
        this.recording.xs.push(pl.x);
        this.recording.ys.push(pl.y);
        this.recording.ps.push(pl.poseBits() | (pl.facing > 0 ? 16 : 32));
        this.recording.len++;
      }
      this.frame++;

      /* ---- dash trail ---- */
      if (pl.dashT > 0) {
        OX.FX.trail(pl.cx - pl.facing * 8, pl.cy, "#9ffcff", pl.vx, pl.vy);
      }
      // idle float shimmer
      if (pl.grounded && Math.abs(pl.vx) < 5 && Math.random() < dt * 2) {
        OX.FX.trail(pl.cx, pl.y + pl.h - 6, "rgba(53,240,255,.5)");
      }

      /* ---- echoes ---- */
      for (const e of this.echoes) e.update(this.frame);

      /* ---- lasers ---- */
      this.lasers.forEach(l => l.update(this.worldTime));

      /* ---- springs (player only) ---- */
      for (const s of this.springs) {
        s.update(dt);
        s.tryBounce(pl);
      }

      /* ---- plates sense player + echoes ---- */
      const actors = [pl, ...this.echoes];
      for (const p of this.plates) {
        p.update(dt, actors);
        if (p.active) this.plateTouchedThisLoop = true;
      }

      /* ---- doors follow links ---- */
      for (const d of this.doors) d.setOpen(this.linkActive(d.link), dt);

      /* ---- shards ---- */
      for (const sh of this.shards) {
        if (!sh.collected && OX.Utils.aabb(pl.x, pl.y, pl.w, pl.h, sh.cx - 16, sh.cy - 16, 32, 32)) {
          sh.collect();
          this.shardMask |= (1 << sh.idx);
          this.shardsCollected++;
          this.ui.toast(`SHARD ${this.shardsCollected}/3${this.shardsCollected === 3 ? " — ALL SHARDS!" : ""}`, 1400);
        }
      }

      /* ---- hazards ---- */
      const pr = pl.rect();
      // spikes
      const x0 = Math.floor(pr.x / T()), x1 = Math.floor((pr.x + pr.w) / T());
      const y0 = Math.floor(pr.y / T()), y1 = Math.floor((pr.y + pr.h) / T());
      outer:
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const ch = this.level.rows[ty] && this.level.rows[ty][tx];
          if (ch === "^" && pr.y + pr.h > ty * T() + 24) { this.killPlayer("spike", pl.cx, pl.cy); break outer; }
          if (ch === "v" && pr.y < ty * T() + 24) { this.killPlayer("spike", pl.cx, pl.cy); break outer; }
        }
      }
      if (!pl.dead) {
        for (const l of this.lasers) {
          if (l.hits(pr)) { this.killPlayer("laser", pl.cx, pl.cy); break; }
        }
      }

      /* ---- portal ---- */
      if (!this.completing && !pl.dead && OX.Utils.aabb(pr.x, pr.y, pr.w, pr.h, this.portal.rect().x, this.portal.rect().y, 48, 76)) {
        this.completeLevel();
        return;
      }

      /* ---- hints ---- */
      let hintText = "";
      if (this.level.hints) {
        for (const h of this.level.hints) {
          if (pl.cx > h.x * T() && pl.cx < (h.x + h.w) * T() && pl.cy > h.y * T() && pl.cy < (h.y + h.h) * T()) {
            hintText = h.text; break;
          }
        }
      }
      this.ui.hint(hintText);

      /* ---- camera ---- */
      this._updateCamera(dt);

      OX.FX.update(dt);
      this.ui.updateHud();
    }

    _menuKeys(inp) {
      if (inp.consume("mute")) {
        this.save.muted = !this.save.muted;
        OX.Audio.setMuted(this.save.muted);
        U.writeSave(this.save);
        this.ui.toast(this.save.muted ? "AUDIO MUTED" : "AUDIO ON", 1000);
      }
      if (this.state === STATE.TITLE && inp.consume("confirm")) this.onAction("start");
      if ((this.state === STATE.LEVELS || this.state === STATE.HELP) && inp.consume("pause")) this.onAction("back-title");
    }

    _updateCamera(dt) {
      const pl = this.player;
      const look = U.clamp(pl.vx * .22, -110, 110);
      const tx = pl.cx + look - OX.VW / 2;
      const ty = pl.cy - OX.VH / 2 - 30;
      const loX = Math.min(0, (this.pxW - OX.VW) / 2);
      const hiX = Math.max(0, this.pxW - OX.VW);
      const loY = Math.min(0, (this.pxH - OX.VH) / 2);
      const hiY = Math.max(0, this.pxH - OX.VH);
      this.camera.x = U.clamp(U.damp(this.camera.x, tx, 6, dt), loX, hiX);
      this.camera.y = U.clamp(U.damp(this.camera.y, ty, 6, dt), loY, hiY);
    }

    shake(mag, dur) {
      this.shakeMag = mag;
      this.shakeDur = dur;
      this.shakeT = dur;
    }

    /** Testing helper: advance N fixed steps. */
    __stepFrames(n, dt = 1 / 60) {
      for (let i = 0; i < n; i++) this.step(dt);
    }
  }

  OX.Game = Game;
  OX.STATE = STATE;
})();
