// REVERB — UI: HUD (hearts / shards / timer / shout meter) and all menus.
// HUD zones never overlap: hearts top-left, timer top-right, shout meter bottom-center.
(function (RV) {
  "use strict";
  const U = RV.utils;

  const FONT = "'Segoe UI', system-ui, sans-serif";

  function UI() {}

  UI.prototype = {
    // ---------- HUD ----------
    drawHUD(ctx, W, H, g) {
      ctx.save();
      ctx.textBaseline = "top";

      // hearts, top-left
      for (let i = 0; i < 3; i++) {
        const x = 22 + i * 30, y = 20;
        const full = i < g.hearts;
        const empty = i === g.hearts - 1 && g.heartFlicker > 0 && Math.floor(g.heartFlicker * 10) % 2 === 0;
        this.heart(ctx, x, y, 11, full && !empty ? "#ff5c74" : "rgba(255,92,116,0.18)",
          full && !empty ? "#ff8fa0" : "rgba(255,92,116,0.35)");
      }

      // shard counter, under hearts
      ctx.font = "600 17px " + FONT;
      ctx.fillStyle = "rgba(255,210,122,0.95)";
      ctx.textAlign = "left";
      const got = g.world.shards.filter((s) => s.taken).length;
      ctx.fillText("\u25C6 " + got + " / " + g.world.shards.length, 22, 42);

      // timer, top-right
      ctx.font = "600 20px " + FONT;
      ctx.fillStyle = "rgba(220,230,255,0.9)";
      ctx.textAlign = "right";
      ctx.fillText(U.fmtTime(g.world.time), W - 22, 20);
      // par under timer
      ctx.font = "500 12px " + FONT;
      ctx.fillStyle = "rgba(160,175,220,0.65)";
      ctx.fillText("par " + U.fmtTime(g.levelDef.par), W - 22, 44);

      // level name + hint, top-center
      ctx.textAlign = "center";
      ctx.font = "700 15px " + FONT;
      ctx.fillStyle = "rgba(200,214,255,0.85)";
      ctx.fillText(g.levelDef.id + " \u2014 " + g.levelDef.name, W / 2, 20);
      ctx.font = "400 12px " + FONT;
      ctx.fillStyle = "rgba(150,165,215,0.55)";
      ctx.fillText(g.levelDef.hint, W / 2, 40);

      // shout meter, bottom-center
      const mw = 150, mh = 6;
      const mx = W / 2 - mw / 2, my = H - 34;
      const cd = RV.config.reveal.shout.cooldown;
      const frac = g.world ? Math.max(0, 1 - (g.world.reveal.shoutCd || 0) / cd) : 1;
      ctx.fillStyle = "rgba(127,216,255,0.15)";
      ctx.fillRect(mx, my, mw, mh);
      ctx.fillStyle = frac >= 1 ? "rgba(127,216,255,0.9)" : "rgba(127,216,255,0.45)";
      ctx.fillRect(mx, my, mw * frac, mh);
      ctx.strokeStyle = "rgba(127,216,255,0.4)";
      ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
      ctx.font = "500 11px " + FONT;
      ctx.fillStyle = frac >= 1 ? "rgba(127,216,255,0.9)" : "rgba(127,216,255,0.45)";
      ctx.fillText(frac >= 1 ? "SHOUT  [E]" : "SHOUT recharging", W / 2, my + 10);

      // dash pip, bottom-left of meter
      ctx.textAlign = "left";
      ctx.font = "500 11px " + FONT;
      ctx.fillStyle = g.player.canDash ? "rgba(255,184,107,0.85)" : "rgba(255,184,107,0.25)";
      ctx.fillText("DASH " + (g.player.canDash ? "\u25CF" : "\u25CB"), mx - 74, my + 2);

      ctx.restore();
    },

    heart(ctx, x, y, r, fill, stroke) {
      ctx.save();
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      ctx.moveTo(x, y + r * 0.35);
      ctx.bezierCurveTo(x, y - r * 0.4, x - r, y - r * 0.4, x - r, y + r * 0.35);
      ctx.bezierCurveTo(x - r, y + r, x, y + r * 1.25, x, y + r * 1.6);
      ctx.bezierCurveTo(x, y + r * 1.25, x + r, y + r, x + r, y + r * 0.35);
      ctx.bezierCurveTo(x + r, y - r * 0.4, x, y - r * 0.4, x, y + r * 0.35);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },

    // ---------- shared menu helpers ----------
    dim(ctx, W, H, a) {
      ctx.fillStyle = "rgba(6,8,18," + a + ")";
      ctx.fillRect(0, 0, W, H);
    },

    // ---------- title ----------
    drawTitle(ctx, W, H, t, hasSave) {
      this.dim(ctx, W, H, 0.35);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // expanding decorative rings behind the title
      for (let i = 0; i < 3; i++) {
        const r = ((t * 90 + i * 130) % 420) + 1;
        ctx.strokeStyle = "rgba(127,216,255," + (0.30 * (1 - (r - 1) / 420)) + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(W / 2, H * 0.36, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = 1;

      ctx.font = "800 72px " + FONT;
      ctx.fillStyle = "#e8f2ff";
      ctx.fillText("REVERB", W / 2, H * 0.34);
      ctx.font = "400 17px " + FONT;
      ctx.fillStyle = "rgba(160,190,240,0.85)";
      ctx.fillText("a platformer you can only see when you make noise", W / 2, H * 0.34 + 52);

      const blink = 0.55 + 0.45 * Math.sin(t * 3.2);
      ctx.font = "600 22px " + FONT;
      ctx.fillStyle = "rgba(255,184,107," + blink + ")";
      ctx.fillText("press  ENTER  to begin", W / 2, H * 0.62);

      ctx.font = "400 14px " + FONT;
      ctx.fillStyle = "rgba(150,165,215,0.6)";
      ctx.fillText("move  \u2190\u2192 / WASD      jump  SPACE      dash  SHIFT      shout  E", W / 2, H * 0.74);
      ctx.fillText("pause  ESC        restart  R        mute  M", W / 2, H * 0.74 + 24);

      if (hasSave) {
        ctx.font = "500 14px " + FONT;
        ctx.fillStyle = "rgba(127,216,255,0.75)";
        ctx.fillText("save found \u2014 progress will resume", W / 2, H * 0.86);
      }
      ctx.restore();
    },

    // ---------- level select ----------
    drawSelect(ctx, W, H, t, save) {
      this.dim(ctx, W, H, 0.55);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 34px " + FONT;
      ctx.fillStyle = "#e8f2ff";
      ctx.fillText("SELECT LEVEL", W / 2, H * 0.16);

      const cols = 3, cw = 190, ch = 110, gap = 26;
      const total = RV.LEVELS.length;
      const rows = Math.ceil(total / cols);
      const x0 = W / 2 - (cols * cw + (cols - 1) * gap) / 2;
      const y0 = H * 0.3;
      for (let i = 0; i < total; i++) {
        const def = RV.LEVELS[i];
        const cx = x0 + (i % cols) * (cw + gap), cy = y0 + Math.floor(i / cols) * (ch + gap);
        const unlocked = i <= save.unlocked;
        const hovered = i === save.cursor;
        ctx.fillStyle = unlocked ? (hovered ? "rgba(127,216,255,0.16)" : "rgba(127,216,255,0.06)") : "rgba(60,66,96,0.10)";
        ctx.fillRect(cx, cy, cw, ch);
        ctx.strokeStyle = unlocked ? (hovered ? "rgba(127,216,255,0.9)" : "rgba(127,216,255,0.35)") : "rgba(90,96,130,0.25)";
        ctx.lineWidth = hovered ? 2 : 1;
        ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
        ctx.lineWidth = 1;

        ctx.textAlign = "left";
        ctx.font = "600 13px " + FONT;
        ctx.fillStyle = unlocked ? "rgba(127,216,255,0.8)" : "rgba(120,130,165,0.5)";
        ctx.fillText(def.id, cx + 14, cy + 22);
        ctx.font = "700 17px " + FONT;
        ctx.fillStyle = unlocked ? "#e8f2ff" : "rgba(150,160,190,0.45)";
        ctx.fillText(unlocked ? def.name : "\u{1F512} locked", cx + 14, cy + 48);
        if (unlocked) {
          ctx.font = "400 12px " + FONT;
          ctx.fillStyle = "rgba(160,175,220,0.6)";
          ctx.fillText("par " + U.fmtTime(def.par), cx + 14, cy + 72);
          const best = save.best[def.id];
          if (best) {
            ctx.fillStyle = "rgba(255,210,122,0.85)";
            ctx.fillText("best " + U.fmtTime(best.time) + "  \u00B7  " + best.rating, cx + 14, cy + 90);
          }
        }
        ctx.textAlign = "center";
      }
      ctx.font = "400 14px " + FONT;
      ctx.fillStyle = "rgba(150,165,215,0.6)";
      ctx.fillText("\u2190\u2192 choose \u00B7 ENTER start \u00B7 number keys jump straight in", W / 2, y0 + rows * (ch + gap) + 26);
      ctx.restore();
    },

    // ---------- pause ----------
    drawPause(ctx, W, H) {
      this.dim(ctx, W, H, 0.62);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 44px " + FONT;
      ctx.fillStyle = "#e8f2ff";
      ctx.fillText("PAUSED", W / 2, H * 0.4);
      ctx.font = "400 16px " + FONT;
      ctx.fillStyle = "rgba(170,185,230,0.8)";
      ctx.fillText("ESC resume \u00B7 R restart level \u00B7 M mute \u00B7 L level select", W / 2, H * 0.52);
      ctx.restore();
    },

    // ---------- death ----------
    drawDeath(ctx, W, H, t) {
      this.dim(ctx, W, H, Math.min(0.6, t * 1.4));
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 40px " + FONT;
      ctx.fillStyle = "rgba(255,92,116," + Math.min(1, t * 2) + ")";
      ctx.fillText("SILENCED", W / 2, H * 0.42);
      if (t > 0.7) {
        ctx.font = "400 16px " + FONT;
        ctx.fillStyle = "rgba(200,214,255,0.8)";
        ctx.fillText("press  R  to try again", W / 2, H * 0.54);
      }
      ctx.restore();
    },

    // ---------- level complete ----------
    drawLevelComplete(ctx, W, H, t, def, timeSec, rating, allShards, isLast) {
      this.dim(ctx, W, H, 0.62);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.font = "700 40px " + FONT;
      ctx.fillStyle = "#9fe8ff";
      ctx.fillText("LEVEL CLEAR", W / 2, H * 0.26);
      ctx.font = "400 16px " + FONT;
      ctx.fillStyle = "rgba(170,185,230,0.75)";
      ctx.fillText(def.id + " \u2014 " + def.name, W / 2, H * 0.26 + 36);

      // rating stamp
      ctx.font = "800 84px " + FONT;
      const rc = rating === "S" ? "#ffd27a" : rating === "A" ? "#9fe8ff" : rating === "B" ? "#b8c6e8" : "#8fa0c8";
      ctx.fillStyle = rc;
      ctx.fillText(rating, W / 2, H * 0.47);

      ctx.font = "600 22px " + FONT;
      ctx.fillStyle = "rgba(220,230,255,0.9)";
      ctx.fillText(U.fmtTime(timeSec), W / 2, H * 0.47 + 62);
      ctx.font = "400 14px " + FONT;
      ctx.fillStyle = allShards ? "rgba(255,210,122,0.9)" : "rgba(160,175,220,0.6)";
      ctx.fillText(allShards ? "all shards collected \u25C6" : "shards: " + (def._shardGot || "") + " of " + (def._shardTotal || ""), W / 2, H * 0.47 + 90);

      const blink = 0.55 + 0.45 * Math.sin(t * 3.2);
      ctx.font = "600 20px " + FONT;
      ctx.fillStyle = "rgba(255,184,107," + blink + ")";
      ctx.fillText(isLast ? "press  ENTER  \u2014 the final echo awaits" : "press  ENTER  for the next level", W / 2, H * 0.8);
      ctx.restore();
    },

    // ---------- game complete ----------
    drawComplete(ctx, W, H, t, totalTime, rank) {
      this.dim(ctx, W, H, 0.68);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < 4; i++) {
        const r = ((t * 70 + i * 110) % 480);
        ctx.strokeStyle = "rgba(255,200,92," + (0.25 * (1 - r / 480)) + ")";
        ctx.beginPath();
        ctx.arc(W / 2, H * 0.4, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.font = "800 56px " + FONT;
      ctx.fillStyle = "#ffd27a";
      ctx.fillText("THE HOLLOW ANSWERS", W / 2, H * 0.36);
      ctx.font = "400 18px " + FONT;
      ctx.fillStyle = "rgba(200,214,255,0.85)";
      ctx.fillText("every echo has been heard.", W / 2, H * 0.36 + 40);
      ctx.font = "600 26px " + FONT;
      ctx.fillStyle = "#e8f2ff";
      ctx.fillText("total time  " + U.fmtTime(totalTime), W / 2, H * 0.55);
      ctx.font = "700 20px " + FONT;
      ctx.fillStyle = "rgba(159,232,255,0.9)";
      ctx.fillText(rank, W / 2, H * 0.55 + 36);
      const blink = 0.55 + 0.45 * Math.sin(t * 3.2);
      ctx.font = "600 18px " + FONT;
      ctx.fillStyle = "rgba(255,184,107," + blink + ")";
      ctx.fillText("press  ENTER  \u2014 play again from the start", W / 2, H * 0.78);
      ctx.restore();
    },
  };

  RV.UI = UI;
})(window.RV = window.RV || {});
