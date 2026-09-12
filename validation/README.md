# Validation harness

Measures whether the GVS workflow actually beats an ordinary Pi session on repository work, on
tasks with an external ground truth. Nothing here runs during `npm test`; it is the experiment,
not the unit suite.

The instances are bug-fix tasks on real, shipped JavaScript codebases: the platformer entries from
`local models evaluation / Make a Platformer Game`, each with a defect that was found, reproduced
and localised by hand during that evaluation. Those codebases are copied into
[`repos/`](repos/) and are never modified — every run works on a throwaway copy. The source
evaluation repository is not touched by anything here.

Two properties make this corpus worth using. Each defect has a **known correct outcome**, so a run
can be graded automatically rather than by eye. And the codebases were generated privately, weeks
ago, so there is **no training contamination** — a measured gap is a real gap.

## Layout

```
validation/
  repos/<name>/            pristine as-shipped codebase; read-only fixture
  instances/<id>/
    instance.json          the goal given to the agent, and the agent-visible checks
    grade.mjs              HELD-OUT grader; never enters the working tree
    fixtures/
      reference-fix/       a repair that must be accepted
      cheat-*/             repairs that satisfy the bug report but damage something else
  lib/sandbox.mjs          loads a browser game into a Node VM, so grading needs no browser
  lib/report.mjs           grader output plumbing
  tools/syntax-check.mjs   agent-visible check for entries that ship no tooling of their own
  run.mjs                  runs one instance, one arm, one pass
  selftest.mjs             tests the graders
  runner-selftest.mjs      tests run.mjs against a local fake model
  results/                 run output (gitignored)
```

## Running

```powershell
npm run validate                                              # test the graders and the runner
node validation/run.mjs --instance qwen-next-speed-cap --arm none
node validation/run.mjs --instance qwen-next-speed-cap --arm plain --provider <p> --model <m>
node validation/run.mjs --instance qwen-next-speed-cap --arm gvs   --provider <p> --model <m>
```

Each run writes `results/<instance>/<arm>-<stamp>/` containing `result.json` (verdict, per-check
detail, tokens, changed files, and for the gvs arm the whole workflow ledger), `diff.patch`, and
the RPC transcript.

### The arms

| Arm | What it is |
| --- | --- |
| `none` | Grades the as-shipped copy. Spends nothing. This is how the defect is confirmed present. |
| `plain` | One ordinary Pi session, given the goal as a normal prompt. |
| `gvs` | The same goal through `/gvs`, with `instance.json`'s checks written to `.pi/gvs.json`. |

The two model arms differ in the scaffold and nothing else: same model, same thinking level, same
goal text, same tools, and both are told in the goal what the repository offers for checking its
own work. Do not tighten one arm's budget against the other — record tokens for both and compare
score against cost, the way the GVS5H paper does.

## How an instance is graded

Two kinds of check, following SWE-bench:

- **`fail_to_pass`** — the defect. Must fail on the as-shipped repository and pass after a repair.
- **`pass_to_pass`** — behaviour the repair must preserve. Must pass on both, which is what catches
  a repair that deletes the feature instead of fixing it.

Graders drive real game code through [`lib/sandbox.mjs`](lib/sandbox.mjs), which loads the
`<script>`-tag sources into a Node VM behind a stub `window`. No browser, no dependency. Two
details make that enough for drawing defects as well as logic ones. The stub canvas records every
text and rectangle with the state that affects layout, so a grader can turn what the game drew
back into boxes. And it reproduces the one place a real canvas throws rather than ignoring bad
input — the gradient constructors reject non-finite values — so a game that computes a NaN
coordinate fails here exactly as it fails in a browser. What still needs a real browser is
anything about pixels: colour, contrast, scaling, whether a thing is legible.

The sources are concatenated and run as a single script, because classic `<script>` tags share one
global lexical environment and Node's `vm` gives each call its own. Without that, a top-level
`const` in one file is invisible to the next and the game does not boot.

`npm run validate` asserts, for every instance, that the as-shipped code fails on a
`fail_to_pass` check and on nothing else, that the stored reference fix is accepted, and that each
stored cheat is rejected. Run it after touching a grader — a grader that rejects every possible
repair looks exactly like a hard instance.

It then drives both model arms of `run.mjs` end to end against a local fake model that applies the
stored reference fix, checking that each arm reaches a pass verdict, that the edit is attributed,
that a patch is captured and that usage is recorded from the right source — the ledger for `gvs`,
the transcript for `plain`. This caught the failure mode that matters most: the terminal signal for
the `plain` arm was originally the RPC acknowledgement of the prompt, which arrives *before* any
work, so that arm was being killed after 366 ms and scored as having changed nothing. A harness bug
of that shape does not look like a bug; it looks like the scaffold winning. What the fake model
cannot test is a real provider's streaming, thinking blocks or retries.

## Adding an instance

1. Copy the entry into `repos/<name>/` unmodified.
2. Write the goal in `instance.json` from the defect as a user would report it. State the symptom
   and any contract the fix must respect; **leave out the file and line**, or you are benchmarking
   reading comprehension. Set `checks` to tooling the entry already ships and that already passes;
   where it ships none, point at `{{harness}}/tools/syntax-check.mjs`, which `run.mjs` resolves to
   this directory so the checker stays outside the working tree.
3. Write `grade.mjs` with at least one `fail_to_pass` and enough `pass_to_pass` guards that an
   obvious shortcut is refused.
4. Store `fixtures/reference-fix/` and one `fixtures/cheat-*/` per guard you claim to need.
5. Run `npm run validate` until the expectations hold.

## Notes and gotchas

- **`validation/package.json` declares `"type": "commonjs"`.** The host package is an ES module,
  and without that boundary the entries' own CommonJS tooling fails inside a work directory. The
  fixtures stay byte-identical to what was shipped.
- **The work directory is a git repository.** `run.mjs` commits the as-shipped state first, so an
  agent's edits come out as a patch and changed files are counted.
- **Keep graders and fixtures out of the working tree.** They live under `instances/`, which is
  never copied into a run. A grader on disk during a run is an agent reading the answer.
- **Narrow instances will not show the scaffold at its best.** A one-line clamp does not need a
  plan, an ideation pass and a review, and on tasks like this the scaffold should be expected to
  cost more for the same result. Add wide instances — porting a mechanic between entries, or fixing
  every defect in one entry under a single budget — before drawing conclusions.

## Instances

| Id | Repo | Class | Defect |
| --- | --- | --- | --- |
| [`qwen-next-speed-cap`](instances/qwen-next-speed-cap/) | qwen-next (REVERB) | numeric | The horizontal limiter decays instead of clamping, so the player runs at ~940 px/s against a configured 265 and every level falls to holding one key. |
| [`ox-alpha-rewind-crash`](instances/ox-alpha-rewind-crash/) | ox-alpha (ECHO PROTOCOL) | crash | The first rewind creates an echo with no position, the renderer receives NaN, and the canvas throws on every frame afterwards. Blocks the game's core mechanic. |
| [`lodestar-hud-overlap`](instances/lodestar-hud-overlap/) | qwen3.8-27b-q4 (LODESTAR) | layout | The shard counter and the run clock are placed 64px apart and render on top of each other. |

Each grader reproduces the symptom the original evaluation recorded by hand: 942.7 px/s against a
measured 940, the exact `createLinearGradient` TypeError from the quoted stack trace, and a 49.5px
collision between the two readouts that were seen smeared together as `0:24857`. Agreement that
close is the evidence these graders drive the real games rather than a model of them.

### A candidate that was dropped

`gpt_sol_pi`'s chapter-2 spawn defect — the player spawns inside a patrolling enemy and loses a
heart before touching a key — is a good defect and is not here. The entry is a single file wrapped
in an IIFE that exposes no handle, so grading it would mean either instrumenting the code under
test or inferring health by counting heart-shaped fill calls. The first changes what is being
graded and the second breaks the moment anyone restyles the HUD. Entries that expose a namespace
or a debug handle, as the three above do, are cheap to grade honestly; ones that do not are worth
skipping rather than grading badly.
