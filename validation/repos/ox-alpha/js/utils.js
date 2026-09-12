/* ============================================================
   ECHO PROTOCOL — utils.js
   Math helpers, RNG, storage, shared constants. Defines OX namespace.
   ============================================================ */
"use strict";
window.OX = window.OX || {};

OX.TILE = 48;                 // world tile size (px)
OX.VW = 1280;                 // logical viewport width
OX.VH = 720;                  // logical viewport height

const U = OX.Utils = {
  TAU: Math.PI * 2,

  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  damp(a, b, k, dt) { return U.lerp(a, b, 1 - Math.exp(-k * dt)); },
  sign(x) { return x < 0 ? -1 : (x > 0 ? 1 : 0); },

  // Frame-rate independent approach toward a target.
  approach(cur, target, delta) {
    if (cur < target) return Math.min(cur + delta, target);
    return Math.max(cur - delta, target);
  },

  easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },
  easeInCubic(t) { return t * t * t; },
  easeOutBack(t) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  easeInOutQuad(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  pingpong(t) { return 1 - Math.abs(1 - 2 * (t % 1)); },

  // Deterministic PRNG (mulberry32)
  rng(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  },

  aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  },

  fmtTime(sec) {
    if (!isFinite(sec)) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const d = Math.floor((sec % 1) * 10);
    return `${m}:${s < 10 ? "0" : ""}${s}.${d}`;
  },

  dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); },

  /* ---- persistent save (safe against private-mode failures) ---- */
  SAVE_KEY: "oxalpha_save_v1",
  loadSave() {
    try {
      const raw = localStorage.getItem(U.SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === "object") return U._normalize(data);
      }
    } catch (e) { /* ignore */ }
    return U._normalize({});
  },

  _normalize(d) {
    return {
      unlocked: Math.max(1, Math.min(OX.LEVEL_COUNT || 99, d.unlocked | 0)) || 1,
      muted: !!d.muted,
      seenHelp: !!d.seenHelp,
      best: (d.best && typeof d.best === "object") ? d.best : {},   // id -> {time, deaths, shards}
    };
  },

  writeSave(save) {
    try { localStorage.setItem(U.SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  },
};
