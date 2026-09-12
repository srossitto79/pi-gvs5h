// HELD OUT. This file must never be present in the working tree an agent can read.
// Run as: node validation/instances/ox-alpha-rewind-crash/grade.mjs <workDir>

import { loadScripts } from "../../lib/sandbox.mjs";
import { grader } from "../../lib/report.mjs";

const workDirectory = process.argv[2];
const report = grader("ox-alpha-rewind-crash");
if (!workDirectory) report.fatal("usage: grade.mjs <workDir>");

const files = ["js/utils.js", "js/audio.js", "js/input.js", "js/particles.js", "js/levels.js",
  "js/entities.js", "js/renderer.js", "js/ui.js", "js/game.js", "js/main.js"];

/** Boots the game the way the page does and returns handles to drive it. */
function boot() {
  const sandbox = loadScripts(workDirectory, files, { width: 960, height: 540 });
  sandbox.window.dispatch("DOMContentLoaded", {});
  const game = sandbox.window.OXGame;
  const renderer = sandbox.window.OX?.debug?.renderer;
  if (!game || !renderer) throw new Error("the game did not boot: window.OXGame or OX.debug.renderer is missing");
  return { sandbox, game, renderer, OX: sandbox.window.OX };
}

/** Plays the first level for a second holding right, drawing every frame as the page does. */
function playThenRewind({ rewind = true, frames = 60, after = 0 }) {
  const handles = boot();
  const { game, renderer, OX } = handles;
  game.startLevel(0);
  OX.Input.held.right = true;
  for (let i = 0; i < frames; i++) { game.step(1 / 60); OX.Input.clearEdges(); renderer.draw(game); }
  OX.Input.held.right = false;
  handles.beforeRewind = { x: game.player.x, echoes: game.echoes.length };
  if (!rewind) return handles;
  // The key sets a one-frame edge that step() consumes, which is where the echo is created.
  OX.Input.pressed.rewind = true;
  handles.sandbox.clearDrawing();
  game.step(1 / 60);
  OX.Input.clearEdges();
  handles.threw = undefined;
  handles.threwFrames = 0;
  // The page re-schedules its frame before drawing, so a throw in the renderer does not stop the
  // simulation: it repeats every frame while the game keeps stepping. Reproduce that, or the
  // guards below would be measuring a loop this grader stopped rather than the game.
  const draw = () => {
    try { renderer.draw(game); }
    catch (error) { handles.threw ??= error; handles.threwFrames++; }
  };
  draw();
  for (let i = 0; i < after; i++) {
    game.step(1 / 60);
    OX.Input.clearEdges();
    draw();
  }
  return handles;
}

// --- the defect ------------------------------------------------------------------------------
// A rewind creates an echo inside step(), after the echoes for that frame have already been
// updated, so the new one is drawn before anything sets its position. The renderer receives a
// non-finite coordinate and throws on this frame and every frame after it.
report.guard("the frame after a rewind still renders", "fail_to_pass", () => {
  const { threw, threwFrames } = playThenRewind({ after: 30 });
  report.failToPass("the frame after a rewind still renders", !threw,
    threw ? `drawing threw on ${threwFrames} of 31 frames: ${threw.message}` : "31 frames drawn after the rewind");
});

report.guard("no non-finite coordinate reaches the canvas", "fail_to_pass", () => {
  const { sandbox } = playThenRewind({ after: 30 });
  const bad = sandbox.nonFinite;
  report.failToPass("no non-finite coordinate reaches the canvas", bad.length === 0,
    bad.length ? `${bad.length} non-finite call(s), first: ${bad[0].method}(${bad[0].args.join(", ")})` : "none");
});

// --- behaviour that must survive the fix -----------------------------------------------------
// Removing the echo would also remove the crash, so the mechanic itself is guarded.
report.guard("a rewind after moving still records an echo", "pass_to_pass", () => {
  const { game, beforeRewind } = playThenRewind({ after: 0 });
  report.passToPass("a rewind after moving still records an echo", game.echoes.length === beforeRewind.echoes + 1,
    `echoes went from ${beforeRewind.echoes} to ${game.echoes.length}`);
});

report.guard("the echo replays the recorded path", "pass_to_pass", () => {
  const { game } = playThenRewind({ after: 40 });
  const echo = game.echoes[0];
  if (!echo) { report.passToPass("the echo replays the recorded path", false, "no echo was recorded"); return; }
  const recorded = echo.xs ?? [];
  const low = Math.min(...recorded);
  const high = Math.max(...recorded);
  const moved = Number.isFinite(echo.x) && echo.x !== recorded[0];
  report.passToPass("the echo replays the recorded path",
    Number.isFinite(echo.x) && echo.x >= low - 1 && echo.x <= high + 1 && moved,
    `after 41 frames the echo is at x=${echo.x} against a recorded range of ${low.toFixed(1)}..${high.toFixed(1)}`);
});

report.guard("ordinary play renders", "pass_to_pass", () => {
  const { game, beforeRewind } = playThenRewind({ rewind: false });
  report.passToPass("ordinary play renders", game.state === "playing" && beforeRewind.x > 0,
    `state=${game.state} after a second of running, player x=${beforeRewind.x?.toFixed?.(1)}`);
});

report.guard("the loop counter still advances", "pass_to_pass", () => {
  const { game } = playThenRewind({ after: 0 });
  report.passToPass("the loop counter still advances", game.resets >= 1 && game.frame <= 2,
    `resets=${game.resets}, frame reset to ${game.frame}`);
});

report.finish();
