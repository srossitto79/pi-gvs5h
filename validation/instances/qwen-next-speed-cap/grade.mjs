// HELD OUT. This file must never be present in the working tree an agent can read.
// Run as: node validation/instances/qwen-next-speed-cap/grade.mjs <workDir>

import { flatWorld, loadScripts, scriptedInput, silentEffects } from "../../lib/sandbox.mjs";
import { grader } from "../../lib/report.mjs";

const workDirectory = process.argv[2];
const report = grader("qwen-next-speed-cap");
if (!workDirectory) report.fatal("usage: grade.mjs <workDir>");

let window;
try {
  // Load order matches index.html: player.js closes over RV.config and RV.TILES at definition time.
  ({ window } = loadScripts(workDirectory, ["src/utils.js", "src/config.js", "src/levels.js", "src/player.js"]));
} catch (error) {
  report.fatal(`the game source could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
}
const RV = window.RV;
if (!RV?.Player || !RV.config?.player || !RV.TILES) report.fatal("RV.Player, RV.config.player or RV.TILES is missing after loading the sources");

const config = RV.config;
const step = config.STEP ?? 1 / 120;
const floor = 15;
const world = flatWorld(RV.TILES, { floor });
const ground = floor * config.TILE - config.player.h;
const effects = silentEffects();

/** Runs the real player update loop and samples it. */
function simulate({ seconds, held = [], press = [], start = { x: 64, y: ground } }) {
  const player = new RV.Player();
  player.reset({ x: start.x, y: start.y });
  const input = scriptedInput(held);
  const samples = [];
  const steps = Math.round(seconds / step);
  for (let i = 0; i < steps; i++) {
    for (const action of press.filter(entry => entry.step === i).map(entry => entry.action)) input.press(action);
    player.update(step, input, world, effects);
    input.endFrame();
    samples.push({ t: i * step, x: player.x, y: player.y, vx: player.vx, vy: player.vy, onGround: player.onGround });
  }
  return { player, samples };
}

const cap = config.player.moveSpeed;

// --- the defect ------------------------------------------------------------------------------
// The horizontal limiter must hold the configured cap. As shipped it multiplies by 0.985 per tick
// instead of clamping, so speed settles where decay meets acceleration, far above the cap.
report.guard("horizontal speed respects the configured cap", "fail_to_pass", () => {
  const { samples } = simulate({ seconds: 3, held: ["right"] });
  const settled = samples.filter(sample => sample.t >= 0.5);
  const peak = Math.max(...settled.map(sample => Math.abs(sample.vx)));
  report.failToPass("horizontal speed respects the configured cap", peak <= cap * 1.02,
    `peak |vx| after 0.5s was ${peak.toFixed(1)} px/s against a configured moveSpeed of ${cap}`);
});

// A cap enforced by lowering the constant is not a fix: the six levels were laid out for 265.
report.guard("the configured cap is unchanged", "fail_to_pass", () => {
  report.failToPass("the configured cap is unchanged", cap === 265,
    `config.player.moveSpeed is ${cap}, expected the as-authored 265`);
});

// --- behaviour that must survive the fix -----------------------------------------------------
report.guard("the player still runs", "pass_to_pass", () => {
  const { samples } = simulate({ seconds: 1, held: ["right"] });
  const distance = samples.at(-1).x - samples[0].x;
  report.passToPass("the player still runs", distance >= cap * 0.55,
    `covered ${distance.toFixed(1)} px in 1s holding right, expected at least ${(cap * 0.55).toFixed(1)}`);
});

report.guard("the player still reaches the cap", "pass_to_pass", () => {
  const { samples } = simulate({ seconds: 1, held: ["right"] });
  const peak = Math.max(...samples.map(sample => Math.abs(sample.vx)));
  report.passToPass("the player still reaches the cap", peak >= cap * 0.9,
    `peak |vx| was ${peak.toFixed(1)} px/s, expected to approach the ${cap} cap`);
});

// Magnitude is the defect check's business; this one only asserts that steering still works.
report.guard("direction reverses", "pass_to_pass", () => {
  const { samples } = simulate({ seconds: 1, held: ["left"], start: { x: 3200, y: ground } });
  const last = samples.at(-1);
  report.passToPass("direction reverses", last.vx < 0 && last.x < 3200,
    `holding left ended at vx=${last.vx.toFixed(1)} px/s and x=${last.x.toFixed(1)}`);
});

// The dash is allowed above the cap by design, so a repair that clamps speed globally rather
// than inside the acceleration path would destroy it. This check refuses that repair.
report.guard("the dash still bursts above the cap", "pass_to_pass", () => {
  const { samples } = simulate({ seconds: 0.5, held: ["right"], press: [{ step: 12, action: "dash" }] });
  const burst = Math.max(...samples.filter(sample => sample.t >= 0.1 && sample.t <= 0.25).map(sample => Math.abs(sample.vx)));
  report.passToPass("the dash still bursts above the cap", burst >= config.player.dashSpeed * 0.95,
    `peak |vx| during the dash was ${burst.toFixed(1)} px/s against a dashSpeed of ${config.player.dashSpeed}`);
});

report.guard("gravity and ground collision still work", "pass_to_pass", () => {
  const { samples } = simulate({ seconds: 1.5, start: { x: 64, y: ground - 160 } });
  const landed = samples.filter(sample => sample.onGround);
  const resting = samples.at(-1);
  report.passToPass("gravity and ground collision still work",
    landed.length > 0 && Math.abs(resting.y - ground) < 1 && Math.abs(resting.vy) < 1,
    `settled at y=${resting.y.toFixed(1)} (floor ${ground}) with vy=${resting.vy.toFixed(1)}`);
});

report.guard("jumping still works", "pass_to_pass", () => {
  const { samples } = simulate({ seconds: 2, press: [{ step: 30, action: "jump" }] });
  const airborne = samples.filter(sample => !sample.onGround && sample.t > 0.25);
  const apex = Math.min(...samples.map(sample => sample.y));
  const ended = samples.at(-1);
  report.passToPass("jumping still works", airborne.length > 0 && ground - apex > 40 && ended.onGround,
    `rose ${(ground - apex).toFixed(1)} px and returned to the ground: ${ended.onGround}`);
});

report.finish();
