# LODESTAR

**A polarity platformer.** You are a magnetic spark lost in the iron caverns.
Flip your polarity to invert gravity, walk on ceilings, pull shards to you,
and pass through the energy gates that only open to a matching charge.

## Run it

No install, no build, no dependencies. It's plain HTML + JS + Canvas.

**Option A — just open it:**
Double-click `index.html` (or drag it into a browser). That's it.

**Option B — local server (optional, if your browser blocks `file://`):**
```
cd qwen3.8-27b-q4
python -m http.server 8000
```
Then open <http://localhost:8000>.

Works in any modern browser (Chrome, Edge, Firefox, Safari). No network access
is needed at runtime — all audio is synthesized live with the Web Audio API.

## Controls

| Key | Action |
| --- | --- |
| `A` / `D` or `←` / `→` | Move |
| `Space` / `W` / `↑` | Jump (hold for higher) |
| `E` / `Q` / `Shift` | **Flip polarity** |
| `R` | Restart level |
| `Esc` / `P` | Pause |
| `M` | Mute |
| `Enter` | Confirm / start |

Touch controls appear automatically on mobile devices.

## Objective & mechanics

Reach the **portal** at the end of each of the 6 levels.

- **Polarity is the whole game.**
  - **Amber (ATTRACT):** gravity pulls down — you walk on floors, and shards
    are *magnetically pulled toward you* from a distance.
  - **Cyan (REPEL):** gravity pulls up — you walk on ceilings, and shards are
    *pushed away* from you.
  - Flipping is instant (with a brief grace period), so you can chain flips
  mid-air to reposition.
- **Gates** are full-height energy barriers. An amber gate only opens for an
  amber spark; a cyan gate only for a cyan one. Levels are built around
  forcing you to switch surfaces.
- **Shards** are the collectible. Grab them all for a better score — in amber
  mode they fly into you, which makes risky grabs possible.
- **Magnetic fields** (cyan updrafts) lift you through wide gaps.
- **Hazards:** iron beetles (stomp them from the "top" relative to your
  polarity), floaters, spikes, and the void.
- **Checkpoints** light up when you touch them and become your respawn point.
- **Medals:** beat each level's par time for gold. Progress, best times, and
  unlocked levels are saved in your browser (localStorage).

## Project layout

```
qwen3.8-27b-q4/
  index.html        entry point (plain script tags, no build step)
  style.css         page chrome
  src/
    config.js       all tuning constants (physics, palette refs, save key)
    utils.js        math, easing, seeded RNG, color helpers
    audio.js        procedural music + SFX (Web Audio, zero assets)
    input.js        keyboard + touch, edge-triggered actions
    particles.js    pooled particle system with named emitters
    levels.js       6 hand-authored levels (tile-grid builder + validator)
    entities.js     player physics, shards, gates, fields, enemies, World
    camera.js       smooth follow, look-ahead, screen shake
    renderer.js     all canvas drawing (parallax, glow, tiles, entities)
    ui.js           HUD + title/pause/complete/victory screens
    game.js         state machine + fixed-step main loop
    main.js         bootstrap
```

Design notes: fixed 120 Hz physics with an accumulator (deterministic feel at
any frame rate), a single pooled particle system, and a `World` object that
owns one level's entities and reports discrete events (`pickup`, `hurt`,
`died`, `won`, …) that the game loop reacts to — so gameplay logic stays
decoupled from rendering and UI.
