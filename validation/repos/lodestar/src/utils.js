/* LODESTAR — small math / utility helpers. */
window.LD = window.LD || {};

LD.U = (function () {
  const TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function invLerp(a, b, v) { return a === b ? 0 : (v - a) / (b - a); }
  function mapRange(v, a, b, c, d) { return lerp(c, d, invLerp(a, b, v)); }

  // frame-rate independent exponential smoothing
  function damp(a, b, rate, dt) { return lerp(a, b, 1 - Math.exp(-rate * dt)); }

  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }

  function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

  // ---- easing ----
  const ease = {
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inCubic: t => t * t * t,
    outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outQuint: t => 1 - Math.pow(1 - t, 5),
    inOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  };

  // ---- seeded RNG (mulberry32) for deterministic decoration ----
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- AABB overlap ----
  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // ---- color helpers ----
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  // mix two hex colors, t in [0,1]
  function mix(h1, h2, t) {
    const a = hexToRgb(h1), b = hexToRgb(h2);
    const r = Math.round(lerp(a[0], b[0], t));
    const g = Math.round(lerp(a[1], b[1], t));
    const bl = Math.round(lerp(a[2], b[2], t));
    return `rgb(${r},${g},${bl})`;
  }

  // ---- palette (single source of truth for the look) ----
  const PAL = {
    bgTop: "#0b0e16",
    bgBot: "#141a28",
    iron: "#2a3142",
    ironDark: "#1c2230",
    ironEdge: "#3d4763",
    ironRust: "#5a3a2e",
    amber: "#ffb454",
    amberHot: "#ffd9a0",
    amberDeep: "#c96a1e",
    cyan: "#57d8ff",
    cyanHot: "#c9f4ff",
    cyanDeep: "#1e7fa8",
    ink: "#e8ecf4",
    dim: "#8b93a7",
    danger: "#ff5d6c",
    gold: "#ffe08a",
    portal: "#b98cff",
  };

  return {
    TAU, clamp, lerp, invLerp, mapRange, damp, dist2, dist, angleTo,
    ease, rng, aabb, rgba, mix, PAL,
  };
})();
