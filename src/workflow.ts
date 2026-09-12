import { createRun, Ledger } from "./ledger.ts";
import { runCheck } from "./verification.ts";
import type { Config, Report, Role, Run, Task, TaskStatus, Worker } from "./types.ts";

const taskStatuses = new Set<TaskStatus>(["pending", "done", "dropped"]);
const text = (value: unknown, limit: number) => typeof value === "string" && !!value.trim() && value.length <= limit;

export function validateReport(role: Role, value: Report): Report {
  if (!value || !text(value.summary, 12000)) throw new Error("Worker must report a nonempty summary (max 12000 characters)");
  if (value.notes !== undefined && (typeof value.notes !== "string" || value.notes.length > 12000)) throw new Error("Invalid worker notes");
  for (const [field, list] of [["tasks", value.tasks], ["newTasks", value.newTasks]] as const) {
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length > 12 || list.some(item => !text(item, 2000))) throw new Error(`Invalid ${field}`);
  }
  if (role === "plan" && (!Array.isArray(value.tasks) || !value.tasks.length)) throw new Error("Plan requires 1-12 concrete tasks");
  if (value.newTask !== undefined && !text(value.newTask, 2000)) throw new Error("Invalid new task");
  if (value.taskUpdates !== undefined && (!Array.isArray(value.taskUpdates) || value.taskUpdates.length > 100 ||
    value.taskUpdates.some(update => !update || typeof update.id !== "string" || !taskStatuses.has(update.status)))) {
    throw new Error("taskUpdates must contain { id, status: pending | done | dropped }");
  }
  if (role === "manage") {
    if (value.decision !== "done" && value.decision !== "work") throw new Error("Manager must decide work or done");
    if (value.decision === "work" && !value.taskId && !value.newTask) throw new Error("Manager must select taskId or newTask");
  }
  if (role === "review" && value.verdict !== "pass" && value.verdict !== "fail") throw new Error("Reviewer must report verdict pass or fail");
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
      if (run.phase !== "plan" && run.phase !== "ideate") run.phase = "manage";
      run.verifiedRevision = null;
      run.reviewedRevision = null;
      run.reviewVerdict = null;
      run.status = "running";
      run.reason = "";
      run.handoff = "";
      run.failures = 0;
    }
    const current = run;
    const save = () => ledger.save(current);
    const addTask = (description: string): Task => {
      const existing = current.tasks.find(t => t.description.trim().toLowerCase() === description.trim().toLowerCase());
      if (existing) return existing;
      if (current.tasks.length >= 100) throw new Error("Task ledger limit reached");
      const task: Task = { id: `t${current.tasks.length + 1}`, description, status: "pending", attempts: 0, result: "" };
      current.tasks.push(task);
      return task;
    };
    const invoke = async (role: Role, task?: Task, guidance?: string) => {
      signal.throwIfAborted();
      if (current.tokens >= config.maxTokens) throw new Error("Token budget reached; increase maxTokens before resuming");
      current.phase = role;
      await save();
      onProgress(`${role}${task ? `: ${task.description}` : ""}`);
      const onTokens = (tokens: number) => {
        current.tokens += tokens;
        if (current.tokens >= config.maxTokens) controller.abort(new Error("Token budget reached"));
      };
      let report: Report | undefined;
      // A transport error or a malformed report costs one attempt, not the whole run.
      for (let attempt = 0; report === undefined; attempt++) {
        try {
          report = validateReport(role, await worker({ role, run: structuredClone(current), task, guidance, signal, onProgress, onTokens }));
        } catch (error) {
          signal.throwIfAborted();
          current.failures++;
          await save();
          if (attempt >= config.maxFailures) throw error;
          onProgress(`${role}: retrying after ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      current.lastSummary = report.summary;
      if (report.notes) current.notes = report.notes;
      // Proposals are suggested next steps, curated into the task list by the next manager.
      if (role === "ideate" || role === "work") current.proposals = report.tasks ?? [];
      await save();
      options.onReport?.(role, report);
      return report;
    };
    const curate = (report: Report) => {
      for (const update of report.taskUpdates ?? []) {
        const task = current.tasks.find(t => t.id === update.id);
        if (task && task.status !== "working") task.status = update.status;
      }
      for (const description of report.newTasks ?? []) addTask(description);
      current.proposals = [];
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
      current.tasks = report.tasks!.map((description, index) => ({ id: `t${index + 1}`, description, status: "pending", attempts: 0, result: "" }));
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
      curate(decision);
      await save();
      if (decision.decision === "done") {
        if (!config.checks.length) {
          current.status = "paused";
          current.reason = "Configure verification commands in .pi/gvs.json, then /gvs resume. Completion is not verified.";
          break;
        }
        // Always rerun checks at completion, including after resume or outside edits.
        await verify();
        const verified = current.verifiedRevision === current.revision;
        if (verified && !config.review) {
          current.status = "completed";
          current.reason = decision.summary;
          break;
        }
        if (verified) {
          // Checks constrain the repository, not the goal. A fresh reader judges the goal.
          const review = await invoke("review");
          current.reviewedRevision = current.revision;
          current.reviewVerdict = review.verdict!;
          await save();
          if (review.verdict === "pass") {
            current.status = "completed";
            current.reason = review.summary;
            break;
          }
        }
        // Avoid an unbounded manager-only loop when it repeatedly ignores failing evidence.
        if (current.steps >= config.maxSteps) {
          current.status = "paused";
          current.reason = verified ? "Worker step limit reached with unmet review findings" : "Worker step limit reached with failing verification";
          break;
        }
        decision.decision = "work";
        decision.taskId = undefined;
        decision.newTask = verified
          ? "Address the review findings recorded in the last summary."
          : "Fix the failing configured checks; inspect the recorded failures and current files.";
      }
      if (current.steps >= config.maxSteps) {
        current.status = "paused"; current.reason = "Worker step limit reached; increase maxSteps before resuming"; break;
      }
      const task = decision.newTask ? addTask(decision.newTask) : current.tasks.find(t => t.id === decision.taskId);
      if (!task) throw new Error(`Unknown task ${decision.taskId}`);
      current.repeats = task.id === current.lastTaskId ? current.repeats + 1 : 0;
      current.lastTaskId = task.id;
      if (current.repeats >= config.maxRepeats) {
        current.status = "paused";
        current.reason = `No progress: ${task.id} was reassigned ${current.repeats + 1} times without resolving it`;
        break;
      }
      task.status = "working";
      task.attempts++;
      current.steps++;
      current.revision++;
      current.verifiedRevision = null;
      current.reviewedRevision = null;
      current.reviewVerdict = null;
      const report = await invoke("work", task, current.repeats
        ? "The previous attempt at this exact task did not resolve it. Take a materially different approach instead of refining the last one."
        : undefined);
      // Only the manager marks a task done; a worker returning is not evidence of success.
      task.status = "pending";
      task.result = report.summary;
      current.phase = "manage";
      await save();
      if (config.checks.length) await verify();
    }
    // A run that stops without a verified completion still owes an account of the working tree.
    if (current.status === "paused" && !signal.aborted) {
      try { current.handoff = (await invoke("finalize")).summary; }
      catch (error) {
        if (signal.aborted) throw error;
        current.handoff = `Handoff unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }
      current.phase = "manage";
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
