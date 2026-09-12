// REVERB — level data + parser.
//
// Levels are authored with a tiny stamp builder (guarantees exact grid width)
// and rendered/parsed into a tile array. Legend used by the builder:
//   # solid rock   H hidden block (solid, invisible until revealed)
//   C crumbling tile   = spring (sits in the floor line)   ^ spikes up
//   P spawn   E exit gate   * resonant shard   B bell (resonator)
//   M horizontal mover   m vertical mover
// Layouts are machine-validated by tools/validate_levels.js (node).
(function (RV) {
  "use strict";

  const T = {
    EMPTY: 0, SOLID: 1, HIDDEN: 2, CRUMBLE: 3, SPRING: 4,
    SPIKE_U: 5, SPIKE_D: 6, SPIKE_L: 7, SPIKE_R: 8,
  };
  RV.TILES = T;

  const CHAR2TILE = {
    ".": T.EMPTY, "#": T.SOLID, "H": T.HIDDEN, "C": T.CRUMBLE, "=": T.SPRING,
    "^": T.SPIKE_U, "v": T.SPIKE_D, "<": T.SPIKE_L, ">": T.SPIKE_R,
  };

  // ---------------------------------------------------------------- builder
  function Grid(w, h) {
    this.w = w; this.h = h;
    this.cells = [];
    for (let y = 0; y < h; y++) this.cells.push(new Array(w).fill("."));
  }
  Grid.prototype = {
    set(x, y, ch) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) throw new Error(`stamp out of bounds (${x},${y})`);
      this.cells[y][x] = ch;
      return this;
    },
    box(x0, y0, x1, y1, ch) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, ch);
      return this;
    },
    hline(x0, x1, y, ch) { return this.box(x0, y, x1, y, ch); },
    vline(x, y0, y1, ch) { return this.box(x, y0, x, y1, ch); },
    rows() { return this.cells.map((r) => r.join("")); },
  };

  // ---------------------------------------------------------------- levels
  // Each level: { id, name, par, hint, w, h, saws, build(g, cfg) }
  RV.LEVELS = [
    {
      id: 1, name: "FIRST LIGHT", par: 32,
      hint: "You glow in slow pulses. What your light touches, you remember.",
      w: 56, h: 17, saws: [],
      build(g) {
        g.set(2, 15, "P");
        // ground with two small pits
        g.hline(0, 17, 16, "#");
        g.hline(20, 37, 16, "#");
        g.hline(40, 55, 16, "#");
        // stepping platforms, each 3 rows up from the floor line
        g.hline(6, 10, 13, "#"); g.set(8, 12, "*");
        g.hline(26, 30, 13, "#"); g.set(28, 12, "*");
        g.hline(44, 48, 13, "#"); g.set(46, 12, "*");
        g.set(52, 15, "E");
      },
    },
    {
      id: 2, name: "RESONANCE", par: 48,
      hint: "Press E to SHOUT — one huge wave reveals everything nearby at once.",
      w: 56, h: 17, saws: [],
      build(g) {
        g.set(2, 15, "P");
        g.hline(0, 15, 16, "#");
        g.hline(20, 35, 16, "#");
        g.hline(38, 55, 16, "#");
        // invisible bridge across the first pit (hidden tiles)
        g.hline(16, 19, 15, "H");
        // hidden towers you must reveal before running into them
        g.vline(24, 12, 14, "H");
        g.vline(30, 12, 14, "H");
        // hidden platforms holding shards
        g.hline(23, 25, 13, "H"); g.set(24, 12, "*");
        g.hline(29, 31, 13, "H"); g.set(30, 12, "*");
        g.hline(44, 48, 13, "#"); g.set(46, 12, "*");
        g.set(52, 15, "E");
      },
    },
    {
      id: 3, name: "THICKET", par: 62,
      hint: "Saws hum while they move. Still ones stay silent. Listen — and look.",
      w: 60, h: 17,
      saws: [
        { x0: 24, y0: 15, x1: 30, y1: 15, speed: 150 },
        { x0: 46, y0: 15, x1: 52, y1: 15, speed: 175 },
      ],
      build(g) {
        g.set(2, 15, "P");
        g.hline(0, 21, 16, "#");
        g.hline(22, 43, 16, "#");
        g.hline(44, 59, 16, "#");
        // safe ledges to wait on between saw sweeps
        g.hline(10, 14, 13, "#"); g.set(12, 12, "*");
        g.hline(33, 37, 13, "#"); g.set(35, 12, "*");
        g.hline(54, 57, 13, "#"); g.set(56, 12, "*");
        g.set(58, 15, "E");
      },
    },
    {
      id: 4, name: "COLLAPSE", par: 75,
      hint: "Cracked tiles give way underfoot. Keep moving.",
      w: 60, h: 18, saws: [],
      build(g) {
        g.set(2, 16, "P");
        g.hline(0, 10, 17, "#");
        g.hline(11, 15, 17, "C");          // crumble bridge over a pit
        g.hline(16, 30, 17, "#");
        g.hline(31, 36, 17, ".");          // open pit — crossed by the mover
        g.hline(37, 59, 17, "#");
        // upper route with its own crumble stretch
        g.hline(8, 12, 14, "#"); g.set(10, 13, "*");
        g.hline(20, 24, 14, "C"); g.set(22, 13, "*");
        g.hline(44, 48, 14, "#"); g.set(46, 13, "*");
        g.set(33, 14, "M");               // mover crossing the pit
        g.set(56, 16, "E");
      },
    },
    {
      id: 5, name: "DEEP DARK", par: 90,
      hint: "Bells resonate when your light touches them — they keep what they touch revealed.",
      w: 64, h: 18, saws: [],
      build(g) {
        g.set(2, 16, "P");
        g.hline(0, 13, 17, "#");
        g.hline(14, 16, 17, ".");
        g.hline(17, 30, 17, "#");
        g.hline(31, 33, 17, ".");
        g.hline(34, 63, 17, "#");
        // bell on a plinth: once your light finds it, the pit edge stays lit
        g.set(11, 16, "B");
        // hidden maze walls over the middle pit
        g.vline(24, 14, 16, "H");
        g.vline(28, 14, 16, "H");
        g.hline(24, 28, 14, "H");
        g.set(26, 13, "*");
        // second bell guards the far approach
        g.set(40, 16, "B");
        g.hline(44, 48, 14, "#"); g.set(46, 13, "*");
        g.hline(54, 58, 14, "#"); g.set(56, 13, "*");
        g.set(61, 16, "E");
      },
    },
    {
      id: 6, name: "THE HOLLOW", par: 115,
      hint: "Everything, at once. Good luck.",
      w: 68, h: 18,
      saws: [
        { x0: 16, y0: 15, x1: 22, y1: 15, speed: 165 },
        { x0: 53, y0: 15, x1: 58, y1: 15, speed: 185 },
      ],
      build(g) {
        g.set(2, 16, "P");
        g.hline(0, 26, 17, "#");
        g.hline(27, 31, 17, "C");
        g.hline(32, 45, 17, "#");
        g.hline(46, 50, 17, ".");
        g.hline(51, 67, 17, "#");
        // hidden bridge over the last pit
        g.hline(46, 50, 16, "H");
        // upper platforms
        g.hline(8, 12, 14, "#"); g.set(10, 13, "*");
        g.hline(20, 24, 14, "H"); g.set(22, 13, "*");
        g.hline(36, 40, 14, "#"); g.set(38, 13, "*");
        g.hline(58, 62, 14, "#"); g.set(60, 13, "*");
        g.set(34, 14, "M");
        g.set(43, 16, "B");
        g.set(65, 16, "E");
      },
    },
  ];

  // ---------------------------------------------------------------- parser
  function parseLevel(def) {
    const tile = RV.config.TILE;
    const P = RV.config.player;
    const g = new Grid(def.w, def.h);
    def.build(g);
    const rows = g.rows();
    const w = def.w, h = def.h;
    const tiles = new Uint8Array(w * h);
    const level = {
      id: def.id, name: def.name, par: def.par, hint: def.hint,
      w, h, tiles, tile, rows,
      spawn: null,
      exit: null, shards: [], bells: [], movers: [], saws: [],
      crumbles: [], springs: [],
    };
    let shardCount = 0, exitCount = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = g.cells[y][x];
        if (ch === "P") {
          if (!level.spawn) {
            level.spawn = { x: x * tile + (tile - P.w) / 2, y: (y + 1) * tile - P.h };
          }
          tiles[y * w + x] = T.EMPTY;
        } else if (ch === "E") {
          exitCount++;
          level.exit = { x: x * tile, y: (y + 1) * tile - tile * 2, w: tile, h: tile * 2 };
          tiles[y * w + x] = T.EMPTY;
        } else if (ch === "*") {
          shardCount++;
          level.shards.push({ x: x * tile + tile / 2, y: y * tile + tile / 2, taken: false, id: shardCount });
          tiles[y * w + x] = T.EMPTY;
        } else if (ch === "B") {
          level.bells.push({ x: x * tile + tile / 2, y: y * tile + tile / 2, resonant: false, ringT: 0 });
          tiles[y * w + x] = T.EMPTY;
        } else if (ch === "M" || ch === "m") {
          level.movers.push({
            x: x * tile, y: y * tile, w: tile * 2, h: Math.round(tile * 0.6),
            x0: x * tile, y0: y * tile,
            dx: ch === "M" ? RV.config.entities.moverRange * tile : 0,
            dy: ch === "m" ? RV.config.entities.moverRange * tile : 0,
            phase: 0, speed: RV.config.entities.moverSpeed,
          });
          tiles[y * w + x] = T.EMPTY;
        } else {
          const t = CHAR2TILE[ch];
          if (t == null) throw new Error(`Level ${def.id} row ${y} col ${x}: unknown char '${ch}'`);
          tiles[y * w + x] = t;
          if (t === T.CRUMBLE) level.crumbles.push({ tx: x, ty: y, timer: 0, broken: false, fallY: 0, fallVy: 0 });
          if (t === T.SPRING) level.springs.push({ tx: x, ty: y, t: 0 });
        }
      }
    }
    if (!level.spawn) throw new Error(`Level ${def.id}: no spawn`);
    if (exitCount !== 1) throw new Error(`Level ${def.id}: ${exitCount} exits (want 1)`);
    if (shardCount < 3) throw new Error(`Level ${def.id}: only ${shardCount} shards (want >= 3)`);

    for (const s of def.saws || []) {
      level.saws.push({
        x0: s.x0 * tile + tile / 2, y0: s.y0 * tile + tile / 2,
        x1: s.x1 * tile + tile / 2, y1: s.y1 * tile + tile / 2,
        speed: s.speed, r: 15, t: 0, pingT: 0,
      });
    }
    return level;
  }

  RV.parseLevel = parseLevel;
  RV.Grid = Grid;
})(window.RV = window.RV || {});
