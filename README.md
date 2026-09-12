# pi-gvs5h

A `/gvs` command for standard Pi. It plans a coding task, explores approaches, then alternates a fresh manager with fresh coding workers. A persistent ledger carries the plan, findings and check results between sessions. No Pi fork is required.

## Install and use

Requires Node >=22.19.0 and Pi. Tested with Pi 0.85.1.

From the project you want to work on:

```powershell
pi install -l W:/PI-Agent/pi-gvs5h
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

Choose checks appropriate to the repository. Exit code zero means passed. Tests should be deterministic and should not edit source files. Results include capped output for diagnosis. A failing check forces repair work, even if the manager declares success. Checks run after each worker and again immediately before completion. Passing checks supports the result but does not prove every aspect of the requested feature is correct; review the diff.

With no checks configured, implementation may proceed but the workflow pauses instead of claiming verified completion. Add checks and `/gvs resume`.

`maxSteps` limits editing attempts across resumes. `maxTokens` counts reported input/output/cache usage across saved calls; it is checked after model responses, so one response may overshoot it. A process crash can lose usage from the current uncheckpointed call. It is a practical spending guard, not an exact billing cap. `runTimeoutMs` applies to each start/resume invocation. `checkTimeoutMs` applies to each check. Increase a reached cumulative budget in the config before resuming.

## Persistence and recovery

State lives in `.pi/gvs/run.json`; writes use a temporary file and rename. `/gvs reset` archives this file. Add `.pi/gvs/` to your project's `.gitignore` if you do not want local run state committed. The configuration `.pi/gvs.json` can be shared.

Cancellation does not roll back code. Resume asks a fresh manager to inspect partial edits and invalidates previous verification. A lock whose owning process has exited can be recovered. A live process must be stopped from its owning Pi session with `/gvs cancel`.

## Current scope

- Same selected model for every role; one editing worker at a time.
- Planners and managers have file-reading/search tools; editing workers also get edit/write and Bash or PowerShell.
- Fresh sessions retain repository `AGENTS.md` context and use stored Pi model/provider configuration and credentials.
- Worker sessions intentionally disable discovered extensions, skills and prompt templates. This prevents recursive workflows. Custom editor bridges, sandbox extensions and other host tools are **not inherited**. This version runs built-in tools directly with the Pi process's access; use a separately isolated Pi process if your setup requires isolation.
- Extension-only model providers and temporary CLI credential overrides are not copied into workers. Configure providers in Pi `models.json` and use stored credentials or environment variables.
- Standard RPC custom messages carry progress. RPC integration is tested; a specific VS Code client and its rendering have not been tested. Work is against files on disk; save editor buffers first.
- No automatic commits, worktrees, parallel editing, publishing, or durable background service. Pi must remain open. Use `/gvs cancel` for workflow cancellation; a client's generic host-agent abort is not the workflow control.

This is an initial implementation. Real-model coding quality and comparative cost have not been benchmarked.

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
Made with passion by Salvatore Rossitto srossitto. https://github.com/srossitto79