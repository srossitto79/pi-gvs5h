// REVERB — shared utilities
(function (RV) {
  "use strict";

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

  // Deterministic seeded RNG (mulberry32)
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function fmtTime(sec) {
    if (sec == null || !isFinite(sec)) return "--:--.--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.floor((sec * 100) % 100);
    return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }

  function ratingFor(timeSec, par) {
    if (timeSec <= par) return "S";
    if (timeSec <= par * 1.35) return "A";
    if (timeSec <= par * 1.8) return "B";
    return "C";
  }

  RV.utils = { clamp, lerp, smooth, sign, makeRng, aabb, fmtTime, ratingFor };
})(window.RV = window.RV || {});
