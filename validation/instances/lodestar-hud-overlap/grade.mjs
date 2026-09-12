// HELD OUT. This file must never be present in the working tree an agent can read.
// Run as: node validation/instances/lodestar-hud-overlap/grade.mjs <workDir>

import { loadScripts, textBox } from "../../lib/sandbox.mjs";
import { grader } from "../../lib/report.mjs";

const workDirectory = process.argv[2];
const report = grader("lodestar-hud-overlap");
if (!workDirectory) report.fatal("usage: grade.mjs <workDir>");

// Several states, so a layout that only happens to fit the shortest clock is not accepted.
const states = [
  { id: 1, name: "FIRST LIGHT", shardCount: 0, totalShards: 3, time: 0 },
  { id: 2, name: "THE LONG DESCENT", shardCount: 2, totalShards: 3, time: 24.857 },
  { id: 5, name: "LODESTAR", shardCount: 3, totalShards: 3, time: 754.5 },
];

/** Draws the HUD for one state and returns every text it placed, as boxes. */
function hud(state) {
  const sandbox = loadScripts(workDirectory, ["src/config.js", "src/utils.js", "src/ui.js"]);
  const LD = sandbox.window.LD;
  if (!LD?.UI?.drawHUD) throw new Error("LD.UI.drawHUD is missing after loading the sources");
  const context = sandbox.window.document.createElement("canvas").getContext("2d");
  LD.UI.drawHUD(context, { ...state, player: { pol: 1 } }, { deaths: 0 });
  const config = sandbox.window.LD.C ?? sandbox.window.C ?? {};
  return {
    texts: sandbox.draws.filter(draw => draw.method === "fillText").map(draw => ({ ...textBox(draw), size: draw.size })),
    width: config.VIEW_W ?? 960,
  };
}

const shardLike = text => /\d+\s*\/\s*\d+/.test(text);
const clockLike = text => /\d+:\d{2}/.test(text);

// --- the defect ------------------------------------------------------------------------------
// The shard counter is drawn left-aligned and the clock right-aligned only 64px apart, so their
// boxes overlap and the two numbers render on top of each other.
report.guard("no two HUD readouts overlap", "fail_to_pass", () => {
  const collisions = [];
  for (const state of states) {
    const { texts } = hud(state);
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i];
        const b = texts[j];
        // Same visual line when the baselines are closer together than half the larger type size.
        if (Math.abs(a.y - b.y) >= Math.max(a.size, b.size) / 2) continue;
        if (a.left < b.right && b.left < a.right) {
          collisions.push(`"${a.text}" and "${b.text}" at y=${a.y} overlap by ${(Math.min(a.right, b.right) - Math.max(a.left, b.left)).toFixed(1)}px`);
        }
      }
    }
  }
  report.failToPass("no two HUD readouts overlap", collisions.length === 0, collisions[0] ?? "no overlapping readouts in any state");
});

// --- behaviour that must survive the fix -----------------------------------------------------
// Separating them by deleting one would also stop the overlap.
report.guard("the shard count and the clock are both shown", "pass_to_pass", () => {
  const missing = [];
  for (const state of states) {
    const { texts } = hud(state);
    if (!texts.some(text => shardLike(text.text))) missing.push(`level ${state.id}: no shard count`);
    if (!texts.some(text => clockLike(text.text))) missing.push(`level ${state.id}: no clock`);
  }
  report.passToPass("the shard count and the clock are both shown", missing.length === 0, missing[0] ?? "both present in every state");
});

report.guard("both readouts stay in the top-right panel", "pass_to_pass", () => {
  const strays = [];
  for (const state of states) {
    const { texts, width } = hud(state);
    // The panel is drawn at width-224, 210 wide; readouts must sit inside it.
    for (const text of texts.filter(entry => shardLike(entry.text) || clockLike(entry.text))) {
      if (text.left < width - 224 || text.right > width - 14 || text.y < 12 || text.y > 66) {
        strays.push(`"${text.text}" at ${text.left.toFixed(1)}..${text.right.toFixed(1)}, y=${text.y}`);
      }
    }
  }
  report.passToPass("both readouts stay in the top-right panel", strays.length === 0, strays[0] ?? "both inside the panel in every state");
});

report.guard("the rest of the HUD still draws", "pass_to_pass", () => {
  const { texts } = hud(states[1]);
  const level = texts.some(text => /LEVEL\s*\d/i.test(text.text));
  const name = texts.some(text => text.text.includes("THE LONG DESCENT"));
  const polarity = texts.some(text => /ATTRACT|REPEL/i.test(text.text));
  report.passToPass("the rest of the HUD still draws", level && name && polarity,
    `level label: ${level}, level name: ${name}, polarity: ${polarity}`);
});

report.finish();
