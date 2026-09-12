/* LODESTAR — UI. HUD + full-screen states drawn on the canvas so the whole
 * game shares one visual language. The game object passes in the data it
 * needs; UI never mutates game state (it only reports button/key intent via
 * the returned `action` the game loop reads).
 */
window.LD = window.LD || {};

LD.UI = (function () {
  const U = LD.U, C = LD.CONFIG, PAL = U.PAL;
  const W = C.VIEW_W, H = C.VIEW_H;

  function font(size, weight = 700) {
    return `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  }

  function text(ctx, str, x, y, { size = 16, color = PAL.ink, align = "left",
    weight = 700, glow = null, alpha = 1 } = {}) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = font(size, weight);
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function panel(ctx, x, y, w, h, r = 12) {
    ctx.save();
    ctx.fillStyle = "rgba(10,13,20,0.82)";
    ctx.strokeStyle = U.rgba(PAL.amber, 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function keyCap(ctx, label, x, y, w = 30, h = 26) {
    ctx.save();
    ctx.fillStyle = "rgba(30,36,50,0.9)";
    ctx.strokeStyle = U.rgba(PAL.ink, 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 5) : ctx.rect(x, y, w, h);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    text(ctx, label, x + w / 2, y + h / 2 + 1, { size: 13, align: "center", color: PAL.ink });
  }

  // ------------------------------------------------------------------
  //  HUD
  // ------------------------------------------------------------------
  function drawHUD(ctx, world, game) {
    const p = world.player;
    // top-left: level
    panel(ctx, 14, 12, 210, 54, 10);
    text(ctx, `LEVEL ${world.id}`, 28, 30, { size: 12, color: PAL.dim, weight: 600 });
    text(ctx, world.name, 28, 50, { size: 19, color: PAL.ink });

    // top-right: shards + time
    panel(ctx, W - 224, 12, 210, 54, 10);
    // shard icon
    ctx.save();
    ctx.translate(W - 200, 39);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PAL.amber;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = PAL.amberHot;
    ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.restore();
    text(ctx, `${world.shardCount} / ${world.totalShards}`, W - 182, 39, { size: 18, color: PAL.amber });
    text(ctx, fmtTime(world.time), W - 118, 39, { size: 18, color: PAL.ink, align: "right" });

    // polarity indicator (bottom-left)
    const col = p.pol === 1 ? PAL.amber : PAL.cyan;
    const hot = p.pol === 1 ? PAL.amberHot : PAL.cyanHot;
    panel(ctx, 14, H - 58, 190, 44, 10);
    ctx.save();
    ctx.translate(38, H - 36);
    ctx.strokeStyle = hot; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, U.TAU); ctx.stroke();
    ctx.fillStyle = hot;
    ctx.beginPath();
    if (p.pol === 1) { ctx.moveTo(0, 6); ctx.lineTo(-5, -3); ctx.lineTo(5, -3); }
    else { ctx.moveTo(0, -6); ctx.lineTo(-5, 3); ctx.lineTo(5, 3); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
    text(ctx, p.pol === 1 ? "ATTRACT" : "REPEL", 60, H - 36, { size: 15, color: col, weight: 800 });
    text(ctx, "flip: E / Shift", 60, H - 22, { size: 10, color: PAL.dim, weight: 500 });

    // deaths (top-center, subtle)
    if (game.deaths > 0) {
      text(ctx, `deaths ${game.deaths}`, W / 2, 26, { size: 12, color: PAL.dim, align: "center", weight: 600 });
    }
  }

  function fmtTime(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const cs = Math.floor((t * 100) % 100);
    return `${m}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
  }

  // ------------------------------------------------------------------
  //  title
  // ------------------------------------------------------------------
  function drawTitle(ctx, game) {
    const t = game.time;
    // animated spark
    const cx = W / 2, cy = H / 2 - 60;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 90);
    grad.addColorStop(0, U.rgba(PAL.amberHot, 0.6));
    grad.addColorStop(0.4, U.rgba(PAL.amber, 0.2));
    grad.addColorStop(1, U.rgba(PAL.amber, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, 90, 0, U.TAU); ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.6);
    ctx.fillStyle = PAL.amber;
    ctx.fillRect(-16, -16, 32, 32);
    ctx.fillStyle = PAL.amberHot;
    ctx.fillRect(-8, -8, 16, 16);
    ctx.restore();
    ctx.strokeStyle = U.rgba(PAL.cyan, 0.5 + pulse * 0.3);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 30 + pulse * 6, 0, U.TAU); ctx.stroke();

    text(ctx, "LODESTAR", W / 2, H / 2 + 10, { size: 64, color: PAL.ink, align: "center", glow: U.rgba(PAL.amber, 0.6) });
    text(ctx, "a polarity platformer", W / 2, H / 2 + 48, { size: 18, color: PAL.dim, align: "center", weight: 500 });

    // controls
    const cy0 = H / 2 + 96;
    keyCap(ctx, "A", W / 2 - 150, cy0, 26, 24);
    keyCap(ctx, "D", W / 2 - 118, cy0, 26, 24);
    text(ctx, "move", W / 2 - 84, cy0 + 12, { size: 13, color: PAL.dim });
    keyCap(ctx, "Space", W / 2 + 10, cy0, 52, 24);
    text(ctx, "jump", W / 2 + 74, cy0 + 12, { size: 13, color: PAL.dim });
    keyCap(ctx, "E", W / 2 + 150, cy0, 26, 24);
    text(ctx, "flip polarity", W / 2 + 186, cy0 + 12, { size: 13, color: PAL.dim });

    // level select
    const lv = game.selectedLevel;
    const names = ["First Light", "Iron Veins", "Magnetic Fields", "The Deep", "Polarity Storm", "The Lode"];
    const selName = names[lv] || "";
    const unlocked = game.save.unlocked;
    const dotY = H / 2 + 140;
    const gap = 34;
    const x0 = W / 2 - (names.length - 1) * gap / 2;
    for (let i = 0; i < names.length; i++) {
      const x = x0 + i * gap;
      const isSel = i === lv;
      const isLocked = i + 1 > unlocked;
      const col = isLocked ? U.rgba(PAL.dim, 0.35) : (isSel ? PAL.amber : U.rgba(PAL.ink, 0.5));
      ctx.save();
      ctx.translate(x, dotY);
      if (isSel) {
        ctx.rotate(t * 1.2);
        ctx.fillStyle = PAL.amber;
        ctx.fillRect(-7, -7, 14, 14);
        ctx.fillStyle = PAL.amberHot;
        ctx.fillRect(-3.5, -3.5, 7, 7);
      } else {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, isLocked ? 3 : 5, 0, U.TAU); ctx.fill();
      }
      ctx.restore();
      if (isSel) {
        text(ctx, selName, x, dotY + 22, { size: 12, color: PAL.amber, align: "center", weight: 700 });
      }
    }
    text(ctx, "A / D  choose level", W / 2, dotY + 42, { size: 11, color: PAL.dim, align: "center", weight: 500 });

    const blink = 0.5 + 0.5 * Math.sin(t * 4);
    text(ctx, "press  ENTER  to begin", W / 2, H - 60, { size: 20, color: PAL.amber, align: "center", alpha: 0.5 + blink * 0.5, glow: U.rgba(PAL.amber, 0.5) });
    text(ctx, "flip your magnetism to walk on ceilings, pull shards, and pass the gates", W / 2, H - 30, { size: 12, color: PAL.dim, align: "center", weight: 500 });
  }

  // ------------------------------------------------------------------
  //  pause
  // ------------------------------------------------------------------
  function drawPause(ctx, game) {
    ctx.fillStyle = "rgba(6,8,12,0.7)";
    ctx.fillRect(0, 0, W, H);
    panel(ctx, W / 2 - 160, H / 2 - 120, 320, 240, 14);
    text(ctx, "PAUSED", W / 2, H / 2 - 78, { size: 34, color: PAL.ink, align: "center", glow: U.rgba(PAL.amber, 0.4) });
    text(ctx, "Enter  resume", W / 2, H / 2 - 20, { size: 17, color: PAL.ink, align: "center" });
    text(ctx, "R  restart level", W / 2, H / 2 + 14, { size: 17, color: PAL.ink, align: "center" });
    text(ctx, "Esc  back to title", W / 2, H / 2 + 48, { size: 17, color: PAL.ink, align: "center" });
    text(ctx, "M  mute", W / 2, H / 2 + 82, { size: 14, color: PAL.dim, align: "center" });
  }

  // ------------------------------------------------------------------
  //  level complete
  // ------------------------------------------------------------------
  function drawLevelComplete(ctx, game) {
    ctx.fillStyle = "rgba(6,8,12,0.72)";
    ctx.fillRect(0, 0, W, H);
    panel(ctx, W / 2 - 200, H / 2 - 140, 400, 280, 16);
    text(ctx, "LEVEL CLEAR", W / 2, H / 2 - 96, { size: 34, color: PAL.amber, align: "center", glow: U.rgba(PAL.amber, 0.5) });

    const r = game.lastResult;
    // medal
    const medal = r.time <= r.par ? "GOLD" : (r.time <= r.par * 1.5 ? "SILVER" : "BRONZE");
    const mcol = medal === "GOLD" ? PAL.gold : medal === "SILVER" ? PAL.ink : PAL.ironRust;
    text(ctx, `${medal}  ·  par ${r.par}s`, W / 2, H / 2 - 52, { size: 16, color: mcol, align: "center", weight: 800 });

    text(ctx, `time   ${fmtTime(r.time)}`, W / 2, H / 2 - 8, { size: 18, color: PAL.ink, align: "center" });
    text(ctx, `shards   ${r.shards} / ${r.total}`, W / 2, H / 2 + 26, { size: 18, color: PAL.amber, align: "center" });
    text(ctx, `deaths   ${r.deaths}`, W / 2, H / 2 + 60, { size: 18, color: PAL.dim, align: "center" });

    const blink = 0.5 + 0.5 * Math.sin(game.time * 4);
    text(ctx, game.isLast ? "press  ENTER  to finish" : "press  ENTER  for next level", W / 2, H / 2 + 108, { size: 18, color: PAL.amber, align: "center", alpha: 0.5 + blink * 0.5 });
  }

  // ------------------------------------------------------------------
  //  victory
  // ------------------------------------------------------------------
  function drawVictory(ctx, game) {
    const t = game.time;
    ctx.fillStyle = "rgba(6,8,12,0.8)";
    ctx.fillRect(0, 0, W, H);
    // celebratory sparks
    for (let i = 0; i < 24; i++) {
      const a = t * 0.5 + i * 0.26;
      const r = 120 + Math.sin(t * 2 + i) * 30;
      const x = W / 2 + Math.cos(a) * r;
      const y = H / 2 - 40 + Math.sin(a) * r * 0.6;
      ctx.fillStyle = U.rgba(i % 2 ? PAL.amber : PAL.cyan, 0.5);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, U.TAU); ctx.fill();
    }
    text(ctx, "THE LODE IS CLAIMED", W / 2, H / 2 - 90, { size: 40, color: PAL.amber, align: "center", glow: U.rgba(PAL.amber, 0.6) });
    text(ctx, "you mastered the polarity", W / 2, H / 2 - 50, { size: 18, color: PAL.dim, align: "center", weight: 500 });

    text(ctx, `total time   ${fmtTime(game.totalTime)}`, W / 2, H / 2, { size: 22, color: PAL.ink, align: "center" });
    text(ctx, `total shards   ${game.totalShards}`, W / 2, H / 2 + 38, { size: 22, color: PAL.amber, align: "center" });
    text(ctx, `deaths   ${game.deaths}`, W / 2, H / 2 + 76, { size: 22, color: PAL.dim, align: "center" });

    const blink = 0.5 + 0.5 * Math.sin(t * 4);
    text(ctx, "press  ENTER  to play again", W / 2, H - 60, { size: 20, color: PAL.amber, align: "center", alpha: 0.5 + blink * 0.5 });
  }

  // level intro banner (fades in at the start of each level)
  function drawLevelIntro(ctx, world, t) {
    // t counts down from 2.2; visible for the first ~1.6s
    if (t <= 0.6) return;
    const a = t > 1.9 ? (2.2 - t) / 0.3 : Math.min(1, (t - 0.6) / 0.5);
    ctx.save();
    ctx.globalAlpha = a;
    const y = H * 0.34;
    ctx.fillStyle = "rgba(8,10,16,0.55)";
    ctx.fillRect(0, y - 34, W, 68);
    ctx.fillStyle = U.rgba(PAL.amber, 0.5 * a);
    ctx.fillRect(0, y - 34, W, 1.5);
    ctx.fillRect(0, y + 32.5, W, 1.5);
    text(ctx, `LEVEL ${world.id}`, W / 2, y - 14, { size: 14, color: PAL.dim, align: "center", weight: 700 });
    text(ctx, world.name, W / 2, y + 14, { size: 30, color: PAL.ink, align: "center", glow: U.rgba(PAL.amber, 0.5) });
    ctx.restore();
  }

  // death flash
  function drawDeathFlash(ctx, game) {
    if (game.deathFlash <= 0) return;
    const a = game.deathFlash / 0.5;
    ctx.fillStyle = U.rgba(PAL.danger, a * 0.35);
    ctx.fillRect(0, 0, W, H);
  }

  return { drawHUD, drawTitle, drawPause, drawLevelComplete, drawVictory, drawDeathFlash, drawLevelIntro, fmtTime };
})();
