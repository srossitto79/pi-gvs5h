/* LODESTAR — global tuning constants.
 * All physics values are in pixels / seconds (fixed 120 Hz simulation step).
 */
window.LD = window.LD || {};

LD.CONFIG = {
  // ---- canvas ----
  VIEW_W: 960,
  VIEW_H: 540,
  TILE: 40,

  // ---- simulation ----
  STEP: 1 / 120,          // fixed physics step (s)
  MAX_FRAME: 0.1,         // clamp long frames (tab switch)

  // ---- player ----
  PLAYER: {
    W: 26,
    H: 30,
    ACCEL: 2600,          // ground acceleration
    AIR_ACCEL: 1700,
    FRICTION: 2200,        // ground friction (no input)
    AIR_DRAG: 300,
    MAX_SPEED: 300,
    JUMP_V: 640,           // initial jump velocity
    JUMP_CUT: 0.45,        // velocity multiplier on early release
    COYOTE: 0.10,          // s of grace after leaving a ledge
    JUMP_BUFFER: 0.12,     // s of grace before landing
    GRAVITY: 1500,
    FALL_GRAVITY: 2.0,     // multiplier while falling (snappier arcs)
    MAX_FALL: 980,
    FLIP_TIME: 0.16,       // polarity flip duration (s)
    FLIP_INVULN: 0.22,     // brief grace after a flip
    RIDE_SPEED: 1.0,       // how strongly fields push the player
  },

  // ---- magnetism ----
  MAGNET: {
    ATTRACT_RANGE: 150,    // px — shards pulled toward player (attract)
    ATTRACT_FORCE: 2600,   // px/s^2 at range edge, falls off with distance
    REPEL_RANGE: 120,      // px — shards pushed away (repel)
    REPEL_FORCE: 3400,
    FIELD_RANGE: 170,      // px — magnetic field influence radius
    FIELD_PUSH: 900,       // px/s^2 max push from a field
  },

  // ---- shards ----
  SHARD: {
    R: 9,
    MAGNETIC: 1.0,
    DRAG: 0.90,            // per-step velocity damping while free
    REST: 0.35,            // bounce restitution on walls
    PICKUP_R: 20,          // px — collected when this close to player
    POP: 0.25,             // s — pickup burst
  },

  // ---- enemies ----
  ENEMY: {
    W: 30,
    H: 26,
    SPEED: 70,
    STOMP_BOUNCE: 460,
    HURT_INVULN: 1.2,      // s of player invulnerability after a hit
  },

  // ---- gates ----
  GATE: {
    W: 14,
    H: 46,
    OPEN_TIME: 0.35,       // s — animation
  },

  // ---- fields ----
  FIELD: {
    R: 130,                // default radius
    PULSE: 2.2,            // s — pulse period
    STRENGTH: 4600,        // px/s^2 at center — must exceed gravity to lift
  },

  // ---- camera ----
  CAMERA: {
    LERP: 8.0,             // follow smoothing
    LOOK: 90,              // px of look-ahead in facing direction
    SHAKE_DECAY: 6.0,
  },

  // ---- progression ----
  SAVE_KEY: "lodestar_save_v1",
  PAR_TIMES: [45, 60, 70, 75, 80, 90], // seconds, per level (gold medal)
};
