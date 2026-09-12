/* LODESTAR — renderer.
 * All in-game visuals are drawn here on a 2D canvas. The look is a warm/cool
 * polarity palette over dark iron caverns: amber = attract/floor, cyan =
 * repel/ceiling. Uses layered parallax, glow (additive) and deterministic
 * seeded decoration so every level looks hand-placed but stable.
 */
window.LD = window.LD || {};

LD.Renderer = (function () {
  const U = LD.U, C = LD.CONFIG, T = C.TILE, PAL = U.PAL;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.resize();
      // deterministic decoration per level
      this.deco = null;
      this.decoLevel = -1;
      this.time = 0;
    }

    resize() {
      const w = C.VIEW_W, h = C.VIEW_H;
      this.canvas.width = w * this.dpr;
      this.canvas.height = h * this.dpr;
      this.canvas.style.width = w + "px";
      this.canvas.style.height = h + "px";
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    // build stable decorative features for a level (rocks, veins, motes)
    buildDeco(world) {
      if (this.decoLevel === world.id) return;
      this.decoLevel = world.id;
      const rng = U.rng(world.id * 99991 + 7);
      const rocks = [], veins = [], motes = [];
      const W = world.w * T, H = world.h * T;
      const nRocks = Math.floor(W / 140);
      for (let i = 0; i < nRocks; i++) {
        rocks.push({
          x: rng() * W, y: rng() * H,
          r: 30 + rng() * 90,
          shade: 0.5 + rng() * 0.5,
          layer: rng() < 0.5 ? 0.35 : 0.6,   // parallax factor
        });
      }
      const nVeins = Math.floor(W / 220);
      for (let i = 0; i < nVeins; i++) {
        veins.push({
          x: rng() * W, y: rng() * H,
          len: 60 + rng() * 160,
          ang: rng() * U.TAU,
          amber: rng() < 0.5,
        });
      }
      const nMotes = 60;
      for (let i = 0; i < nMotes; i++) {
        motes.push({
          x: rng() * W, y: rng() * H,
          r: 0.6 + rng() * 1.8,
          sp: 4 + rng() * 14,
          ph: rng() * U.TAU,
        });
      }
      this.deco = { rocks, veins, motes, W, H };
    }

    // ------------------------------------------------------------------
    //  background
    // ------------------------------------------------------------------
    drawBackground(ctx, cam, world) {
      const W = C.VIEW_W, H = C.VIEW_H;
      // vertical gradient
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, PAL.bgTop);
      g.addColorStop(1, PAL.bgBot);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      const d = this.deco;
      if (!d) return;

      // distant rock silhouettes (parallax)
      for (const r of d.rocks) {
        const px = r.x - cam.ox * r.layer;
        const py = r.y - cam.oy * r.layer;
        const sx = ((px % (W + 200)) + (W + 200)) % (W + 200) - 100;
        const sy = ((py % (H + 200)) + (H + 200)) % (H + 200) - 100;
        const col = U.mix(PAL.ironDark, PAL.iron, r.shade * 0.4);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy, r.r, r.r * 0.7, 0, 0, U.TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // mineral veins (faint glowing lines)
      ctx.lineWidth = 2;
      for (const v of d.veins) {
        const px = v.x - cam.ox * 0.5;
        const py = v.y - cam.oy * 0.5;
        const sx = ((px % (W + 200)) + (W + 200)) % (W + 200) - 100;
        const sy = ((py % (H + 200)) + (H + 200)) % (H + 200) - 100;
        const ex = sx + Math.cos(v.ang) * v.len;
        const ey = sy + Math.sin(v.ang) * v.len;
        ctx.strokeStyle = v.amber ? U.rgba(PAL.amber, 0.10) : U.rgba(PAL.cyan, 0.10);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      }

      // floating dust motes
      for (const m of d.motes) {
        const t = this.time * 0.2 + m.ph;
        const px = m.x - cam.ox * 0.7;
        const py = (m.y - cam.oy * 0.7 + Math.sin(t) * 10 - this.time * m.sp) % H;
        const sx = ((px % W) + W) % W;
        const sy = ((py % H) + H) % H;
        ctx.fillStyle = U.rgba(PAL.ink, 0.12 + 0.08 * Math.sin(t));
        ctx.beginPath(); ctx.arc(sx, sy, m.r, 0, U.TAU); ctx.fill();
      }
    }

    // ------------------------------------------------------------------
    //  tiles
    // ------------------------------------------------------------------
    drawTiles(ctx, cam, world) {
      const x0 = Math.max(0, Math.floor(cam.ox / T) - 1);
      const x1 = Math.min(world.w - 1, Math.ceil((cam.ox + C.VIEW_W) / T) + 1);
      const y0 = Math.max(0, Math.floor(cam.oy / T) - 1);
      const y1 = Math.min(world.h - 1, Math.ceil((cam.oy + C.VIEW_H) / T) + 1);

      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const v = world.tiles[ty][tx];
          if (v === 0) continue;
          const x = tx * T - cam.ox, y = ty * T - cam.oy;
          if (v === 1) this.drawSolid(ctx, x, y, tx, ty, world);
          else if (v === 2) this.drawPlatform(ctx, x, y);
        }
      }
    }

    drawSolid(ctx, x, y, tx, ty, world) {
      // base
      ctx.fillStyle = PAL.iron;
      ctx.fillRect(x, y, T, T);
      // top edge highlight (light from above)
      ctx.fillStyle = PAL.ironEdge;
      ctx.fillRect(x, y, T, 3);
      // bottom shadow
      ctx.fillStyle = PAL.ironDark;
      ctx.fillRect(x, y + T - 4, T, 4);
      // subtle inner texture: a couple of rivets
      ctx.fillStyle = U.rgba(PAL.ironDark, 0.5);
      ctx.fillRect(x + 6, y + 8, 3, 3);
      ctx.fillRect(x + T - 9, y + T - 12, 3, 3);
      // occasional rust fleck (deterministic)
      const h = (tx * 73856093) ^ (ty * 19349663);
      if ((h & 7) === 0) {
        ctx.fillStyle = U.rgba(PAL.ironRust, 0.5);
        ctx.fillRect(x + ((h >> 3) % (T - 8)), y + ((h >> 5) % (T - 8)), 5, 4);
      }
    }

    drawPlatform(ctx, x, y) {
      ctx.fillStyle = PAL.ironEdge;
      ctx.fillRect(x, y, T, 6);
      ctx.fillStyle = PAL.iron;
      ctx.fillRect(x, y + 6, T, 4);
      ctx.fillStyle = U.rgba(PAL.ink, 0.15);
      ctx.fillRect(x, y, T, 2);
    }

    // ------------------------------------------------------------------
    //  fields (magnetic updrafts)
    // ------------------------------------------------------------------
    drawFields(ctx, cam, world) {
      for (const f of world.fields) {
        const x = f.x - cam.ox, y = f.y - cam.oy;
        if (x < -f.r || x > C.VIEW_W + f.r || y < -f.r || y > C.VIEW_H + f.r) continue;
        const pulse = 0.5 + 0.5 * Math.sin(f.phase * 2);
        const grad = ctx.createRadialGradient(x, y, 4, x, y, f.r);
        grad.addColorStop(0, U.rgba(PAL.cyan, 0.22 + pulse * 0.1));
        grad.addColorStop(0.6, U.rgba(PAL.cyan, 0.08));
        grad.addColorStop(1, U.rgba(PAL.cyan, 0));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, f.r, 0, U.TAU); ctx.fill();
        // rising chevrons
        ctx.strokeStyle = U.rgba(PAL.cyanHot, 0.3 + pulse * 0.2);
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const yy = y + 30 - ((this.time * 40 + i * 26) % 70);
          ctx.beginPath();
          ctx.moveTo(x - 10, yy + 6);
          ctx.lineTo(x, yy);
          ctx.lineTo(x + 10, yy + 6);
          ctx.stroke();
        }
      }
    }

    // ------------------------------------------------------------------
    //  gates
    // ------------------------------------------------------------------
    drawGates(ctx, cam, world) {
      for (const g of world.gates) {
        const x = g.x - cam.ox;
        if (x < -40 || x > C.VIEW_W + 40) continue;
        const col = g.pol === 1 ? PAL.amber : PAL.cyan;
        const hot = g.pol === 1 ? PAL.amberHot : PAL.cyanHot;
        const H = world.h * T;
        const yTop = -cam.oy, yBot = H - cam.oy;
        const pulse = 0.5 + 0.5 * Math.sin(g.pulse * 4);
        if (g.open) {
          // faint open shimmer
          ctx.fillStyle = U.rgba(col, 0.05 + pulse * 0.03);
          ctx.fillRect(x - 4, yTop, 8, yBot - yTop);
        } else {
          // solid barrier
          const grad = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
          grad.addColorStop(0, U.rgba(col, 0));
          grad.addColorStop(0.5, U.rgba(hot, 0.55 + pulse * 0.2));
          grad.addColorStop(1, U.rgba(col, 0));
          ctx.fillStyle = grad;
          ctx.fillRect(x - 10, yTop, 20, yBot - yTop);
          // core line
          ctx.fillStyle = U.rgba(hot, 0.9);
          ctx.fillRect(x - 1.5, yTop, 3, yBot - yTop);
          // energy nodes
          for (let yy = yTop + 20; yy < yBot; yy += 46) {
            ctx.fillStyle = U.rgba(hot, 0.8);
            ctx.beginPath(); ctx.arc(x, yy, 3 + pulse * 2, 0, U.TAU); ctx.fill();
          }
        }
        // polarity emblem at the top
        this.drawPolarityMark(ctx, x, yTop + 18, g.pol, 10, col, hot);
      }
    }

    drawPolarityMark(ctx, x, y, pol, r, col, hot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = hot;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, U.TAU); ctx.stroke();
      ctx.fillStyle = hot;
      if (pol === 1) {
        // down arrow (attract / floor)
        ctx.beginPath();
        ctx.moveTo(0, r * 0.5); ctx.lineTo(-r * 0.4, -r * 0.2);
        ctx.lineTo(r * 0.4, -r * 0.2); ctx.closePath(); ctx.fill();
      } else {
        // up arrow (repel / ceiling)
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.5); ctx.lineTo(-r * 0.4, r * 0.2);
        ctx.lineTo(r * 0.4, r * 0.2); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    // ------------------------------------------------------------------
    //  spikes
    // ------------------------------------------------------------------
    drawSpikes(ctx, cam, world) {
      for (const s of world.spikes) {
        const x = s.x - cam.ox, y = s.y - cam.oy;
        if (x < -T || x > C.VIEW_W + T || y < -T || y > C.VIEW_H + T) continue;
        ctx.fillStyle = PAL.ironEdge;
        ctx.strokeStyle = U.rgba(PAL.danger, 0.6);
        ctx.lineWidth = 1.5;
        const n = 3, w = T / n;
        for (let i = 0; i < n; i++) {
          const bx = x - T / 2 + i * w;
          ctx.beginPath();
          if (s.dir === 1) {
            ctx.moveTo(bx, y + T / 2);
            ctx.lineTo(bx + w / 2, y - T / 2);
            ctx.lineTo(bx + w, y + T / 2);
          } else {
            ctx.moveTo(bx, y - T / 2);
            ctx.lineTo(bx + w / 2, y + T / 2);
            ctx.lineTo(bx + w, y - T / 2);
          }
          ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
      }
    }

    // ------------------------------------------------------------------
    //  movers
    // ------------------------------------------------------------------
    drawMovers(ctx, cam, world) {
      for (const m of world.movers) {
        const x = m.x - m.w / 2 - cam.ox, y = m.y - m.h / 2 - cam.oy;
        if (x < -T || x > C.VIEW_W + T || y < -T || y > C.VIEW_H + T) continue;
        ctx.fillStyle = PAL.ironEdge;
        ctx.fillRect(x, y, m.w, m.h);
        ctx.fillStyle = PAL.iron;
        ctx.fillRect(x + 2, y + 2, m.w - 4, m.h - 4);
        ctx.fillStyle = U.rgba(PAL.amber, 0.5);
        ctx.fillRect(x + 4, y + m.h / 2 - 1, m.w - 8, 2);
      }
    }

    // ------------------------------------------------------------------
    //  checkpoints
    // ------------------------------------------------------------------
    drawCheckpoints(ctx, cam, world) {
      for (const c of world.checkpoints) {
        const x = c.x - cam.ox, y = c.y - cam.oy;
        if (x < -T || x > C.VIEW_W + T || y < -T || y > C.VIEW_H + T) continue;
        const on = c.active;
        const col = on ? PAL.gold : PAL.dim;
        // post
        ctx.fillStyle = PAL.ironEdge;
        ctx.fillRect(x - 2, y - 6, 4, T * 0.7);
        // beacon
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
        ctx.fillStyle = U.rgba(col, on ? 0.9 : 0.4);
        ctx.beginPath(); ctx.arc(x, y - 8, on ? 6 + pulse * 2 : 5, 0, U.TAU); ctx.fill();
        if (on) {
          ctx.fillStyle = U.rgba(PAL.gold, 0.2);
          ctx.beginPath(); ctx.arc(x, y - 8, 14 + pulse * 4, 0, U.TAU); ctx.fill();
        }
      }
    }

    // ------------------------------------------------------------------
    //  portal
    // ------------------------------------------------------------------
    drawPortal(ctx, cam, world) {
      const p = world.portal;
      const x = p.x - cam.ox, y = p.y - cam.oy;
      if (x < -80 || x > C.VIEW_W + 80 || y < -80 || y > C.VIEW_H + 80) return;
      const t = p.phase;
      // outer glow
      const grad = ctx.createRadialGradient(x, y, 4, x, y, 46);
      grad.addColorStop(0, U.rgba(PAL.portal, 0.5));
      grad.addColorStop(0.5, U.rgba(PAL.portal, 0.18));
      grad.addColorStop(1, U.rgba(PAL.portal, 0));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(x, y, 46, 0, U.TAU); ctx.fill();
      // swirling rings
      for (let i = 0; i < 3; i++) {
        const a = t * (1.5 + i * 0.4) + i * 2;
        const r = 16 + i * 8;
        ctx.strokeStyle = U.rgba(i % 2 ? PAL.cyanHot : PAL.amberHot, 0.7 - i * 0.15);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, r, a, a + Math.PI * 1.3);
        ctx.stroke();
      }
      // core
      ctx.fillStyle = U.rgba(PAL.ink, 0.9);
      ctx.beginPath(); ctx.arc(x, y, 6 + Math.sin(t * 3) * 2, 0, U.TAU); ctx.fill();
    }

    // ------------------------------------------------------------------
    //  shards
    // ------------------------------------------------------------------
    drawShards(ctx, cam, world) {
      for (const s of world.shards) {
        if (s.collected) continue;
        const x = s.x - cam.ox, y = s.y - cam.oy;
        if (x < -20 || x > C.VIEW_W + 20 || y < -20 || y > C.VIEW_H + 20) continue;
        const bob = Math.sin(s.phase) * 2;
        const r = C.SHARD.R;
        // glow
        const grad = ctx.createRadialGradient(x, y + bob, 1, x, y + bob, r * 2.4);
        grad.addColorStop(0, U.rgba(PAL.amberHot, 0.5));
        grad.addColorStop(1, U.rgba(PAL.amber, 0));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y + bob, r * 2.4, 0, U.TAU); ctx.fill();
        // diamond
        ctx.save();
        ctx.translate(x, y + bob);
        ctx.rotate(Math.PI / 4 + Math.sin(s.phase * 0.5) * 0.15);
        ctx.fillStyle = PAL.amber;
        ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
        ctx.fillStyle = PAL.amberHot;
        ctx.fillRect(-r * 0.35, -r * 0.35, r * 0.7, r * 0.7);
        ctx.restore();
      }
    }

    // ------------------------------------------------------------------
    //  enemies
    // ------------------------------------------------------------------
    drawEnemies(ctx, cam, world) {
      for (const e of world.enemies) {
        if (e.dead) continue;
        const x = e.cx - cam.ox, y = e.cy - cam.oy;
        if (x < -40 || x > C.VIEW_W + 40 || y < -40 || y > C.VIEW_H + 40) continue;
        if (e.type === "crawler") {
          // iron beetle
          ctx.fillStyle = PAL.ironEdge;
          ctx.beginPath();
          ctx.ellipse(x, y, e.w / 2, e.h / 2, 0, 0, U.TAU);
          ctx.fill();
          ctx.fillStyle = PAL.ironDark;
          ctx.beginPath();
          ctx.ellipse(x, y + 2, e.w / 2 - 3, e.h / 2 - 4, 0, 0, U.TAU);
          ctx.fill();
          // spikes
          ctx.fillStyle = PAL.danger;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * 8 - 3, y - e.h / 2);
            ctx.lineTo(x + i * 8, y - e.h / 2 - 6);
            ctx.lineTo(x + i * 8 + 3, y - e.h / 2);
            ctx.closePath(); ctx.fill();
          }
          // eye
          ctx.fillStyle = PAL.danger;
          ctx.beginPath(); ctx.arc(x + e.dir * 6, y - 2, 3, 0, U.TAU); ctx.fill();
        } else {
          // floater orb
          const pulse = 0.5 + 0.5 * Math.sin(e.phase * 3);
          const grad = ctx.createRadialGradient(x, y, 1, x, y, 16);
          grad.addColorStop(0, U.rgba(PAL.danger, 0.8));
          grad.addColorStop(1, U.rgba(PAL.danger, 0));
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(x, y, 16, 0, U.TAU); ctx.fill();
          ctx.fillStyle = U.rgba(PAL.ink, 0.9);
          ctx.beginPath(); ctx.arc(x, y, 5 + pulse * 2, 0, U.TAU); ctx.fill();
        }
      }
    }

    // ------------------------------------------------------------------
    //  player — the magnetic spark
    // ------------------------------------------------------------------
    drawPlayer(ctx, cam, world) {
      const p = world.player;
      if (p.dead) return;
      const x = p.cx - cam.ox, y = p.cy - cam.oy;
      const col = p.pol === 1 ? PAL.amber : PAL.cyan;
      const hot = p.pol === 1 ? PAL.amberHot : PAL.cyanHot;
      const deep = p.pol === 1 ? PAL.amberDeep : PAL.cyanDeep;

      // blink while invulnerable
      if (p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0) ctx.globalAlpha = 0.4;

      // squash & stretch
      const sx = 2 - p.squash;
      const sy = p.squash;
      const w = p.w * 0.5 * sx, h = p.h * 0.5 * sy;

      // aura
      const grad = ctx.createRadialGradient(x, y, 2, x, y, 34);
      grad.addColorStop(0, U.rgba(hot, 0.5));
      grad.addColorStop(0.5, U.rgba(col, 0.18));
      grad.addColorStop(1, U.rgba(col, 0));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(x, y, 34, 0, U.TAU); ctx.fill();

      // body (rounded diamond)
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sx, sy);
      ctx.rotate(Math.PI / 4);
      const bw = p.w * 0.62, bh = p.h * 0.62;
      const bg = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
      bg.addColorStop(0, hot);
      bg.addColorStop(1, deep);
      ctx.fillStyle = bg;
      this.roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 5);
      ctx.fill();
      // core
      ctx.fillStyle = U.rgba(PAL.ink, 0.95);
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, U.TAU); ctx.fill();
      ctx.restore();

      // polarity ring
      ctx.strokeStyle = U.rgba(hot, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 15, 0, U.TAU); ctx.stroke();
      // polarity arrow
      this.drawPolarityMark(ctx, x, y, p.pol, 8, col, hot);

      // flip ring
      if (p.flipAnim > 0) {
        const t = 1 - p.flipAnim / C.PLAYER.FLIP_TIME;
        ctx.strokeStyle = U.rgba(hot, (1 - t) * 0.8);
        ctx.lineWidth = 3 * (1 - t) + 1;
        ctx.beginPath(); ctx.arc(x, y, 15 + t * 30, 0, U.TAU); ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }

    roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    // ------------------------------------------------------------------
    //  vignette
    // ------------------------------------------------------------------
    drawVignette(ctx) {
      const W = C.VIEW_W, H = C.VIEW_H;
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.85);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // ------------------------------------------------------------------
    //  main
    // ------------------------------------------------------------------
    render(world, cam) {
      const ctx = this.ctx;
      this.time += 1 / 60;
      this.buildDeco(world);
      ctx.clearRect(0, 0, C.VIEW_W, C.VIEW_H);
      this.drawBackground(ctx, cam, world);
      this.drawFields(ctx, cam, world);
      this.drawTiles(ctx, cam, world);
      this.drawSpikes(ctx, cam, world);
      this.drawMovers(ctx, cam, world);
      this.drawCheckpoints(ctx, cam, world);
      this.drawGates(ctx, cam, world);
      this.drawPortal(ctx, cam, world);
      this.drawShards(ctx, cam, world);
      this.drawEnemies(ctx, cam, world);
      LD.Particles.draw(ctx, cam.ox, cam.oy);
      this.drawPlayer(ctx, cam, world);
      this.drawVignette(ctx);
    }
  }

  return { Renderer };
})();
