/* ============================================================
   ECHO PROTOCOL — main.js
   Boot, fixed-timestep loop, letterbox scaling, visibility pause.
   ============================================================ */
"use strict";
(function () {

  window.addEventListener("DOMContentLoaded", () => {

    /* ---- validate levels early with a clear console error ---- */
    try {
      OX.validateLevels();
    } catch (e) {
      console.error(e);
      document.body.innerHTML = `<pre style="color:#f66;font:14px monospace;padding:24px">${e.message}</pre>`;
      return;
    }

    const canvas = document.getElementById("game");
    const renderer = new OX.Renderer(canvas);
    const ui = new OX.UI();

    const game = new OX.Game(renderer, ui);
    ui.game = game;

    /* expose for debugging/testing */
    window.OXGame = game;
    OX.debug = { game, renderer, ui };

    /* ---- scaling ---- */
    function fit() {
      const app = document.getElementById("app");
      const s = Math.min(window.innerWidth / OX.VW, window.innerHeight / OX.VH);
      app.style.transform = `scale(${s})`;
    }
    window.addEventListener("resize", fit);
    fit();

    /* ---- main loop (fixed timestep) ---- */
    const STEP = 1 / 60;
    let last = performance.now();
    let acc = 0;

    function frame(now) {
      requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > .1) dt = .1;   // tab was hidden / hitch — clamp
      acc += dt;

      let steps = 0;
      while (acc >= STEP && steps < 4) {
        game.step(STEP);
        OX.Input.clearEdges();
        acc -= STEP;
        steps++;
      }
      if (steps === 4) acc = 0; // don't spiral

      renderer.draw(game);
    }
    requestAnimationFrame(frame);

    /* ---- auto-pause when the tab loses focus mid-run ---- */
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && game.state === OX.STATE.PLAYING) game.togglePause();
    });

    /* ---- first click also unlocks audio ---- */
    window.addEventListener("pointerdown", () => OX.Audio.init(), { once: false });
  });
})();
