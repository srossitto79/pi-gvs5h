import { createRun, Ledger } from "./ledger.ts";
import { runCheck } from "./verification.ts";
import type { Config, Report, Role, Run, Task, Worker } from "./types.ts";

export function validateReport(role: Role, value: Report): Report {
  if (!value || typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 12000) throw new Error("Worker must report a nonempty summary (max 12000 characters)");
  if (value.notes !== undefined && (typeof value.notes !== "string" || value.notes.length > 12000)) throw new Error("Invalid worker notes");
  if (role === "plan" && (!Array.isArray(value.tasks) || !value.tasks.length || value.tasks.length > 12 ||
    value.tasks.some(t => typeof t !== "string" || !t.trim() || t.length > 2000))) throw new Error("Plan requires 1–12 concrete tasks");
  if (role === "manage" && value.decision !== "done" && value.decision !== "work") throw new Error("Manager must decide work or done");
  if (role === "manage" && value.decision === "work" && !value.taskId && !value.newTask) throw new Error("Manager must select taskId or newTask");
  if (value.newTask && (typeof value.newTask !== "string" || value.newTask.length > 2000)) throw new Error("Invalid new task");
  return value;
}

export interface WorkflowOptions {
  cwd: string;
  goal?: string;
  config: Config;
  worker: Worker;
  signal: AbortSignal;
  onProgress: (text: string) => void;
  onReport?: (role: Role, report: Report) => void;
  verify?: typeof runCheck;
}

export async function workflow(options: WorkflowOptions): Promise<Run> {
  const { cwd, config, worker, onProgress } = options;
  const ledger = new Ledger(cwd);
  const unlock = await ledger.lock();
  const controller = new AbortController();
  const signal = AbortSignal.any([options.signal, controller.signal]);
  const timer = setTimeout(() => controller.abort(new Error("Run time limit reached")), config.runTimeoutMs);
  let run: Run | undefined;
  try {
    const previous = await ledger.load();
    if (options.goal) {
      if (previous && previous.status !== "completed") throw new Error("An unfinished run exists. Use /gvs resume or /gvs reset first.");
      run = createRun(options.goal);
    } else {
      if (!previous) throw new Error("No saved GVS run to resume");
      run = previous;
      if (run.status === "completed") return run;
      // A crash may leave partial edits. Re-plan from actual files; never accept old verification.
      for (const task of run.tasks) if (task.status === "working") task.status = "pending";
      if (run.phase === "work") run.phase = "manage";
      run.verifiedRevision = null;
      run.status = "running";
      run.reason = "";
    }
    const current = run;
    const save = () => ledger.save(current);
    const invoke = async (role: Role, task?: Task) => {
      signal.throwIfAborted();
      if (current.tokens >= config.maxTokens) throw new Error("Token budget reached; increase maxTokens before resuming");
      current.phase = role;
      await save();
      onProgress(`${role}${task ? `: ${task.description}` : ""}`);
      const result = await worker({ role, run: structuredClone(current), task, signal, onProgress,
        onTokens: (tokens) => {
          current.tokens += tokens;
          if (current.tokens >= config.maxTokens) controller.abort(new Error("Token budget reached"));
        },
      });
      signal.throwIfAborted();
      const report = validateReport(role, result);
      current.lastSummary = report.summary;
      if (report.notes) current.notes = report.notes;
      await save();
      options.onReport?.(role, report);
      return report;
    };
    const verify = async () => {
      current.checks = [];
      current.verifiedRevision = null;
      await save();
      for (const check of config.checks) {
        signal.throwIfAborted();
        onProgress(`verify: ${check.name}`);
        current.checks.push(await (options.verify ?? runCheck)(cwd, check, config.checkTimeoutMs, signal));
        await save();
      }
      signal.throwIfAborted();
      if (current.checks.length && current.checks.every(c => c.passed)) current.verifiedRevision = current.revision;
      await save();
    };
    await save();
    if (current.phase === "plan") {
      const report = await invoke("plan");
      current.plan = report.summary;
      current.tasks = report.tasks!.map((description, index) => ({ id: `t${index + 1}`, description, status: "pending" }));
      current.phase = "ideate";
      await save();
    }
    if (current.phase === "ideate") {
      await invoke("ideate");
      current.phase = "manage";
      await save();
    }
    for (;;) {
      const decision = await invoke("manage");
      if (decision.decision === "done") {
        if (!config.checks.length) {
          current.status = "paused";
          current.reason = "Configure verification commands in .pi/gvs.json, then /gvs resume. Completion is not verified.";
          break;
        }
        // Always rerun checks at completion, including after resume or outside edits.
        await verify();
        if (current.verifiedRevision === current.revision) {
          current.status = "completed";
          current.reason = decision.summary;
          break;
        }
        // Avoid an unbounded manager-only loop when it repeatedly ignores failing checks.
        if (current.steps >= config.maxSteps) {
          current.status = "paused"; current.reason = "Worker step limit reached with failing verification"; break;
        }
        decision.decision = "work";
        decision.taskId = undefined;
        decision.newTask = "Fix the failing configured checks; inspect the recorded failures and current files.";
      }
      if (current.steps >= config.maxSteps) {
        current.status = "paused"; current.reason = "Worker step limit reached; increase maxSteps before resuming"; break;
      }
      let task = current.tasks.find(t => t.id === decision.taskId);
      if (decision.newTask) {
        if (current.tasks.length >= 100) throw new Error("Task ledger limit reached");
        task = { id: `t${current.tasks.length + 1}`, description: decision.newTask, status: "pending" };
        current.tasks.push(task);
      }
      if (!task) throw new Error(`Unknown task ${decision.taskId}`);
      task.status = "working";
      current.steps++;
      current.revision++;
      current.verifiedRevision = null;
      await invoke("work", task);
      task.status = "done";
      current.phase = "manage";
      await save();
      if (config.checks.length) await verify();
    }
    await save();
    return current;
  } catch (error) {
    if (!run) throw error;
    run.status = options.signal.aborted ? "cancelled" : signal.aborted ? "paused" : "failed";
    run.reason = String(signal.reason instanceof Error ? signal.reason.message : error instanceof Error ? error.message : error);
    await ledger.save(run);
    return run;
  } finally {
    clearTimeout(timer);
    await unlock();
  }
}
