# REVERB

A small platformer about sound and sight. The world is dark — hazards are
invisible until a wave of light (a *reverb*) washes over them. You emit waves
constantly just by existing; you can also shout to reveal everything at once.

**Objective:** reach the exit gate in each of 6 levels. Collect resonant shards
(optional, for completionists). You have 3 hearts per attempt. Beat each
level's *par* time for an S rating.

## Run it

No install, no build, no dependencies — plain HTML/JS.

- **Easiest:** double-click `index.html` (works in Chrome, Edge, Firefox).
- **Or serve it:** `python -m http.server 8000` in this folder, then open
  `http://localhost:8000`.

Audio is synthesized in the browser (WebAudio) — no audio files. It starts
after your first keypress (browser autoplay policy). Press `M` to mute.

## Controls

| Action | Keys |
|---|---|
| Move | `←` `→` or `A` `D` |
| Jump (hold = higher) | `Space` / `W` / `↑` |
| Dash (one per airtime) | `Shift` / `X` / `J` |
| **Shout** (big reveal wave, short cooldown) | `E` / `Q` |
| Restart level | `R` |
| Pause | `Esc` / `P` |
| Mute | `M` |
| Level select / confirm | `Enter`, `1`–`6` |

## Mechanics

- **You are a lantern.** A soft glow always surrounds you, and every ~1.3 s
  your heartbeat emits a slow pulse that lights tiles briefly. Tiles you've
  lit leave a faint *echo memory* — the map you've seen stays ghosted.
- **Hazards are blind to you until lit.** Spikes, saws, crumbling tiles, and
  hidden platforms are invisible in darkness. Jumping, landing, and dashing
  emit small pings; **Shout (`E`)** sends one huge fast wave — your main
  scouting tool.
- **Saws hum.** Moving saws emit their own danger pings, so you can hear where
  they are even in total darkness.
- **Bells resonate.** Touch a bell while light is on it and it rings forever,
  permanently revealing its area.
- **Crumbling tiles** shake for half a second, then fall. Keep moving.
- **Springs** launch you high and refresh your dash.

## Project layout

```
index.html      entry point (loads scripts in order)
style.css       fullscreen canvas, no letterboxing
src/
  utils.js      math/format helpers
  config.js     every tuning constant
  input.js      keyboard with edge detection
  audio.js      procedural WebAudio synth (sfx + two music tracks)
  reveal.js     the signature reveal/sonar field (lit grid + expanding rings)
  particles.js  pooled particle system
  camera.js     follow camera with lookahead + shake
  levels.js     6 levels authored with a stamp builder + parser
  player.js     movement feel: coyote time, jump buffer, dash, squash
  world.js      level state: movers, saws, crumbles, shards, hazards, events
  renderer.js   canvas drawing, visibility driven by the reveal field
  ui.js         HUD + menus (title, select, pause, clear, complete)
  game.js       state machine, save data (localStorage), event reactions
  main.js       bootstrap, resize, fixed-timestep rAF loop
tools/
  validate_levels.js  node script: reachability/hazard checks for all levels
```
