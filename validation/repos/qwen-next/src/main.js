// REVERB — bootstrap: fullscreen canvas, resize handling, rAF loop.
(function (RV) {
  "use strict";

  const canvas = document.getElementById("game");
  let game = null;
  let last = 0;
  let running = false;

  function resize() {
    // fill the viewport exactly — no letterboxing, capped DPR for perf
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(320, window.innerWidth);
    const cssH = Math.max(240, window.innerHeight);
    const w = Math.floor(cssW * dpr);
    const h = Math.floor(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      if (game) {
        game.dpr = dpr;
        game.camera.viewW = cssW;
        game.camera.viewH = cssH;
        game.camera.clamp();
      }
    }
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
  }

  function loop(now) {
    if (!running) return;
    // rAF timestamps can slightly precede performance.now(): clamp to >= 0
    const dt = Math.max(0, Math.min((now - last) / 1000, RV.config.MAX_FRAME));
    last = now;
    game.frame(dt);
    game.render();
    requestAnimationFrame(loop);
  }

  function boot() {
    resize();
    window.addEventListener("resize", resize);
    game = new RV.Game(canvas);
    resize(); // re-apply DPR/camera view size now that the game exists
    // expose a handle for automated testing and debugging
    window.REVERB = game;
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.RV = window.RV || {});
