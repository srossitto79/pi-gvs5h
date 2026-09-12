/* ============================================================
   ECHO PROTOCOL — levels.js
   Six handcrafted sectors. Terrain is built programmatically with
   a small builder API (deterministic, verifiable geometry).

   TERRAIN CHARS
     #  solid block          =  one-way platform (jump-through)
     ^  floor spikes         v  ceiling spikes
     P  player spawn         X  exit gate
     *  data shard           .  empty

   ENTITY DEFS (tile coords)
     plates : {x, y, link, mode:"hold"|"latch"}   link may be "A+B" (AND)
     doors  : {x, y, h, link}
     lasers : {x, y, dir:"u"|"d", period, duty, offset}
     movers : {x, y, w, h, dx, dy, period, offset}
     springs: {x, y}
     hints  : {x, y, w, h, text}
   ============================================================ */
"use strict";
(function () {

  /* ---------------- tiny builder ---------------- */
  class Grid {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.g = Array.from({ length: h }, () => Array(w).fill("."));
    }
    set(x, y, c) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
      this.g[y][x] = c;
      return this;
    }
    hline(x1, x2, y, c = "#") {
      const [a, b] = x1 <= x2 ? [x1, x2] : [x2, x1];
      for (let x = a; x <= b; x++) this.set(x, y, c);
      return this;
    }
    vline(x, y1, y2, c = "#") {
      const [a, b] = y1 <= y2 ? [y1, y2] : [y2, y1];
      for (let y = a; y <= b; y++) this.set(x, y, c);
      return this;
    }
    rect(x1, y1, x2, y2, c = "#") {
      const [xa, xb] = x1 <= x2 ? [x1, x2] : [x2, x1];
      const [ya, yb] = y1 <= y2 ? [y1, y2] : [y2, y1];
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) this.set(x, y, c);
      return this;
    }
    rows() { return this.g.map(r => r.join("")); }
  }

  /* ============================================================
     SECTOR DEFINITIONS
     Physics reference: max jump ≈ 2.7 tiles high, ≈ 4.5 tiles long.
     ============================================================ */

  // ---- 1 · CALIBRATION ----------------------------------------
  function lvl1() {
    const g = new Grid(48, 15);
    // ground: two slabs separated by a 3-wide pit
    g.rect(0, 13, 14, 14);
    g.rect(18, 13, 47, 14);
    g.vline(0, 0, 14);          // left wall
    g.vline(47, 0, 12);         // right wall (above ground)
    // viewing platform decor (pure terrain interest)
    g.rect(4, 10, 6, 10);
    // tower for the latch button
    g.rect(34, 11, 36, 12);
    g.set(2, 12, "P");
    g.set(6, 9, "*");
    g.set(16, 10, "*");         // over the pit
    g.set(35, 8, "*");          // above the tower
    g.set(43, 12, "X");
    return {
      grid: g.rows(),
      plates: [
        { x: 20, y: 12, link: "A", mode: "hold" },
        { x: 35, y: 10, link: "B", mode: "latch" },
      ],
      doors: [
        { x: 26, y: 10, h: 3, link: "A" },
        { x: 39, y: 11, h: 2, link: "B" },
      ],
      buttons: [], lasers: [], movers: [], springs: [],
      hints: [
        { x: 1, y: 9, w: 6, h: 4, text: "ARROWS or WASD to move — SPACE to jump" },
        { x: 18.5, y: 9, w: 4, h: 4, text: "Stand on the pad… then press R to rewind" },
        { x: 27, y: 9, w: 6, h: 5, text: "Your echo holds the pad. Cross!" },
        { x: 32.5, y: 7, w: 5, h: 6, text: "Violet switches lock open for this loop" },
      ],
    };
  }

  // ---- 2 · RELAY ----------------------------------------------
  function lvl2() {
    const g = new Grid(52, 15);
    // long corridor floor with two void pits
    g.rect(0, 9, 14, 10);
    g.rect(18, 9, 26, 10);
    g.rect(30, 9, 51, 10);
    g.vline(0, 0, 10);
    g.rect(0, 0, 51, 0);        // ceiling strip for framing
    g.vline(51, 0, 8);
    // exit rise
    g.rect(44, 8, 51, 10);
    // spring lookout perch (optional)
    g.hline(46, 50, 4, "=");
    g.set(3, 8, "P");
    g.set(16, 6, "*");
    g.set(28, 6, "*");
    g.set(48, 2, "*");
    g.set(48, 8, "X");
    return {
      grid: g.rows(),
      plates: [
        { x: 10, y: 8, link: "A", mode: "hold" },
        { x: 22, y: 8, link: "B", mode: "hold" },
      ],
      doors: [{ x: 38, y: 6, h: 3, link: "A+B" }],
      buttons: [], lasers: [], movers: [],
      springs: [{ x: 46, y: 7 }],
      hints: [
        { x: 6, y: 6, w: 6, h: 4, text: "Two pads, one runner — build your relay" },
        { x: 33, y: 4, w: 7, h: 5, text: "This gate demands BOTH pads at once" },
      ],
    };
  }

  // ---- 3 · PULSE CORRIDOR --------------------------------------
  function lvl3() {
    const g = new Grid(54, 13);
    g.rect(0, 12, 53, 12);      // floor
    g.rect(0, 0, 53, 0);        // ceiling
    g.vline(0, 0, 12);
    g.vline(53, 0, 12);
    // stepping shelves (rises of exactly 2 tiles)
    g.hline(6, 10, 10);
    g.hline(14, 18, 10);
    g.hline(22, 26, 8);
    g.hline(30, 34, 8);
    g.hline(38, 42, 10);
    // one-way bridges keep the climb forgiving (1-tile rises throughout)
    g.hline(19, 21, 9, "=");
    g.hline(27, 29, 9, "=");
    g.hline(35, 37, 9, "=");
    g.set(2, 11, "P");
    g.set(12, 6, "*");          // inside a laser gap
    g.set(24, 5, "*");
    g.set(40, 7, "*");
    g.set(50, 11, "X");
    return {
      grid: g.rows(),
      plates: [{ x: 32, y: 7, link: "L", mode: "latch" }],
      doors: [{ x: 46, y: 9, h: 3, link: "L" }],
      buttons: [],
      lasers: [
        { x: 4,  y: 11, dir: "u", period: 2.4, duty: .5, offset: 0 },
        { x: 12, y: 11, dir: "u", period: 2.2, duty: .5, offset: 1.1 },
        { x: 20, y: 0,  dir: "d", period: 2.0, duty: .5, offset: .5 },
        { x: 28, y: 11, dir: "u", period: 1.8, duty: .5, offset: .9 },
        { x: 36, y: 0,  dir: "d", period: 1.7, duty: .5, offset: 0 },
        { x: 44, y: 11, dir: "u", period: 2.6, duty: .55, offset: 1.3 },
      ],
      movers: [], springs: [],
      hints: [
        { x: 1.5, y: 8, w: 5, h: 4, text: "Beams pulse on a rhythm — watch the warm-up glow" },
      ],
    };
  }

  // ---- 4 · DRIFT YARD ------------------------------------------
  function lvl4() {
    const g = new Grid(54, 14);
    g.rect(0, 10, 4, 11);       // start ledge
    g.vline(0, 0, 11);
    g.hline(12, 16, 6);         // high ledge after mover 1
    g.rect(30, 9, 33, 11);      // pillar with spring
    g.hline(35, 38, 4, "=");    // sky one-ways
    g.rect(34, 11, 53, 12);     // main floor
    g.vline(53, 0, 12);
    g.hline(44, 46, 10, "^");   // spike strip on the floor
    g.set(2, 9, "P");
    g.set(14, 4, "*");
    g.set(24, 6, "*");          // above mover 2's path
    g.set(36, 2, "*");
    g.set(50, 10, "X");
    return {
      grid: g.rows(),
      movers: [
        { x: 7,  y: 11, w: 3, h: .5, dx: 0, dy: -5, period: 3.6, offset: 0 },
        { x: 18, y: 9,  w: 3, h: .5, dx: 8, dy: 0,  period: 4.2, offset: 1.6 },
      ],
      springs: [{ x: 31, y: 8 }],
      plates: [], doors: [], buttons: [], lasers: [],
      hints: [
        { x: 5, y: 7, w: 4, h: 4, text: "Moving platforms carry you — and your ghosts" },
        { x: 29, y: 6, w: 5, h: 4, text: "Springs refresh your dash mid-air" },
      ],
    };
  }

  // ---- 5 · VERTIGO ---------------------------------------------
  function lvl5() {
    const g = new Grid(24, 26);
    g.rect(0, 0, 23, 0);        // ceiling
    g.vline(0, 0, 25);
    g.vline(23, 0, 25);
    g.rect(0, 24, 23, 25);      // bottom floor
    g.hline(10, 13, 23, "^");   // spike pocket in the middle
    // zig-zag climb — every rise ≤ 2 tiles
    g.hline(6, 9, 22);
    g.hline(12, 15, 20);
    g.hline(18, 22, 18);
    g.hline(13, 16, 16);
    g.hline(8, 11, 14);
    g.hline(3, 6, 12);
    g.hline(8, 11, 10);
    g.hline(13, 16, 8);
    g.hline(18, 21, 6);         // plat I — final hop to the exit ledge
    g.rect(18, 4, 22, 5);       // exit ledge
    g.set(3, 23, "P");
    g.set(20, 3, "X");
    g.set(4, 11, "*");
    g.set(14, 7, "*");          // guarded by the ceiling beam
    g.set(20, 2, "*");
    return {
      grid: g.rows(),
      lasers: [
        { x: 17, y: 0, dir: "d", period: 2.2, duty: .45, offset: .7 },  // shaft sweeper
        { x: 10, y: 15, dir: "d", period: 2.4, duty: .42, offset: .9 }, // sentinel guarding the A→B gap
      ],
      springs: [
        { x: 21, y: 17 },   // on plat C — shortcut / safety net
        { x: 16, y: 23 },   // on the bottom floor
      ],
      movers: [], plates: [], doors: [], buttons: [],
      hints: [
        { x: 4.5, y: 20, w: 5, h: 4, text: "Time your ride — the springs reset your dash" },
      ],
    };
  }

  // ---- 6 · CONVERGENCE ------------------------------------------
  function lvl6() {
    const g = new Grid(60, 15);
    g.rect(0, 8, 5, 10);        // spawn plateau
    g.vline(0, 0, 10);
    // relay corridor (elevated — falls below are lethal)
    g.rect(6, 9, 13, 10);
    g.rect(16, 9, 29, 10);
    g.rect(32, 9, 44, 10);
    // gauntlet chamber walls
    g.vline(59, 0, 13);
    g.rect(0, 0, 59, 0);        // ceiling strip
    // safe ledge + spring at the bottom of the finale chamber
    g.rect(45, 12, 47, 13);
    // upper exit ledge
    g.rect(52, 4, 57, 5);
    g.set(2, 7, "P");
    g.set(14, 6, "*");
    g.set(30, 6, "*");
    g.set(50, 7, "*");          // risky, near the sweep beam
    g.set(54, 3, "X");
    return {
      grid: g.rows(),
      plates: [
        { x: 10, y: 8, link: "A", mode: "hold" },
        { x: 18, y: 8, link: "B", mode: "hold" },
        { x: 26, y: 8, link: "C", mode: "hold" },
      ],
      doors: [{ x: 34, y: 6, h: 3, link: "A+B+C" }],
      buttons: [],
      lasers: [
        { x: 15, y: 2, dir: "d", period: 1.6, duty: .5, offset: .8 },   // sweeps gap 1
        { x: 30, y: 3, dir: "d", period: 1.6, duty: .5, offset: 0 },    // sweeps gap 2
        { x: 50, y: 0, dir: "d", period: 3.0, duty: .4, offset: 1.5 },  // guards the ascent
      ],
      movers: [
        { x: 48, y: 12, w: 3, h: .5, dx: 0, dy: -7, period: 4.6, offset: 0 },
      ],
      springs: [{ x: 46, y: 11 }],
      hints: [
        { x: 6, y: 6, w: 7, h: 3, text: "Three pads. One gate. Five echoes. Choose well." },
        { x: 43.5, y: 6, w: 7, h: 4, text: "Ride the lift — mind the sweep beam" },
      ],
    };
  }

  /* ---------------- assembly + validation ---------------- */
  const BUILDERS = [lvl1, lvl2, lvl3, lvl4, lvl5, lvl6];

  const META = [
    { id: "s1", name: "CALIBRATION",    sub: "Learn to leave yourself behind",      maxEchoes: 3, par: 35, musicSeed: 11 },
    { id: "s2", name: "RELAY",          sub: "A chain of past selves",              maxEchoes: 3, par: 55, musicSeed: 23 },
    { id: "s3", name: "PULSE CORRIDOR", sub: "Dance between the beams",             maxEchoes: 2, par: 55, musicSeed: 37 },
    { id: "s4", name: "DRIFT YARD",     sub: "Ride the machinery",                  maxEchoes: 2, par: 50, musicSeed: 51 },
    { id: "s5", name: "VERTIGO",        sub: "The long way up",                     maxEchoes: 3, par: 75, musicSeed: 67 },
    { id: "s6", name: "CONVERGENCE",    sub: "Every loop at once",                  maxEchoes: 5, par: 100, musicSeed: 89 },
  ];

  function validate(def, idx) {
    const errs = [];
    const H = def.grid.length;
    const W = def.grid[0].length;
    let spawns = 0, exits = 0, shards = 0;
    for (let y = 0; y < H; y++) {
      const row = def.grid[y];
      if (row.length !== W) errs.push(`row ${y}: width ${row.length} != ${W}`);
      for (let x = 0; x < W; x++) {
        const c = row[x];
        if (c === "P") spawns++;
        else if (c === "X") exits++;
        else if (c === "*") shards++;
        else if (!"#=^vPX*. ".includes(c)) errs.push(`(${x},${y}): unknown char "${c}"`);
      }
    }
    if (spawns !== 1) errs.push(`expected 1 spawn, found ${spawns}`);
    if (exits !== 1) errs.push(`expected 1 exit, found ${exits}`);
    if (shards !== 3) errs.push(`expected 3 shards, found ${shards}`);
    const plateLinks = new Set((def.plates || []).map(p => p.link));
    (def.doors || []).forEach(d => {
      d.link.split("+").forEach(l => {
        if (!plateLinks.has(l)) errs.push(`door link part "${l}" has no plate`);
      });
    });
    if (errs.length) throw new Error(`Sector ${idx + 1} invalid:\n  ` + errs.join("\n  "));
    return { W, H };
  }

  OX.LEVELS = META.map((meta, i) => {
    const def = BUILDERS[i]();
    const dims = validate(def, i);
    return Object.assign({ index: i }, meta, def, { rows: def.grid }, dims);
  });
  OX.LEVEL_COUNT = OX.LEVELS.length;
  OX.validateLevels = () => OX.LEVELS.forEach((l, i) => validate(l, i));
})();
