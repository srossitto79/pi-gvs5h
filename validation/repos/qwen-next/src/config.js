// REVERB — every tuning constant lives here
(function (RV) {
  "use strict";

  RV.config = {
    TILE: 32,
    STEP: 1 / 120,          // fixed physics timestep
    MAX_FRAME: 0.25,        // clamp huge frames (tab switch)

    player: {
      w: 20, h: 26,
      moveSpeed: 265,
      accelGround: 2400,
      accelAir: 1500,
      frictionGround: 2600,
      gravity: 1500,
      maxFall: 920,
      jumpVel: 575,
      jumpCut: 0.42,        // vy multiplier when jump released early
      coyote: 0.10,
      jumpBuffer: 0.12,
      dashSpeed: 660,
      dashTime: 0.16,
      hearts: 3,
      iframes: 1.25,
      stompBounce: 400,
    },

    reveal: {
      litDecay: 1 / 3.2,    // lit units per second
      ambientRadius: 310,   // presence glow around player
      ambientFloor: 0.17,
      echoSeenMemory: 0.055,// faint outline kept for echo tiles once seen
      passive: { every: 1.35, speed: 620, maxR: 250, strength: 0.5 },
      event:   { speed: 900, maxR: 430, strength: 0.85 }, // jump/land/dash pings
      shout:   { speed: 1150, maxR: 980, strength: 1.0, cooldown: 1.05 },
    },

    entities: {
      springVy: -840,
      crumbleTime: 0.45,
      moverSpeed: 62,
      moverRange: 4,        // tiles
      mothSpeed: 62,
      mothStompVy: 150,     // player must be falling faster than this to stomp
      bellResonate: 999,    // bells ring permanently once struck (per attempt)
    },

    save: { key: "reverb_save_v1" },
  };
})(window.RV = window.RV || {});
