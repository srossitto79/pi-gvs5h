/* LODESTAR — level definitions.
 * Levels are authored with a small Grid builder (rect / hline / vline / set)
 * and parsed into a runtime object: a collision tile grid plus entity lists.
 *
 * Tile characters:
 *   #  solid iron        =  one-way platform
 *   S  spawn             P  portal (exit)
 *   s  shard             C  checkpoint
 *   A  amber gate        Q  cyan gate   (pass only in matching polarity)
 *   u  updraft field     (magnetic lift, pushes the player up)
 *   E  crawler enemy     f  floater enemy
 *   ^  floor spike       v  ceiling spike
 *   M  mover (horizontal) m  mover (vertical)
 *   .  empty
 */
window.LD = window.LD || {};

LD.Levels = (function () {
  const T = LD.CONFIG.TILE;

  class Grid {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.g = Array.from({ length: h }, () => Array(w).fill("."));
    }
    in(x, y) { return x >= 0 && x < this.w && y >= 0 && y < this.h; }
    set(x, y, ch) { if (this.in(x, y)) this.g[y][x] = ch; }
    rect(x, y, w, h, ch) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, ch); }
    hline(x, y, w, ch) { this.rect(x, y, w, 1, ch); }
    vline(x, y, h, ch) { this.rect(x, y, 1, h, ch); }
    // carve a pit through the two bottom floor rows
    pit(x, w) { for (let i = 0; i < w; i++) { this.set(x + i, 14, "."); this.set(x + i, 15, "."); } }
  }

  function parse(def) {
    const g = def.grid, w = g.w, h = g.h;
    const tiles = Array.from({ length: h }, () => Array(w).fill(0));
    const shards = [], gates = [], fields = [], enemies = [], spikes = [], movers = [], checkpoints = [];
    let spawn = null, portal = null;

    const px = (x) => (x + 0.5) * T;
    const py = (y) => (y + 0.5) * T;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = g.g[y][x];
        switch (ch) {
          case "#": tiles[y][x] = 1; break;
          case "=": tiles[y][x] = 2; break;
          case "S": spawn = { x: px(x), y: py(y) }; break;
          case "P": portal = { x: px(x), y: py(y) }; break;
          case "s": shards.push({ x: px(x), y: py(y) }); break;
          case "A": gates.push({ x: px(x), y: py(y), pol: 1 }); break;
          case "Q": gates.push({ x: px(x), y: py(y), pol: -1 }); break;
          case "u": fields.push({ x: px(x), y: py(y) }); break;
          case "E": enemies.push({ x: px(x), y: py(y), type: "crawler" }); break;
          case "f": enemies.push({ x: px(x), y: py(y), type: "floater" }); break;
          case "^": spikes.push({ x: px(x), y: py(y), dir: 1 }); break;
          case "v": spikes.push({ x: px(x), y: py(y), dir: -1 }); break;
          case "M": movers.push({ x: px(x), y: py(y), axis: "x" }); break;
          case "m": movers.push({ x: px(x), y: py(y), axis: "y" }); break;
          case "C": checkpoints.push({ x: px(x), y: py(y) }); break;
        }
      }
    }

    return {
      id: def.id, name: def.name, w, h, tiles,
      spawn, portal, shards, gates, fields, enemies, spikes, movers, checkpoints,
      par: def.par,
    };
  }

  // ------------------------------------------------------------------
  //  Level 1 — First Light
  //  Teach: run, jump, polarity flip, shard collection. No hazards.
  // ------------------------------------------------------------------
  function level1() {
    const g = new Grid(44, 16);
    g.rect(0, 14, 44, 2, "#");          // floor
    g.pit(12, 3);                        // small pit
    g.pit(30, 3);                        // small pit
    g.rect(18, 8, 11, 1, "#");           // ceiling to flip onto (optional)
    g.set(2, 13, "S");
    g.set(41, 13, "P");
    g.set(8, 13, "s");
    g.set(23, 9, "s");                   // under the ceiling
    g.set(31, 10, "s");                  // over the pit
    return parse({ id: 1, name: "First Light", grid: g, par: 45 });
  }

  // ------------------------------------------------------------------
  //  Level 2 — Iron Veins
  //  Teach: polarity gates, enemies, checkpoints.
  // ------------------------------------------------------------------
  function level2() {
    const g = new Grid(52, 16);
    g.rect(0, 14, 52, 2, "#");
    g.pit(14, 3);
    g.pit(34, 3);
    g.rect(20, 6, 12, 1, "#");           // ceiling section (repel)
    g.vline(26, 4, 4, "Q");              // cyan gate on the ceiling path
    g.vline(42, 10, 4, "A");             // amber gate on the floor path
    g.set(12, 13, "E");
    g.set(46, 13, "E");
    g.set(38, 13, "C");
    g.set(18, 13, "s");
    g.set(26, 5, "s");
    g.set(44, 13, "s");
    g.set(2, 13, "S");
    g.set(49, 13, "P");
    return parse({ id: 2, name: "Iron Veins", grid: g, par: 60 });
  }

  // ------------------------------------------------------------------
  //  Level 3 — Magnetic Fields
  //  Teach: updraft fields for crossing wide gaps and reaching height.
  // ------------------------------------------------------------------
  function level3() {
    const g = new Grid(56, 16);
    g.rect(0, 14, 56, 2, "#");
    g.pit(18, 8);
    g.pit(36, 8);
    g.set(21, 11, "u");
    g.set(39, 11, "u");
    g.rect(28, 8, 6, 1, "#");            // high platform
    g.set(10, 13, "s");
    g.set(21, 9, "s");
    g.set(31, 7, "s");
    g.set(48, 13, "s");
    g.set(2, 13, "S");
    g.set(53, 13, "P");
    return parse({ id: 3, name: "Magnetic Fields", grid: g, par: 70 });
  }

  // ------------------------------------------------------------------
  //  Level 4 — The Deep
  //  Combine: spikes, movers, enemies, gates, fields.
  // ------------------------------------------------------------------
  function level4() {
    const g = new Grid(60, 16);
    g.rect(0, 14, 60, 2, "#");
    g.pit(12, 4);
    g.pit(28, 6);
    g.pit(44, 6);
    // spikes on the floor
    g.set(20, 13, "^"); g.set(21, 13, "^");
    g.set(38, 13, "^"); g.set(39, 13, "^");
    // a ceiling with spikes to teach ceiling hazards
    g.rect(16, 5, 10, 1, "#");
    g.set(19, 6, "v"); g.set(20, 6, "v");
    // movers
    g.set(30, 10, "M");
    g.set(46, 10, "m");
    // enemies
    g.set(16, 13, "E");
    g.set(50, 13, "E");
    g.set(34, 8, "f");
    // gates
    g.vline(24, 4, 4, "Q");
    g.vline(52, 10, 4, "A");
    // updraft to help the last pit
    g.set(47, 11, "u");
    g.set(36, 13, "C");
    g.set(8, 13, "s");
    g.set(24, 5, "s");
    g.set(34, 6, "s");
    g.set(54, 13, "s");
    g.set(2, 13, "S");
    g.set(57, 13, "P");
    return parse({ id: 4, name: "The Deep", grid: g, par: 75 });
  }

  // ------------------------------------------------------------------
  //  Level 5 — Polarity Storm
  //  More ceiling travel, tight gates, chained flips.
  // ------------------------------------------------------------------
  function level5() {
    const g = new Grid(56, 16);
    g.rect(0, 14, 56, 2, "#");
    g.pit(10, 4);
    g.pit(24, 6);
    g.pit(40, 6);
    // long ceiling run
    g.rect(14, 5, 16, 1, "#");
    g.vline(22, 4, 4, "Q");              // cyan gate on ceiling
    g.vline(26, 4, 4, "A");              // amber gate on ceiling (force a flip mid-ceiling)
    // floor gates
    g.vline(46, 10, 4, "A");
    // hazards
    g.set(18, 13, "^"); g.set(19, 13, "^");
    g.set(30, 13, "E");
    g.set(50, 13, "E");
    g.set(34, 8, "f");
    g.set(27, 11, "u");
    g.set(42, 11, "u");
    g.set(36, 13, "C");
    g.set(6, 13, "s");
    g.set(22, 5, "s");
    g.set(26, 5, "s");
    g.set(48, 13, "s");
    g.set(2, 13, "S");
    g.set(53, 13, "P");
    return parse({ id: 5, name: "Polarity Storm", grid: g, par: 80 });
  }

  // ------------------------------------------------------------------
  //  Level 6 — The Lode
  //  Finale: a vertical climb, a gauntlet, and the final portal.
  // ------------------------------------------------------------------
  function level6() {
    const g = new Grid(64, 16);
    g.rect(0, 14, 64, 2, "#");
    g.pit(14, 5);
    g.pit(30, 6);
    g.pit(46, 6);
    // staggered platforms forming a climb
    g.rect(8, 11, 5, 1, "#");
    g.rect(18, 9, 5, 1, "#");
    g.rect(28, 7, 5, 1, "#");
    g.rect(38, 9, 5, 1, "#");
    g.rect(48, 11, 5, 1, "#");
    // ceiling gauntlet
    g.rect(20, 4, 20, 1, "#");
    g.set(24, 5, "v"); g.set(25, 5, "v");
    g.set(34, 5, "v"); g.set(35, 5, "v");
    g.vline(28, 3, 4, "Q");
    g.vline(36, 3, 4, "A");
    // enemies + spikes
    g.set(12, 13, "E");
    g.set(24, 13, "^"); g.set(25, 13, "^");
    g.set(40, 13, "E");
    g.set(52, 13, "^"); g.set(53, 13, "^");
    g.set(32, 8, "f");
    g.set(56, 13, "f");
    // updrafts
    g.set(16, 11, "u");
    g.set(32, 11, "u");
    g.set(48, 11, "u");
    g.set(20, 13, "C");
    g.set(44, 13, "C");
    // shards
    g.set(10, 10, "s");
    g.set(20, 8, "s");
    g.set(30, 6, "s");
    g.set(40, 8, "s");
    g.set(50, 10, "s");
    g.set(28, 4, "s");
    g.set(36, 4, "s");
    g.set(2, 13, "S");
    g.set(61, 13, "P");
    return parse({ id: 6, name: "The Lode", grid: g, par: 90 });
  }

  const LEVELS = [level1(), level2(), level3(), level4(), level5(), level6()];

  // ---- load-time validation (throws with a clear message) ----
  (function validate() {
    LEVELS.forEach((lv, i) => {
      if (!lv.spawn) throw new Error(`Level ${i + 1}: missing spawn`);
      if (!lv.portal) throw new Error(`Level ${i + 1}: missing portal`);
      if (lv.shards.length === 0) throw new Error(`Level ${i + 1}: no shards`);
      // flood-fill reachability of empty space from spawn to portal
      const w = lv.w, h = lv.h;
      const seen = Array.from({ length: h }, () => Array(w).fill(false));
      const stack = [[Math.floor(lv.spawn.x / T), Math.floor(lv.spawn.y / T)]];
      const sx = Math.floor(lv.spawn.x / T), sy = Math.floor(lv.spawn.y / T);
      const px = Math.floor(lv.portal.x / T), py = Math.floor(lv.portal.y / T);
      seen[sy][sx] = true;
      while (stack.length) {
        const [x, y] = stack.pop();
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) return;
          if (seen[ny][nx]) return;
          if (lv.tiles[ny][nx] === 1) return; // solid blocks
          seen[ny][nx] = true;
          stack.push([nx, ny]);
        });
      }
      if (!seen[py][px]) throw new Error(`Level ${i + 1}: portal not reachable from spawn`);
    });
  })();

  return { LEVELS, Grid, parse };
})();
