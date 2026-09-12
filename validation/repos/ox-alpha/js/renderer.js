/* ============================================================
   ECHO PROTOCOL — renderer.js
   Canvas painter: parallax lab backdrop, pre-rendered terrain,
   entities, ghosts, player, beams, particles, vignette.
   ============================================================ */
"use strict";
(function () {

  const T = () => OX.TILE;

  /* ---------------- deterministic per-tile hash ---------------- */
  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177 | 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.terrainCanvas = null;
      this.bgSeed = 1;
      this.vignette = this._makeVignette();
      this.shakeX = 0; this.shakeY = 0;
    }

    _makeVignette() {
      const c = document.createElement("canvas");
      c.width = OX.VW; c.height = OX.VH;
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(OX.VW / 2, OX.VH / 2 - 40, OX.VH * .38, OX.VW / 2, OX.VH / 2, OX.VH * .95);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(2,3,10,.55)");
      g.fillStyle = grad;
      g.fillRect(0, 0, OX.VW, OX.VH);
      return c;
    }

    /* ============ TERRAIN PRE-RENDER ============ */
    buildTerrain(level) {
      const c = document.createElement("canvas");
      c.width = level.W * T(); c.height = level.H * T();
      const g = c.getContext("2d");
      const solid = (x, y) => y >= 0 && y < level.H && x >= 0 && x < level.W && level.rows[y][x] === "#";

      for (let ty = 0; ty < level.H; ty++) {
        for (let tx = 0; tx < level.W; tx++) {
          const ch = level.rows[ty][tx];
          const px = tx * T(), py = ty * T();
          if (ch === "#") {
            const v = hash2(tx, ty);
            // base panel
            const grad = g.createLinearGradient(px, py, px, py + T());
            grad.addColorStop(0, "#232e52");
            grad.addColorStop(1, "#161d38");
            g.fillStyle = grad;
            g.fillRect(px, py, T(), T());
            // inner texture: subtle bolts / seams
            g.fillStyle = "rgba(255,255,255,.03)";
            if (v > .5) g.fillRect(px + 8 + v * 20, py + 8 + v * 24, 3, 3);
            if (v < .35) g.fillRect(px + 30 - v * 20, py + 30 - v * 18, 3, 3);
            g.strokeStyle = "rgba(0,0,0,.28)";
            g.strokeRect(px + .5, py + .5, T() - 1, T() - 1);
            // exposed edges get a lit lip
            g.fillStyle = "rgba(120,160,235,.5)";
            if (!solid(tx, ty - 1)) { g.fillRect(px, py, T(), 3); g.fillStyle = "rgba(90,220,255,.14)"; g.fillRect(px, py + 3, T(), 5); g.fillStyle = "rgba(120,160,235,.5)"; }
            if (!solid(tx, ty + 1)) g.fillRect(px, py + T() - 3, T(), 3);
            if (!solid(tx - 1, ty)) g.fillRect(px, py, 3, T());
            if (!solid(tx + 1, ty)) g.fillRect(px + T() - 3, py, 3, T());
          } else if (ch === "=") {
            // one-way slab
            g.fillStyle = "#2b3763";
            g.fillRect(px, py + 4, T(), 12);
            g.fillStyle = "rgba(130,190,255,.55)";
            g.fillRect(px, py + 4, T(), 3);
            g.fillStyle = "rgba(0,0,0,.3)";
            g.fillRect(px, py + 14, T(), 2);
          } else if (ch === "^" || ch === "v") {
            // spikes
            const n = 3, w = T() / n;
            for (let i = 0; i < n; i++) {
              const bx = px + i * w;
              g.beginPath();
              if (ch === "^") {
                g.moveTo(bx, py + T());
                g.lineTo(bx + w / 2, py + 8);
                g.lineTo(bx + w, py + T());
              } else {
                g.moveTo(bx, py);
                g.lineTo(bx + w / 2, py + T() - 8);
                g.lineTo(bx + w, py);
              }
              g.closePath();
              const sg = g.createLinearGradient(px, py, px, py + T());
              sg.addColorStop(0, "#9fb3d9"); sg.addColorStop(1, "#48557c");
              g.fillStyle = sg;
              g.fill();
              g.strokeStyle = "rgba(255,80,110,.7)";
              g.lineWidth = 1.2;
              g.stroke();
            }
          }
        }
      }
      this.terrainCanvas = c;
      this.bgSeed = level.musicSeed || 1;
      this.level = level;
    }

    /* ============ BACKDROP ============ */
    drawBackground(ctx, cam, t) {
      // sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, OX.VH);
      sky.addColorStop(0, "#0a1024");
      sky.addColorStop(.55, "#0d142c");
      sky.addColorStop(1, "#111a36");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, OX.VW, OX.VH);

      const rnd = OX.Utils.rng(this.bgSeed * 7919);

      // far towers
      this._towers(ctx, cam, .18, rnd, "#101833", OX.VH * .78, 260);
      // near towers
      this._towers(ctx, cam, .34, rnd, "#141d3d", OX.VH * .88, 200);

      // faint grid
      ctx.save();
      ctx.globalAlpha = .07;
      ctx.strokeStyle = "#5f86ff";
      ctx.lineWidth = 1;
      const gs = 64, oy = (-cam.y * .22) % gs, ox = (-cam.x * .22) % gs;
      ctx.beginPath();
      for (let x = ox; x < OX.VW; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, OX.VH); }
      for (let y = oy; y < OX.VH; y += gs) { ctx.moveTo(0, y); ctx.lineTo(OX.VW, y); }
      ctx.stroke();
      ctx.restore();

      // drifting motes
      ctx.save();
      for (let i = 0; i < 42; i++) {
        const sx = ((rnd() * 2400 + t * (8 + rnd() * 20) - cam.x * .3) % (OX.VW + 40)) - 20;
        const sy = ((rnd() * 900 + Math.sin(t * .4 + i) * 30 - cam.y * .25) % (OX.VH + 40)) - 20;
        const s = 1 + rnd() * 2.2;
        ctx.globalAlpha = .1 + rnd() * .22;
        ctx.fillStyle = "#8fd8ff";
        ctx.beginPath();
        ctx.arc((sx + OX.VW) % OX.VW, (sy + OX.VH) % OX.VH, s, 0, OX.Utils.TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    _towers(ctx, cam, k, rnd, color, baseY, maxH) {
      ctx.save();
      ctx.fillStyle = color;
      const w0 = 90, gap = 46;
      const off = -(cam.x * k);
      const count = Math.ceil(OX.VW / (w0 + gap)) + 2;
      const first = Math.floor(-off / (w0 + gap));
      for (let i = first; i < first + count; i++) {
        const r = rnd();
        const r2 = rnd();
        const x = off + i * (w0 + gap);
        const h = 60 + r2 * maxH;
        ctx.fillRect(x, baseY - h, w0 * (.7 + r * .5), h + 40);
        // antenna
        if (r > .6) ctx.fillRect(x + w0 * .4, baseY - h - 26, 4, 26);
        // window dots
        ctx.fillStyle = "rgba(120,200,255,.08)";
        for (let wy = baseY - h + 14; wy < baseY - 10; wy += 26) {
          for (let wx = x + 10; wx < x + w0 * .9; wx += 22) {
            if (((wx * 31 + wy * 17) | 0) % 7 < 2) ctx.fillRect(wx, wy, 6, 8);
          }
        }
        ctx.fillStyle = color;
      }
      ctx.restore();
    }

    /* ============ MAIN FRAME ============ */
    draw(game) {
      const ctx = this.ctx;
      const cam = game.camera;
      const t = game.worldTime;

      // camera shake
      let sx = 0, sy = 0;
      if (game.shakeT > 0) {
        const m = game.shakeMag * (game.shakeT / game.shakeDur);
        sx = (Math.random() * 2 - 1) * m;
        sy = (Math.random() * 2 - 1) * m;
      }

      this.drawBackground(ctx, cam, t);

      ctx.save();
      ctx.translate(Math.round(-cam.x + sx), Math.round(-cam.y + sy));

      // terrain
      if (this.terrainCanvas) ctx.drawImage(this.terrainCanvas, 0, 0);

      // world objects behind actors
      for (const d of game.doors) this._door(ctx, d);
      for (const p of game.plates) this._plate(ctx, p, t);
      for (const s of game.springs) this._spring(ctx, s);
      for (const m of game.movers) this._mover(ctx, m, t);
      for (const sh of game.shards) this._shard(ctx, sh, t);
      if (game.portal) this._portal(ctx, game.portal, t);

      // echoes then player
      if (game.level) {
        for (const e of game.echoes) this._echo(ctx, e);
        if (!game.player.dead) this._player(ctx, game.player, t);
      }

      // beams on top of everything world-space
      for (const l of game.lasers) this._laser(ctx, l, t);

      OX.drawParticles(ctx, 0, 0);

      ctx.restore();

      // vignette + danger flash
      ctx.drawImage(this.vignette, 0, 0);
      if (game.dangerFlash > 0) {
        ctx.fillStyle = `rgba(255,68,102,${game.dangerFlash * .16})`;
        ctx.fillRect(0, 0, OX.VW, OX.VH);
      }
    }

    /* ---------------- entity painters ---------------- */
    _plate(ctx, p, t) {
      const active = p.active;
      const col = p.mode === "latch" ? "#b06bff" : "#66ff99";
      const glow = active ? .85 : .3;
      // base slot
      ctx.fillStyle = "#0c1226";
      ctx.fillRect(p.x - 4, p.y + p.h - 8, p.w + 8, 10);
      ctx.fillStyle = "#1d2749";
      ctx.fillRect(p.x - 4, p.y + p.h - 8, p.w + 8, 3);
      // cap
      const drop = p.pressAnim * 7;
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = active ? 16 : 6;
      ctx.fillStyle = col;
      ctx.globalAlpha = .25 + glow * .3;
      ctx.fillRect(p.x + 3, p.y + drop, p.w - 6, p.h - drop - 6);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.fillRect(p.x, p.y + 4 + drop, p.w, 8);
      ctx.restore();
      // signal stem when active
      if (active) {
        ctx.strokeStyle = col; ctx.globalAlpha = .5 + .3 * Math.sin(t * 6);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x + p.w / 2, p.y - 4);
        ctx.lineTo(p.x + p.w / 2, p.y - 16);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (p.flash > 0) {
        ctx.strokeStyle = "#fff"; ctx.globalAlpha = p.flash;
        ctx.lineWidth = 3;
        ctx.strokeRect(p.x - 2, p.y - 2, p.w + 4, p.h + 4);
        ctx.globalAlpha = 1;
      }
    }

    _door(ctx, d, t) {
      const openPx = d.openT * (d.h + 26); // slides up into housing
      ctx.save();
      // frame rails
      ctx.fillStyle = "#0e1531";
      ctx.fillRect(d.x - 5, d.y - 8, d.w + 10, 8);
      ctx.fillRect(d.x - 5, d.y + d.h, d.w + 10, 6);
      ctx.fillStyle = "#26315c";
      ctx.fillRect(d.x - 5, d.y - 8, d.w + 10, 3);

      // shutter panels
      const panels = Math.max(2, Math.round(d.tilesH * 2));
      const ph = d.h / panels;
      for (let i = 0; i < panels; i++) {
        const py = d.y + i * ph - openPx;
        if (py + ph < d.y - 40) continue;
        ctx.save();
        ctx.beginPath();
        ctx.rect(d.x, d.y - openPx, d.w, d.h);
        ctx.clip();
        const g = ctx.createLinearGradient(d.x, py, d.x + d.w, py);
        g.addColorStop(0, "#39456f"); g.addColorStop(.5, "#2b355c"); g.addColorStop(1, "#39456f");
        ctx.fillStyle = g;
        ctx.fillRect(d.x, py, d.w, ph - 3);
        // hazard notch on middle panel
        if (i === Math.floor(panels / 2)) {
          ctx.fillStyle = "rgba(255,179,71,.75)";
          ctx.fillRect(d.x + d.w / 2 - 8, py + ph / 2 - 2, 16, 4);
        }
        ctx.strokeStyle = "rgba(0,0,0,.4)";
        ctx.strokeRect(d.x + .5, py + .5, d.w - 1, ph - 4);
        ctx.restore();
      }
      // status light: red blocked / green pass
      ctx.shadowBlur = 8;
      ctx.shadowColor = d.openT > .55 ? "#66ff99" : "#ff4466";
      ctx.fillStyle = d.openT > .55 ? "#66ff99" : "#ff4466";
      ctx.beginPath();
      ctx.arc(d.x + d.w / 2, d.y - 12, 3.5, 0, OX.Utils.TAU);
      ctx.fill();
      ctx.restore();
    }

    _laser(ctx, l, t) {
      const th = 12;
      // emitter housing
      ctx.save();
      ctx.translate(l.ox, l.oy);
      if (l.dir === "u") ctx.rotate(0); else ctx.rotate(Math.PI);
      ctx.fillStyle = "#1a2142";
      ctx.fillRect(-14, l.dir === "u" ? 6 : -22, 28, 16);
      ctx.fillStyle = "#0c1226";
      ctx.fillRect(-10, l.dir === "u" ? 2 : -18, 20, 6);
      // core light
      const warm = l.charging ? .4 + .6 * Math.abs(Math.sin(t * 22)) : (l.active ? 1 : .12);
      ctx.shadowColor = "#ff4466"; ctx.shadowBlur = 12 * warm;
      ctx.fillStyle = `rgba(255,68,102,${warm})`;
      ctx.beginPath();
      ctx.arc(0, l.dir === "u" ? 4 : -4, 4.5, 0, OX.Utils.TAU);
      ctx.fill();
      ctx.restore();

      if (!l.beamRect) return;
      const b = l.beamRect;
      if (l.active) {
        const flick = .82 + .18 * Math.sin(t * 47 + l.tx * 13);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255,50,90,${.28 * flick})`;
        ctx.fillRect(b.x - 6, b.y, b.w + 12, b.h);
        ctx.fillStyle = `rgba(255,90,120,${.75 * flick})`;
        ctx.fillRect(b.x + 1, b.y, b.w - 2, b.h);
        ctx.fillStyle = `rgba(255,230,238,${.95 * flick})`;
        ctx.fillRect(b.x + 4, b.y, b.w - 8, b.h);
        // impact sparks at the end
        if (Math.random() < .35) {
          OX.FX.spawn({
            x: b.x + b.w / 2 + (Math.random() - .5) * 6,
            y: b.y + b.h - 4,
            vx: (Math.random() - .5) * 140, vy: -Math.random() * 120,
            life: .25, size: 2, color: "#ffb0c0", shape: "spark", glow: true, drag: .9,
          });
        }
        ctx.restore();
      } else if (l.charging) {
        ctx.save();
        ctx.globalAlpha = .3 + .25 * Math.sin(t * 26);
        ctx.strokeStyle = "#ff4466"; ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 10]);
        ctx.beginPath();
        ctx.moveTo(b.x + b.w / 2, b.y + (l.dir === "u" ? b.h : 0));
        ctx.lineTo(b.x + b.w / 2, b.y + (l.dir === "u" ? 0 : b.h));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    _mover(ctx, m, t) {
      ctx.save();
      // under-glow
      ctx.fillStyle = "rgba(53,240,255,.09)";
      ctx.fillRect(m.x + 6, m.y + m.h, m.w - 12, 16);
      // deck
      const g = ctx.createLinearGradient(0, m.y, 0, m.y + m.h);
      g.addColorStop(0, "#465a94"); g.addColorStop(1, "#222b4f");
      ctx.fillStyle = g;
      ctx.fillRect(m.x, m.y, m.w, m.h);
      ctx.fillStyle = "rgba(150,210,255,.7)";
      ctx.fillRect(m.x, m.y, m.w, 3);
      // thruster pods
      ctx.fillStyle = "#182043";
      ctx.fillRect(m.x - 4, m.y + 2, 6, m.h - 4);
      ctx.fillRect(m.x + m.w - 2, m.y + 2, 6, m.h - 4);
      ctx.shadowColor = "#35f0ff"; ctx.shadowBlur = 10;
      ctx.fillStyle = `rgba(53,240,255,${.5 + .3 * Math.sin(t * 9)})`;
      ctx.fillRect(m.x - 3, m.y + m.h - 5, 4, 3);
      ctx.fillRect(m.x + m.w - 1, m.y + m.h - 5, 4, 3);
      ctx.restore();
    }

    _spring(ctx, s) {
      const comp = s.compress * 10;
      ctx.save();
      ctx.translate(s.x, s.y);
      // base
      ctx.fillStyle = "#16203f";
      ctx.fillRect(-2, s.h - 6, s.w + 4, 8);
      // coils
      ctx.strokeStyle = "#66ff99";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#66ff99"; ctx.shadowBlur = 8;
      const topY = 4 + comp;
      ctx.beginPath();
      ctx.moveTo(4, s.h - 6);
      ctx.lineTo(s.w - 4, s.h - 12);
      ctx.lineTo(4, s.h - 18 + comp * .4);
      ctx.stroke();
      // cap plate
      ctx.fillStyle = "#8effc0";
      ctx.fillRect(0, topY, s.w, 6);
      ctx.restore();
    }

    _shard(ctx, sh, t) {
      if (sh.popT > 0 && sh.collected) {
        sh.popT -= 1 / 60;
        if (sh.popT <= 0) return;
      }
      if (sh.collected) return;
      const bob = Math.sin(t * 2.4 + sh.ph) * 5;
      const rot = t * 1.8 + sh.ph;
      ctx.save();
      ctx.translate(sh.cx, sh.cy + bob);
      // light pillar
      const pg = ctx.createLinearGradient(0, -70, 0, 40);
      pg.addColorStop(0, "rgba(125,243,255,0)");
      pg.addColorStop(.7, "rgba(125,243,255,.05)");
      pg.addColorStop(1, "rgba(125,243,255,.14)");
      ctx.fillStyle = pg;
      ctx.fillRect(-10, -70, 20, 110);
      // diamond
      ctx.rotate(rot);
      ctx.shadowColor = "#7df3ff"; ctx.shadowBlur = 18;
      ctx.fillStyle = "#aef7ff";
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(8, 0); ctx.lineTo(0, 11); ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(20,40,70,.85)";
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(8, 0); ctx.lineTo(0, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    _portal(ctx, po, t) {
      if (!po) return;
      ctx.save();
      ctx.translate(po.cx, po.cy);
      const pulse = .8 + .2 * Math.sin(t * 3);
      // outer ring
      ctx.rotate(t * .9);
      ctx.strokeStyle = "#b06bff"; ctx.lineWidth = 4;
      ctx.shadowColor = "#b06bff"; ctx.shadowBlur = 24 * pulse;
      ctx.beginPath();
      ctx.arc(0, 0, po.r, .3, Math.PI * 2 - .3);
      ctx.stroke();
      ctx.rotate(-t * 2.1);
      ctx.strokeStyle = "#e4d4ff"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, po.r - 9, 0, Math.PI * 1.4);
      ctx.stroke();
      // core
      ctx.rotate(t * .5);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
      g.addColorStop(0, "rgba(240,225,255,.95)");
      g.addColorStop(1, "rgba(176,107,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, OX.Utils.TAU);
      ctx.fill();
      // gate label
      ctx.rotate(0);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(228,212,255,.9)";
      ctx.font = "700 11px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText("EXIT", 0, -po.r - 12);
      ctx.restore();

      if (Math.random() < .4) OX.FX.portalSwirl(po.cx, po.cy, t);
    }

    /* ---------------- actors ---------------- */
    _body(ctx, x, y, w, h, facing, squash, stretch, main, dark, visor) {
      // squash/stretch factors
      const sq = 1 + stretch * .18 - squash * .16;
      const sw = 1 - stretch * .12 + squash * .18;
      const cx = x + w / 2, by = y + h;
      ctx.save();
      ctx.translate(cx, by);
      ctx.scale(sw, sq);
      ctx.translate(-cx, -by);

      // legs
      ctx.fillStyle = dark;
      ctx.fillRect(cx - 9, by - 10, 6, 10);
      ctx.fillRect(cx + 3, by - 10, 6, 10);
      // body capsule
      const g = ctx.createLinearGradient(0, y, 0, by);
      g.addColorStop(0, main);
      g.addColorStop(1, dark);
      ctx.fillStyle = g;
      this._roundRect(ctx, x + 1, y, w - 2, h - 6, 9);
      ctx.fill();
      // visor
      ctx.fillStyle = "#06121c";
      this._roundRect(ctx, x + 4, y + 7, w - 8, 13, 6);
      ctx.fill();
      ctx.fillStyle = visor;
      ctx.beginPath();
      ctx.arc(x + w / 2 + facing * 4.5, y + 13.5, 3.2, 0, OX.Utils.TAU);
      ctx.fill();
      // chest light
      ctx.fillStyle = visor;
      ctx.globalAlpha = .8;
      ctx.fillRect(cx - 2.5, by - 18, 5, 3);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    _roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    _player(ctx, pl, t) {
      if (pl.dead) return;
      // dash afterimages handled via trail particles in game update.
      ctx.save();
      ctx.shadowColor = "#35f0ff"; ctx.shadowBlur = 14;
      this._body(ctx, pl.x, pl.y, pl.w, pl.h, pl.facing, pl.squash, pl.stretch,
        "#49f2ff", "#1179a8", "#dffcff");
      ctx.restore();
    }

    _echo(ctx, e) {
      const fl = .72 + .28 * Math.sin(e.flicker * 9 + e.loopNo);
      const alpha = e.settled ? .38 + .08 * Math.sin(e.settleT * 2 + e.loopNo) : .62 * fl;
      ctx.save();
      ctx.globalAlpha = alpha;
      // chromatic ghosting
      ctx.shadowColor = "#ffb347"; ctx.shadowBlur = 10;
      this._body(ctx, e.x - 1.5, e.y, e.w, e.h, (e.pose & 16) ? 1 : (e.pose & 32) ? -1 : 1, 0, 0, "#ffc36e", "#8a5a1e", "#ffe9c9");
      // scanline
      ctx.globalAlpha = alpha * .5;
      ctx.fillStyle = "#ffd9a0";
      const sy = e.y + ((performance.now() / 12 + e.loopNo * 30) % e.h);
      ctx.fillRect(e.x + 3, sy, e.w - 6, 1.5);
      // loop number tag
      ctx.globalAlpha = alpha + .2;
      ctx.fillStyle = "#ffd9a0";
      ctx.font = "700 10px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText("L" + e.loopNo, e.cx, e.y - 8);
      ctx.restore();
    }
  }

  OX.Renderer = Renderer;
})();
