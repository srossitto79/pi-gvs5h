/* LODESTAR — bootstrap.
 * Wires the canvas, input, and game loop together. No build step, no modules:
 * plain scripts loaded in dependency order by index.html.
 */
(function () {
  "use strict";

  const canvas = document.getElementById("game");
  if (!canvas) { console.error("LODESTAR: #game canvas not found"); return; }

  LD.Input.init();

  const game = new LD.Game.Game(canvas);
  window.__lodestar = game; // debug/test handle
  canvas.__game = game; // robust DOM-attached handle

  // ---- main loop: fixed-step physics, render once per frame ----
  let last = performance.now();
  let raf = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > LD.CONFIG.MAX_FRAME) dt = LD.CONFIG.MAX_FRAME; // tab-switch clamp

    // resume the audio context on the first user gesture (browser policy)
    if (LD.Input.state.anyPressed && !LD.Audio.ready) LD.Audio.init();
    LD.Audio.resume();

    game.update(dt);
    game.render();
    LD.Particles.update(dt);
    LD.Input.endFrame();
  }

  raf = requestAnimationFrame(frame);

  // pause automatically when the tab is hidden (keeps the sim honest)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === LD.Game.STATES.PLAYING) {
      game.state = LD.Game.STATES.PAUSED;
    }
  });
})();
