// REVERB — level validator (node tools/validate_levels.js)
// Checks: row lengths, entity counts, spring/exit/spawn support, saw endpoints,
// and coarse jump-reachability (walk + fall + jump + spring + movers) from
// spawn to exit and every shard.
"use strict";
const path = require("path");
global.window = { RV: {} };
require(path.join(__dirname, "..", "src", "config.js"));
require(path.join(__dirname, "..", "src", "utils.js"));
require(path.join(__dirname, "..", "src", "levels.js"));
const RV = global.window.RV;
const { LEVELS, parseLevel, TILES: T, config } = RV;
const tile = config.TILE;
const P = config.player;

const SOLIDISH = (t) => t === T.SOLID || t === T.HIDDEN || t === T.CRUMBLE || t === T.SPRING;
const HAZARD = (t) => t >= T.SPIKE_U;

let errors = 0, warnings = 0;
const err = (lvl, msg) => { errors++; console.log(`  [L${lvl}] ERROR: ${msg}`); };
const warn = (lvl, msg) => { warnings++; console.log(`  [L${lvl}] warn: ${msg}`); };

// physics-derived jump envelope (tiles)
const jumpH = Math.floor((P.jumpVel * P.jumpVel) / (2 * P.gravity) / tile);      // ~3
const jumpRise = jumpH;                                                          // rise up to 3
const jumpRun = 5;                                                               // dx at same/lower level
const springH = Math.floor((config.entities.springVy ** 2) / (2 * P.gravity) / tile); // ~7

for (const def of LEVELS) {
  let level;
  try { level = parseLevel(def); } catch (e) { err(def.id, e.message); continue; }
  const { w, h, tiles } = level;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? T.SOLID : tiles[y * w + x];

  // --- support checks ---
  for (const s of level.springs) {
    if (!SOLIDISH(at(s.tx, s.ty + 1))) err(def.id, `spring (${s.tx},${s.ty}) has no solid below`);
  }
  const ex = Math.floor((level.exit.x + level.exit.w / 2) / tile);
  const ey = Math.floor((level.exit.y + level.exit.h - 4) / tile);
  if (!SOLIDISH(at(ex, ey + 1))) err(def.id, `exit (${ex},${ey}) has no solid below`);
  const sx = Math.floor((level.spawn.x + P.w / 2) / tile);
  const sy = Math.floor((level.spawn.y + P.h - 4) / tile);
  if (!SOLIDISH(at(sx, sy + 1))) err(def.id, `spawn (${sx},${sy}) has no solid below`);
  if (HAZARD(at(sx, sy)) || HAZARD(at(sx, sy - 1))) err(def.id, `spawn overlaps hazard`);
  for (const s of level.saws) {
    for (const [px, py] of [[s.x0, s.y0], [s.x1, s.y1]]) {
      const tx = Math.floor(px / tile), ty = Math.floor(py / tile);
      if (SOLIDISH(at(tx, ty))) err(def.id, `saw endpoint (${tx},${ty}) inside solid`);
    }
  }

  // --- reachability BFS over standable tiles ---
  const stand = (x, y) =>
    !SOLIDISH(at(x, y)) && !HAZARD(at(x, y)) && SOLIDISH(at(x, y + 1)) &&
    !SOLIDISH(at(x, y - 1));
  const springAt = (x, y) => at(x, y) === T.SPRING; // tile you'd stand ON is spring tile below feet
  const key = (x, y) => y * w + x;
  const seen = new Set();
  const q = [[sx, sy]];
  seen.add(key(sx, sy));

  const push = (x, y) => { if (!seen.has(key(x, y))) { seen.add(key(x, y)); q.push([x, y]); } };

  while (q.length) {
    const [x, y] = q.shift();

    // walk + fall off edges
    for (const dx of [-1, 1]) {
      let nx = x + dx;
      while (!SOLIDISH(at(nx, y)) && !HAZARD(at(nx, y))) {
        if (stand(nx, y)) push(nx, y);
        // fall straight down from (nx,y)
        let fy = y;
        while (fy < h && !SOLIDISH(at(nx, fy)) && !HAZARD(at(nx, fy))) fy++;
        if (fy < h) {
          const land = fy - 1;
          if (land >= y) push(nx, land);
        }
        nx += dx;
      }
    }

    // jumps: dy 0..jumpRise up, dx within envelope (tighter dx when rising)
    const maxUp = springAt(x, y + 1) ? springH : jumpRise;
    for (let dy = 0; dy <= maxUp; dy++) {
      const dxMax = dy <= 1 ? jumpRun : Math.max(1, jumpRun - dy);
      for (let dx = -dxMax; dx <= dxMax; dx++) {
        const nx = x + dx, ny = y - dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!stand(nx, ny)) continue;
        // clearance: headroom above start and above target
        let ok = true;
        for (let cy = 1; cy <= dy + 1 && ok; cy++) if (SOLIDISH(at(x, y - cy))) ok = false;
        for (let cy = 1; cy <= 1 && ok; cy++) if (SOLIDISH(at(nx, ny - cy))) ok = false;
        if (ok) push(nx, ny);
      }
    }
  }

  // movers act as extra standable platforms along their path
  for (const m of level.movers) {
    const tx0 = Math.floor(m.x0 / tile), tx1 = Math.floor((m.x0 + m.dx + m.w - 1) / tile);
    const ty = Math.floor(m.y0 / tile);
    for (let x = tx0; x <= tx1; x++) push(x, ty - 1);
    while (q.length) {
      const [x, y] = q.shift();
      for (const dx of [-1, 1]) {
        let nx = x + dx;
        while (!SOLIDISH(at(nx, y)) && !HAZARD(at(nx, y))) {
          if (stand(nx, y)) push(nx, y);
          let fy = y;
          while (fy < h && !SOLIDISH(at(nx, fy)) && !HAZARD(at(nx, fy))) fy++;
          if (fy < h && fy - 1 >= y) push(nx, fy - 1);
          nx += dx;
        }
      }
      for (let dy = 0; dy <= jumpRise; dy++) {
        const dxMax = dy <= 1 ? jumpRun : Math.max(1, jumpRun - dy);
        for (let dx = -dxMax; dx <= dxMax; dx++) {
          const nx = x + dx, ny = y - dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (stand(nx, ny)) push(nx, ny);
        }
      }
    }
  }

  if (!seen.has(key(ex, ey))) err(def.id, `exit (${ex},${ey}) NOT reachable from spawn`);
  for (const sh of level.shards) {
    const stx = Math.floor(sh.x / tile), sty = Math.floor(sh.y / tile);
    let ok = false;
    for (let dy = 0; dy <= 3 && !ok; dy++) {
      for (let dx = -2; dx <= 2 && !ok; dx++) if (seen.has(key(stx + dx, sty + dy))) ok = true;
    }
    if (!ok) err(def.id, `shard ${sh.id} (${stx},${sty}) NOT reachable`);
  }
  for (const b of level.bells) {
    const bx = Math.floor(b.x / tile), by = Math.floor(b.y / tile);
    let ok = false;
    for (let dy = 0; dy <= 3 && !ok; dy++) {
      for (let dx = -2; dx <= 2 && !ok; dx++) if (seen.has(key(bx + dx, by + dy))) ok = true;
    }
    if (!ok) warn(def.id, `bell (${bx},${by}) not near reachable ground`);
  }
  console.log(`  [L${def.id}] ${def.name}: ${w}x${h}, shards=${level.shards.length}, saws=${level.saws.length} — parsed OK`);
}

console.log(errors ? `\nFAILED: ${errors} error(s), ${warnings} warning(s)` : `\nAll levels valid. ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
