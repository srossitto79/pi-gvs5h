# ECHO PROTOCOL

A time-loop precision platformer. You are a chrono-runner stranded in a derelict
temporal research facility — and your only tool is yourself: **every run you
abandon is recorded as an "echo" that replays your exact movement and then holds
position forever.** Park your past selves on pressure plates, chain them into a
relay, and slip through gates that need more hands than you have.

*Zero dependencies · pure vanilla JS + Canvas · no build step.*

---

## Run it

**Option A (simplest):** double-click `index.html` — it runs from disk in any modern browser.

**Option B (local server, recommended):**

```bash
cd ox-alpha
python -m http.server 8000
# then open http://localhost:8000
```

No install, no internet access required.

## Controls

| Key | Action |
|---|---|
| `←` `→` / `A` `D` | Move |
| `SPACE` / `W` / `↑` | Jump (hold = higher) |
| `SHIFT` / `X` | Dash — once per airtime, refreshes on landing/spring/jump |
| `R` | **Rewind** — restart the loop, leave an echo behind |
| `T` | Dismiss all echoes |
| `ESC` / `P` | Pause |
| `M` | Mute |

## Objective & mechanics

Reach the violet **exit gate** of all six sectors. The twist:

- **Rewinding (`R`) or dying records your last run as an amber ECHO.** The echo
  replays your movement frame-for-frame on every future loop, then *stays where
  it ended — forever*. It still weighs down switches.
- **Hold pads** stay pressed only while someone stands on them.
  **Latch switches** (violet) lock open until the next rewind — your echoes
  re-trigger them deterministically every future loop.
- Some doors require **several pads held simultaneously** (`A+B`, `A+B+C`) —
  that's what your relay of ghosts is for.
- **Lasers pulse on a fixed rhythm** identical every loop, so you can learn the
  beat. Moving platforms are deterministic too — ghosts can ride them.
- Each sector hides **3 data shards**. Collecting them across loops is fine —
  shard progress survives rewinds. Best times + shards are saved per sector;
  finish under the par time for a gold medal.

Death is cheap: it just makes another ghost.

---

### Design / code notes

- Classic `<script>` modules over a single `OX` namespace — runs from `file://`.
- Fixed-timestep simulation (60 Hz) with deterministic, time-based hazards, so
  echo playback always matches the world it was recorded in.
- Terrain pre-rendered once per sector to an offscreen canvas; particles pooled.
- All art is procedural Canvas 2D; all audio is synthesized WebAudio.
- Progress persists in `localStorage` (`oxalpha_save_v1`). Wipe it anytime from
  SECTOR SELECT → WIPE SAVE.
