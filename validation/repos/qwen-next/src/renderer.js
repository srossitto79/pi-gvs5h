// REVERB — renderer: everything visible is driven by the reveal field.
// Solids are always faintly present; hazards appear only when light touches them.
(function (RV) {
  "use strict";
  const C = RV.config;
  const T = RV.TILES;
  const U = RV.utils;

  const COL = {
    bgTop: "#0a0c18",
    bgMid: "#101226",
    bgLow: "#161430",
    solid: [38, 44, 78],        // base rgb, brightened by lit
    solidEdge: [86, 98, 150],
    hidden: [120, 205, 255],
    crumble: [178, 128, 84],
    spike: [255, 77, 94],
    saw: [255, 86, 102],
    sawHub: [90, 20, 30],
    mover: [63, 212, 200],
    spring: [89, 230, 160],
    bell: [255, 200, 92],
    shard: [255, 210, 122],
    gate: [63, 212, 200],
    ring: [127, 216, 255],
    warn: [255, 120, 110],
    player: "#ffb86b",
    playerCore: "#fff2d0",
  };

  function rgb(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0];
  }

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dust = [];
    const rng = U.makeRng(1337);
    for (let i = 0; i < 90; i++) {
      this.dust.push({
        x: rng() * 4000, y: rng() * 2400,
        z: 0.25 + rng() * 0.5,           // parallax depth
        r: 0.8 + rng() * 1.6,
        tw: rng() * Math.PI * 2,
      });
    }
  }

  Renderer.prototype = {
    // ---------- main entry ----------
    draw(world, player, cam, tGlobal, W, H) {
      const ctx = this.ctx;
      const sh = cam.offset();
      const camX = Math.round(cam.x + sh.x), camY = Math.round(cam.y + sh.y);

      this.drawBackground(ctx, W, H, camX, camY, tGlobal);

      ctx.save();
      ctx.translate(-camX, -camY);

      const t = world.tile;
      const tx0 = Math.max(0, Math.floor(camX / t) - 1);
      const ty0 = Math.max(0, Math.floor(camY / t) - 1);
      const tx1 = Math.min(world.w - 1, Math.ceil((camX + W) / t) + 1);
      const ty1 = Math.min(world.h - 1, Math.ceil((camY + H) / t) + 1);

      this.drawTiles(world, tx0, ty0, tx1, ty1, tGlobal);
      this.drawMovers(world, tGlobal);
      this.drawBells(world, tGlobal);
      this.drawShards(world, tGlobal);
      this.drawExit(world, tGlobal);
      this.drawSaws(world, tGlobal);
      this.drawRings(world);
      this.drawPlayer(player, tGlobal);

      ctx.restore();
      this.drawVignette(ctx, W, H);
    },

    // ---------- background ----------
    drawBackground(ctx, W, H, camX, camY, tGlobal) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, COL.bgTop);
      g.addColorStop(0.55, COL.bgMid);
      g.addColorStop(1, COL.bgLow);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // slow-breathing nebula blobs for depth
      const breathe = 0.5 + 0.5 * Math.sin(tGlobal * 0.11);
      ctx.save();
      ctx.globalAlpha = 0.05 + 0.03 * breathe;
      const nb = ctx.createRadialGradient(W * 0.7, H * 0.25, 0, W * 0.7, H * 0.25, W * 0.45);
      nb.addColorStop(0, "#3a4a8f");
      nb.addColorStop(1, "transparent");
      ctx.fillStyle = nb;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // parallax dust
      ctx.save();
      for (const d of this.dust) {
        const x = ((d.x - camX * d.z) % (W + 200) + W + 200) % (W + 200) - 100;
        const y = ((d.y - camY * d.z) % (H + 200) + H + 200) % (H + 200) - 100;
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(tGlobal * 1.4 + d.tw));
        ctx.globalAlpha = 0.16 * d.z * tw;
        ctx.fillStyle = "#aac6ff";
        ctx.beginPath();
        ctx.arc(x, y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    // ---------- tiles ----------
    drawTiles(world, tx0, ty0, tx1, ty1, tGlobal) {
      const ctx = this.ctx;
      const t = world.tile;
      const rev = world.reveal;
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const tt = world.tiles[ty * world.w + tx];
          if (tt === T.EMPTY) continue;
          const lit = rev.litAtTile(tx, ty);
          const x = tx * t, y = ty * t;

          switch (tt) {
            case T.SOLID: {
              // always present, brightness follows light
              const b = 0.30 + 0.70 * lit;
              const c = mix([26, 30, 52], COL.solid, Math.min(1, lit * 1.4));
              ctx.fillStyle = rgb(c, 0.55 + 0.45 * b);
              ctx.fillRect(x, y, t, t);
              // top edge highlight only when a neighbour above is empty
              if (world.tileAt(tx, ty - 1) === T.EMPTY || world.tileAt(tx, ty - 1) === T.SPRING) {
                ctx.fillStyle = rgb(mix([40, 48, 82], COL.solidEdge, lit), 0.5 + 0.5 * lit);
                ctx.fillRect(x, y, t, 3);
              }
              // faint inner grid
              ctx.strokeStyle = "rgba(120,140,200," + (0.05 + 0.10 * lit) + ")";
              ctx.strokeRect(x + 0.5, y + 0.5, t - 1, t - 1);
              break;
            }
            case T.HIDDEN: {
              if (lit <= 0.02) break;
              ctx.fillStyle = rgb(COL.hidden, 0.10 + 0.35 * lit);
              ctx.fillRect(x + 1, y + 1, t - 2, t - 2);
              ctx.strokeStyle = rgb(COL.hidden, 0.25 + 0.6 * lit);
              ctx.lineWidth = 1.5;
              ctx.setLineDash([5, 4]);
              ctx.strokeRect(x + 2.5, y + 2.5, t - 5, t - 5);
              ctx.setLineDash([]);
              ctx.lineWidth = 1;
              break;
            }
            case T.CRUMBLE: {
              const cr = world.crumbleMap[ty * world.w + tx];
              if (!cr || cr.broken) break;
              const shaking = cr.timer > 0;
              const jx = shaking ? (Math.random() - 0.5) * 3 : 0;
              const jy = shaking ? (Math.random() - 0.5) * 3 : 0;
              const a = 0.12 + 0.85 * lit;
              if (a > 0.05) {
                ctx.fillStyle = rgb(COL.crumble, a * 0.5);
                ctx.fillRect(x + jx, y + jy, t, t);
                ctx.strokeStyle = rgb(COL.crumble, a);
                ctx.strokeRect(x + jx + 1.5, y + jy + 1.5, t - 3, t - 3);
                // crack marks
                ctx.beginPath();
                ctx.moveTo(x + jx + 6, y + jy + 8);
                ctx.lineTo(x + jx + 14, y + jy + 16);
                ctx.lineTo(x + jx + 9, y + jy + 24);
                ctx.moveTo(x + jx + 20, y + jy + 6);
                ctx.lineTo(x + jx + 24, y + jy + 18);
                ctx.stroke();
              }
              break;
            }
            case T.SPRING: {
              if (lit <= 0.03) break;
              this.drawSpring(world, tx, ty, t, lit);
              break;
            }
            case T.SPIKE_U: this.drawSpike(x, y, t, lit, 0); break;
            case T.SPIKE_D: this.drawSpike(x, y, t, lit, 2); break;
            case T.SPIKE_L: this.drawSpike(x, y, t, lit, 3); break;
            case T.SPIKE_R: this.drawSpike(x, y, t, lit, 1); break;
          }
        }
      }
    },

    // dir: 0=up, 1=right, 2=down, 3=left
    drawSpike(x, y, t, lit, dir) {
      if (lit <= 0.02) return;
      const ctx = this.ctx;
      const a = Math.min(1, lit * 1.2);
      ctx.save();
      ctx.translate(x + t / 2, y + t / 2);
      ctx.rotate(dir * Math.PI / 2);
      ctx.translate(-t / 2, -t / 2);
      // spikes point up in local space
      ctx.fillStyle = rgb(COL.spike, 0.25 + 0.75 * a);
      ctx.beginPath();
      const n = 3, w = t / n;
      for (let i = 0; i < n; i++) {
        ctx.moveTo(i * w + 1, t);
        ctx.lineTo(i * w + w / 2, t - 13);
        ctx.lineTo(i * w + w - 1, t);
      }
      ctx.fill();
      if (a > 0.5) {
        ctx.strokeStyle = rgb(COL.spike, (a - 0.5) * 1.4);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    },

    drawSpring(world, tx, ty, t, lit) {
      const ctx = this.ctx;
      const sp = world.springs.find((s) => s.tx === tx && s.ty === ty);
      const press = sp && sp.t > 0 ? Math.sin((sp.t / 0.3) * Math.PI) * 6 : 0;
      const x = tx * t, y = ty * t;
      const a = Math.min(1, lit * 1.3);
      ctx.fillStyle = rgb(COL.spring, 0.3 + 0.6 * a);
      ctx.fillRect(x + 4, y + t - 8, t - 8, 8);
      ctx.strokeStyle = rgb(COL.spring, 0.4 + 0.6 * a);
      ctx.beginPath();
      const top = y + t - 10 - press;
      ctx.moveTo(x + 6, y + t - 8);
      ctx.lineTo(x + 11, top + 4);
      ctx.lineTo(x + 16, y + t - 8);
      ctx.lineTo(x + 21, top + 4);
      ctx.lineTo(x + 26, y + t - 8);
      ctx.stroke();
      ctx.fillStyle = rgb(COL.spring, 0.5 + 0.5 * a);
      ctx.fillRect(x + 5, top - 2, t - 10, 4);
    },

    // ---------- entities ----------
    drawMovers(world, tGlobal) {
      const ctx = this.ctx;
      for (const m of world.movers) {
        const x = m.x, y = m.y;
        ctx.fillStyle = rgb(COL.mover, 0.22);
        ctx.fillRect(x, y, m.w, 19);
        ctx.strokeStyle = rgb(COL.mover, 0.85);
        ctx.strokeRect(x + 0.5, y + 0.5, m.w - 1, 18);
        // energy line
        ctx.fillStyle = rgb(COL.mover, 0.5 + 0.3 * Math.sin(tGlobal * 6));
        ctx.fillRect(x + 3, y + 8, m.w - 6, 2);
      }
    },

    drawBells(world, tGlobal) {
      const ctx = this.ctx;
      for (const b of world.bells) {
        const lit = world.reveal.litAtTile(Math.floor(b.x / world.tile), Math.floor(b.y / world.tile));
        const a = b.resonant ? 1 : 0.15 + 0.85 * lit;
        if (a <= 0.05) continue;
        ctx.save();
        ctx.translate(b.x, b.y);
        if (b.resonant) {
          const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 46);
          glow.addColorStop(0, "rgba(255,200,92,0.35)");
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.fillRect(-46, -46, 92, 92);
        }
        const sway = Math.sin(tGlobal * (b.resonant ? 9 : 2.2)) * (b.resonant ? 0.25 : 0.08);
        ctx.rotate(sway);
        ctx.fillStyle = rgb(COL.bell, a);
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.quadraticCurveTo(12, -12, 12, 4);
        ctx.lineTo(14, 8);
        ctx.lineTo(-14, 8);
        ctx.lineTo(-12, 4);
        ctx.quadraticCurveTo(-12, -12, 0, -16);
        ctx.fill();
        ctx.fillStyle = rgb([255, 236, 180], a);
        ctx.beginPath();
        ctx.arc(0, 11, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // expanding bell rings
      for (const r of world.bellRings) {
        ctx.strokeStyle = "rgba(255,205,110," + (0.5 * Math.max(0, r.life)) + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    },

    drawShards(world, tGlobal) {
      const ctx = this.ctx;
      for (const s of world.shards) {
        if (s.taken) continue;
        const pulse = 0.7 + 0.3 * Math.sin(tGlobal * 3 + s.id * 1.7);
        const bob = Math.sin(tGlobal * 2 + s.id) * 3;
        ctx.save();
        ctx.translate(s.x, s.y + bob);
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
        glow.addColorStop(0, "rgba(255,210,122," + (0.28 * pulse) + ")");
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.fillRect(-22, -22, 44, 44);
        ctx.rotate(tGlobal * 0.8 + s.id);
        ctx.fillStyle = rgb(COL.shard, 0.9);
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(6, 0);
        ctx.lineTo(0, 9);
        ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(2.5, 0);
        ctx.lineTo(0, 4);
        ctx.lineTo(-2.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },

    drawExit(world, tGlobal) {
      const e = world.exit;
      const ctx = this.ctx;
      const pulse = 0.6 + 0.4 * Math.sin(tGlobal * 2.4);
      // arch
      const x = e.x, y = e.y, w = e.w, h = e.h;
      ctx.fillStyle = rgb(COL.gate, 0.10 + 0.10 * pulse);
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = rgb(COL.gate, 0.55 + 0.35 * pulse);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + h);
      ctx.lineTo(x + 2, y + w / 2);
      ctx.arc(x + w / 2, y + w / 2, w / 2 - 2, Math.PI, 0);
      ctx.lineTo(x + w - 2, y + h);
      ctx.stroke();
      ctx.lineWidth = 1;
      // inner shimmer
      for (let i = 0; i < 4; i++) {
        const yy = y + 14 + ((tGlobal * 40 + i * 18) % (h - 20));
        ctx.fillStyle = "rgba(150,255,240," + (0.10 + 0.10 * pulse) + ")";
        ctx.fillRect(x + 6, yy, w - 12, 2);
      }
    },

    drawSaws(world, tGlobal) {
      const ctx = this.ctx;
      for (const s of world.saws) {
        const lit = world.reveal.litOverRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
        if (lit <= 0.02) continue;
        const a = Math.min(1, lit * 1.25);
        ctx.save();
        ctx.translate(s.x, s.y);
        if (a > 0.45) {
          const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, s.r * 2.1);
          glow.addColorStop(0, "rgba(255,70,90," + (0.22 * a) + ")");
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.fillRect(-s.r * 2.1, -s.r * 2.1, s.r * 4.2, s.r * 4.2);
        }
        ctx.rotate(tGlobal * 9);
        // teeth
        ctx.fillStyle = rgb(COL.saw, 0.3 + 0.7 * a);
        const n = 8;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2;
          ctx.lineTo(Math.cos(a0) * s.r, Math.sin(a0) * s.r);
          ctx.lineTo(Math.cos(a1) * (s.r * 0.72), Math.sin(a1) * (s.r * 0.72));
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = rgb(COL.sawHub, 0.4 + 0.6 * a);
        ctx.beginPath();
        ctx.arc(0, 0, s.r * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },

    // ---------- reveal rings ----------
    drawRings(world) {
      const ctx = this.ctx;
      for (const ring of world.reveal.rings) {
        const fade = 1 - ring.r / ring.maxR;
        const base = ring.warn ? COL.warn : COL.ring;
        ctx.strokeStyle = rgb(base, 0.5 * fade * ring.strength + 0.06);
        ctx.lineWidth = 2 + 3 * fade;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    },

    // ---------- player ----------
    drawPlayer(player, tGlobal) {
      const ctx = this.ctx;
      if (player.dead) return;
      // invulnerability flicker
      if (player.invuln > 0 && Math.floor(tGlobal * 14) % 2 === 0) return;

      const c = player.center();
      // warm presence glow
      const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 90);
      glow.addColorStop(0, "rgba(255,184,107,0.20)");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(c.x - 90, c.y - 90, 180, 180);

      const sq = player.squash; // 1 = neutral; <1 squashed
      const w = player.w * (2 - sq), h = player.h * sq;
      const x = c.x - w / 2, y = c.y + player.h / 2 - h;

      ctx.save();
      // body
      ctx.fillStyle = COL.player;
      roundRect(ctx, x, y, w, h, 5);
      ctx.fill();
      // inner core
      ctx.fillStyle = COL.playerCore;
      roundRect(ctx, x + w * 0.22, y + h * 0.24, w * 0.56, h * 0.5, 3);
      ctx.fill();
      // eyes show facing
      ctx.fillStyle = "#20243c";
      const ex = c.x + player.facing * w * 0.18;
      ctx.fillRect(ex - 2, y + h * 0.3, 3.4, 5.4);
      ctx.fillRect(ex + 3.4, y + h * 0.3, 3.4, 5.4);
      ctx.restore();
    },

    // ---------- post ----------
    drawVignette(ctx, W, H) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
      g.addColorStop(0, "transparent");
      g.addColorStop(1, "rgba(4,5,12,0.55)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    },
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  RV.Renderer = Renderer;
})(window.RV = window.RV || {});
