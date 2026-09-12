# GVS5H on Pi: integration decision

Date: 2026-09-12
Status: initial package implemented in `pi-gvs5h/` and installed project-locally in this workspace. Pi 0.85.1 type checking and 11 automated tests pass, including an unmodified Pi RPC process completing a file edit and verification with a localhost fake model. Real-model quality/cost and a specific VS Code client remain untested.

## Reference checkouts

Both directories are full Git clones, retained as upstream references.

| Directory | Origin | Inspected commit |
| --- | --- | --- |
| `GVS5H/` | https://github.com/slee-persis/GVS5H.git | `e46c574763e881e5343d3cca6fe1bbaab755f44e` |
| `pi/` | https://github.com/earendil-works/pi.git | `71dca871bc80b6bc97be37f0ca3189399d651fff` |

Pi's coding-agent package declares version 0.85.1 and Node >=22.19.0 at this commit. A checkout version is not proof that an identical npm release is available.

## Decision

Build a separate TypeScript Pi package, tentatively `pi-gvs5h`, alongside the reference checkouts. Keep its workflow engine separate from its Pi extension adapter. No Pi fork or agent-core replacement is currently justified.

Configuration alone can supply prompts but cannot reliably enforce scheduling, persistent state transitions, verification gates, cancellation, or budgets. Use executable extension code for these responsibilities.

## Evidence in Pi

- `packages/coding-agent/docs/packages.md`: packages can declare extensions in a `pi` manifest and be installed from local paths, Git, or npm. `-l` installs into project settings. Local packages are referenced without copying.
- `packages/coding-agent/src/core/sdk.ts`: `createAgentSession` accepts cwd, model runtime, model, tool allowlists, custom tools, resource loader, and session manager. It constructs `new Agent(...)` internally; there is no agent-instance/factory injection option in this factory.
- `packages/coding-agent/src/core/resource-loader.ts`: resource loading supports disabling discovered extensions and overriding system prompts. Worker resources must be selected deliberately to avoid loading the workflow extension recursively. Preserve required repository guidance and explicitly chosen tool extensions.
- `packages/coding-agent/src/core/extensions/types.ts`: extensions expose commands, tools, input/lifecycle hooks, user messages, and UI availability checks.
- `packages/coding-agent/examples/extensions/subagent/index.ts`: the supplied example starts child Pi processes in JSON print mode and forwards progress and cancellation. This demonstrates a second worker transport if in-process SDK sessions prove awkward.

The source supports feasibility, not a claim that the complete integration has been tested.

## Proposed implementation

```text
pi-gvs5h/
  package.json          Pi package manifest
  extensions/index.ts   commands and tools; progress and cancellation
  src/workflow.ts       manager / worker / verification loop
  src/ledger.ts         persistent state and atomic updates
  src/pi-worker.ts      fresh Pi SDK sessions and event forwarding
  src/verification.ts   configured checks and recorded results
  prompts/              role instructions
  test/                 fake-worker workflow and integration checks
```

Use one fresh context per manager or worker invocation. Reuse the configured model/auth runtime while giving each invocation its own session and bounded context. Start with one editing worker at a time. Keep the host session as the user's interface; it should not compete with a worker to edit files.

The engine owns a run identifier, goal, task states, concise findings, artifact references, verification evidence, and usage. Keep this durable workflow state separate from Pi conversation history. Resume must recover unfinished tasks without silently claiming their work completed.

Expose `/gvs <goal>` and a workflow tool so CLI and RPC clients have usable entry points. Use normal tool content/details for progress; terminal widgets are optional. Add explicit status, cancellation, and resume operations. Forward cancellation to the active worker, and release resources in cleanup handlers.

Once implemented, a local project could install it with:

```powershell
pi install -l W:/PI-Agent/pi-gvs5h
```

This is a proposed command, not an installation performed during this investigation. Pi's package documentation specifies host Pi libraries as peer dependencies rather than bundled copies. Maintain a tested host-version matrix and pin development dependencies to the tested release.

## GVS5H behavior to preserve and adapt

`GVS5H/codebase/v2-current/escalation/multiagent.py` implements initial planning, ideation, manager task selection, a sequential worker loop, sample-test feedback, and a finalization fallback. Roles use the same model with fresh message contexts. The key idea is persistent curated knowledge and adaptive task selection, not a fixed five-agent parallel topology.

Adaptations for repository work:

- Replace full `solution.py` output with normal repository edits and artifact/diff references.
- Replace parsed Markdown control headers with validated structured decisions or tools.
- Use stable task IDs; distinguish proposed work, completed work, and verified results.
- Record check results against the artifact revision they tested. Recheck after finalization edits: the reference finalizer can change the solution after the loop's sample checks.
- Add total run limits and recovery. The reference entry point clears its workspace files and is not a resumable workflow service.
- Track progress through changed artifacts and verification results, rather than only comparing the next task's description.

Retain MIT attribution for reused implementation code. Consult `GVS5H/NOTICE.md` before incorporating paper assets or run data, which have different terms.

## Prototype acceptance checks

1. Load the package into an unmodified, pinned Pi installation and invoke its command/tool.
2. Run fresh sequential workers without recursively activating orchestration; verify expected project guidance and tools are present.
3. Demonstrate failed checks prevent completion, including after final edits.
4. Demonstrate cancellation, time limits, and restart recovery with a fake model/worker before paid model runs.
5. Exercise standard progress through Pi RPC and one selected VS Code client. Editor bridges and unsaved buffers need explicit testing; arbitrary host tools are not automatically inherited by a new session.
6. Compare ordinary Pi and the workflow on the same repository tasks, model, and budget.

## When to reconsider a fork

Reconsider only after a reproducible requirement fails through public extension/SDK/RPC APIs: for example, an essential lifecycle operation unavailable to extensions or core UI changes required by the product. Prefer a small upstream hook or a custom SDK-based launcher first. A richer workflow dashboard can have its own UI adapter without replacing the model/tool loop.

The reference inspection above preceded implementation. Development dependencies are now installed inside `pi-gvs5h/`; `.pi/settings.json` loads the package locally, and `.pi/gvs.json` runs its type check and tests as workspace verification. No paid model calls were made and neither reference repository was modified.

## Implemented interface and deviations

The initial adapter exposes `/gvs <goal>`, `status`, `cancel`, `resume`, `init`, `reset`, and `help`. Progress uses standard custom messages, tested through RPC. The proposed host workflow tool is deferred: explicit commands provide the intended first interface. Each worker has an internal structured `gvs_report` tool.

Workers use fresh SDK sessions and a separately created model runtime from stored Pi configuration. They preserve repository context files but disable discovered extensions, skills, and templates; host editor and sandbox extensions are not inherited. See `pi-gvs5h/README.md` for these boundaries and budget semantics. The command runs in the current Pi process rather than a durable background service.
