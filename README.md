# pi-gvs5h

pi-gvs5h is a Pi extension that brings the GVS5H idea into a practical repository workflow: it plans a coding task, explores approaches, then alternates a fresh manager with fresh coding workers while keeping a durable ledger of tasks, findings, and verification results across sessions. Each role runs in a fresh, bounded session, so state lives in the ledger and in the repository rather than in one growing conversation. It is designed to work with ordinary Pi installations without forking the Pi runtime.

Original GVS5H paper: [Zero-Shot Self-Orchestration with Ledger-Based Control Improves Coding in Language Models](https://github.com/slee-persis/GVS5H/tree/master/paper)


## Install and use

Requires Node >=22.19.0 and Pi. Tested with Pi 0.85.1.

From the project you want to work on:

```powershell
pi install -l pi-gvs5h
pi
```

If Pi is already running, use `/reload` after installation.

In Pi:

```text
/gvs init
```

Edit the generated `.pi/gvs.json` to specify commands that verify your project. Then select your usual Pi model and run:

```text
/gvs Implement login with password reset
```

The command returns while the workflow runs. One live panel above the editor updates in place as phases, tools, and checks change. Tool actions do not create separate transcript messages. Each phase's completed result appears as a compact Markdown entry: the plan and numbered tasks, ideation findings, manager decisions, and worker summaries. Results appear when a phase finishes, rather than streaming private reasoning. The live panel clears when the run stops. RPC clients receive keyed widget updates plus the completed result messages; widget display depends on the client. Ordinary prompts and host shell commands are blocked while the workflow is active so the host agent does not compete with workers.

| Command | Behavior |
| --- | --- |
| `/gvs <goal>` | Start a workflow using the selected model and thinking level |
| `/gvs status` | Show the latest saved state |
| `/gvs plan` | Show the saved plan and current task checklist |
| `/gvs cancel` | Stop this Pi session's workflow; preserve edits and ledger |
| `/gvs resume` | Recover the saved run using current configuration and selected model |
| `/gvs init` | Create starter configuration without overwriting an existing file |
| `/gvs reset` | Archive the ledger so a new goal can start; preserve code edits |
| `/gvs help` | Show usage |

Control words in the table are reserved when used as the entire argument. One run per project is allowed. A second Pi process cannot start another workflow while the project lock is owned by a live process.

## Verification and budgets

Example `.pi/gvs.json` for a Windows npm project:

```json
{
  "maxSteps": 8,
  "maxTokens": 200000,
  "runTimeoutMs": 1800000,
  "checkTimeoutMs": 120000,
  "maxWorkerTurns": 32,
  "maxWorkerTokens": 150000,
  "maxRepeats": 3,
  "maxFailures": 2,
  "review": true,
  "temperatures": { "plan": 0.3, "ideate": 0.4, "manage": 0.2, "work": 0.2, "review": 0.2, "finalize": 0.2 },
  "checks": [
    {
      "name": "project tests",
      "command": "powershell.exe",
      "args": ["-NoProfile", "-Command", "npm test; exit $LASTEXITCODE"]
    }
  ]
}
```

On Linux/macOS, a typical npm check is `{"name":"tests","command":"npm","args":["test"]}`. A direct executable, such as `python` with `args: ["-m", "pytest"]`, also works. Windows `.cmd` shims require an explicit shell such as the PowerShell example. Commands run from the project directory with `shell: false`; shell syntax only works when you explicitly choose a shell executable.

Choose checks appropriate to the repository. Exit code zero means passed. Tests should be deterministic and should not edit source files. Results include capped output for diagnosis. A failing check forces repair work, even if the manager declares success. Checks run after each worker and again immediately before completion.

Checks constrain the repository; they do not test the goal you typed. A green suite says nothing about whether the requested feature exists. So when checks pass and the manager declares success, a fresh reviewer with read-only tools inspects the repository and judges the goal independently, without trusting the workers' reports or the task statuses. A `fail` verdict becomes the next repair assignment, exactly as a failing check does. Set `"review": false` to complete on checks alone. Either way, review the diff.

With no checks configured, implementation may proceed but the workflow pauses instead of claiming verified completion. Add checks and `/gvs resume`.

`maxSteps` limits editing attempts across resumes. `maxTokens` counts reported input/output/cache usage across saved calls; it is checked after model responses, so one response may overshoot it. A process crash can lose usage from the current uncheckpointed call. It is a practical spending guard, not an exact billing cap. `runTimeoutMs` applies to each start/resume invocation. `checkTimeoutMs` applies to each check. Increase a reached cumulative budget in the config before resuming.

`maxWorkerTurns` and `maxWorkerTokens` bound one assignment. At three quarters of the bound the worker is told how little is left and to write what it has to disk; at the bound its session stops. An editing worker stopped that way does not fail the run: a short separate call summarizes its partial attempt, and the manager receives that summary plus whatever the worker left on disk. Other roles have nothing to salvage, so they fail and are retried instead.

`maxRepeats` stops the run when the manager reassigns one task that many times in a row without resolving it; from the second attempt the worker is told the previous one did not work and to take a different approach. `maxFailures` retries a role after a transport error or a malformed report before the run is abandoned.

`temperatures` sets sampling per role, higher where the work is generative than where it is executive. It is sent only where the provider accepts it: a model with extended thinking on, or one that rejects the field, is called without it.

## Persistence and recovery

State lives in `.pi/gvs/run.json`; writes use a temporary file and rename. `/gvs reset` archives this file. Add `.pi/gvs/` to your project's `.gitignore` if you do not want local run state committed. The configuration `.pi/gvs.json` can be shared.

Cancellation does not roll back code. Resume asks a fresh manager to inspect partial edits and invalidates previous verification and review. A lock whose owning process has exited can be recovered. A live process must be stopped from its owning Pi session with `/gvs cancel`. A ledger written by an earlier version is migrated on load rather than rejected.

A run that stops without a verified completion ends with a read-only handoff: what was changed, what works, what is incomplete, and the next steps. It is stored in the ledger and shown with `/gvs status`. A run you cancel yourself does not spend a call on one.

## The loop

| Phase | Role | Does |
| --- | --- | --- |
| plan | read-only | A strategy and 1–12 seed tasks. |
| ideate | read-only | Distinct approaches and pitfalls into the notes, plus proposals for the task list. |
| manage | read-only | Curates the task list — marks done, drops superseded, folds in proposals — then assigns one task, or declares the goal met. |
| work | editing | Implements that one task, rewrites the shared notes, proposes next steps. |
| verify | no model | Runs the configured checks against the current revision. |
| review | read-only | Independently judges the goal once checks pass. |
| finalize | read-only | Writes the handoff when the run stops without a verified completion. |

A task is done only when the manager marks it done. A worker returning is recorded as an attempt with its result, not as success.

## Current scope

- Same selected model for every role; one editing worker at a time.
- Planners, managers, reviewers and the finalizer have file-reading/search tools; editing workers also get edit/write and Bash or PowerShell.
- Fresh sessions retain repository `AGENTS.md` context and use stored Pi model/provider configuration and credentials.
- Worker sessions intentionally disable discovered extensions, skills and prompt templates. This prevents recursive workflows. Custom editor bridges, sandbox extensions and other host tools are **not inherited**. This version runs built-in tools directly with the Pi process's access; use a separately isolated Pi process if your setup requires isolation.
- Extension-only model providers and temporary CLI credential overrides are not copied into workers. Configure providers in Pi `models.json` and use stored credentials or environment variables.
- Standard RPC custom messages carry progress. RPC integration is tested; a specific VS Code client and its rendering have not been tested. Work is against files on disk; save editor buffers first.
- No automatic commits, worktrees, parallel editing, publishing, or durable background service. Pi must remain open. Use `/gvs cancel` for workflow cancellation; a client's generic host-agent abort is not the workflow control.

This is an initial implementation. Real-model coding quality and comparative cost have not been benchmarked: the accuracy gains reported in the GVS5H paper were measured on single-file competitive-programming problems with problem-supplied sample tests, and nothing here establishes that they transfer to repository work.

## Development and validation

```powershell
npm ci --ignore-scripts
npm run check
npm test
```

Tests use fake workers, a fake SDK provider, and a localhost OpenAI-compatible fixture. They cover workflow sequencing, verification gates, cancellation/recovery, limits, locks, isolated SDK contexts, preventing post-report edits, RPC command discovery, and an end-to-end file edit with checks through an unmodified Pi process. They do not call paid models.

Pi libraries are peer dependencies, following Pi package conventions; exact development versions and the lockfile record the tested environment. Neither upstream reference checkout is modified by this package.

## Attribution

Inspired by [GVS5H](https://github.com/slee-persis/GVS5H), especially its ledger-based self-orchestration in `codebase/v2-current/escalation/multiagent.py`, and built on [Pi](https://github.com/earendil-works/pi). This is an independent implementation for repository work, not a reproduction of GVS5H's benchmark results. No paper assets or benchmark datasets are bundled.

Made with passion by Salvatore Rossitto https://github.com/srossitto79