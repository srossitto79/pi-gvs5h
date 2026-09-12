import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaults, readConfig } from "../src/config.ts";
import { createRun, Ledger } from "../src/ledger.ts";
import { workflow } from "../src/workflow.ts";
import { runCheck } from "../src/verification.ts";
import type { Config, Report, Role, Worker, WorkerRequest } from "../src/types.ts";

const directory = () => mkdtemp(join(tmpdir(), "pi-gvs-test-"));
const config: Config = { ...defaults, checks: [{ name: "test", command: process.execPath, args: ["-e", "process.exit(0)"] }] };
const worker: Worker = async ({ role, run }) => {
  if (role === "plan") return { summary: "Implement and check", tasks: ["Implement feature"] };
  if (role === "ideate") return { summary: "Compare approaches", notes: "Use the simplest compatible change", tasks: ["Try the direct edit"] };
  if (role === "manage") return run.steps ? { summary: "Feature implemented", decision: "done" } : { summary: "Implement", decision: "work", taskId: "t1" };
  if (role === "review") return { summary: "Goal met", verdict: "pass" };
  if (role === "finalize") return { summary: "Handoff written" };
  return { summary: "Implemented feature" };
};
const record = (roles: Role[], override?: (request: WorkerRequest) => Promise<Report | undefined>): Worker => async request => {
  roles.push(request.role);
  return (override && await override(request)) ?? worker(request);
};

test("fresh role sequence and successful completion requires final checks and review", async () => {
  const cwd = await directory();
  const roles: Role[] = [];
  let checks = 0;
  const run = await workflow({ cwd, goal: "Add feature", config, signal: new AbortController().signal, onProgress() {},
    worker: async request => { roles.push(request.role); request.onTokens(10); return worker(request); },
    verify: async () => { checks++; return { name: "test", passed: true, output: "ok", finishedAt: "now" }; },
  });
  assert.equal(run.status, "completed");
  assert.deepEqual(roles, ["plan", "ideate", "manage", "work", "manage", "review"]);
  assert.equal(checks, 2);
  assert.equal(run.tokens, 60);
  assert.equal(run.reviewedRevision, 1);
  assert.equal((await new Ledger(cwd).load())?.verifiedRevision, 1);
});

test("manager cannot override failing verification and repair attempts are bounded", async () => {
  const run = await workflow({ cwd: await directory(), goal: "Fix it", config: { ...config, maxSteps: 2 },
    signal: new AbortController().signal, onProgress() {}, worker,
    verify: async () => ({ name: "test", passed: false, output: "failure", finishedAt: "now" }),
  });
  assert.equal(run.status, "paused");
  assert.equal(run.steps, 2);
  assert.equal(run.verifiedRevision, null);
  assert.match(run.reason, /failing verification/);
  assert.equal(run.handoff, "Handoff written");
});

test("a failing review blocks completion even when every check passes", async () => {
  const roles: Role[] = [];
  let reviews = 0;
  const run = await workflow({ cwd: await directory(), goal: "Add feature", config: { ...config, maxSteps: 2 },
    signal: new AbortController().signal, onProgress() {},
    worker: record(roles, async ({ role }) => role === "review"
      ? { summary: `Error handling is missing (${++reviews})`, verdict: "fail" } : undefined),
    verify: async () => ({ name: "test", passed: true, output: "ok", finishedAt: "now" }),
  });
  assert.equal(run.status, "paused");
  assert.match(run.reason, /review findings/);
  assert.equal(run.reviewVerdict, "fail");
  assert.equal(roles.filter(role => role === "review").length, 2);
  // The rejected review became the repair assignment rather than a completion.
  assert.ok(run.tasks.some(task => /review findings/i.test(task.description)));
});

test("review can be switched off without losing check gating", async () => {
  const roles: Role[] = [];
  const run = await workflow({ cwd: await directory(), goal: "Add feature", config: { ...config, review: false },
    signal: new AbortController().signal, onProgress() {}, worker: record(roles),
    verify: async () => ({ name: "test", passed: true, output: "ok", finishedAt: "now" }),
  });
  assert.equal(run.status, "completed");
  assert.ok(!roles.includes("review"));
});

test("the manager curates the task list and only the manager marks work done", async () => {
  const run = await workflow({ cwd: await directory(), goal: "Add feature", config, signal: new AbortController().signal, onProgress() {},
    worker: async request => {
      if (request.role === "plan") return { summary: "Plan", tasks: ["Implement feature", "Obsolete approach"] };
      if (request.role === "manage" && !request.run.steps) {
        // Proposals from ideation are visible and folded in as a genuinely new task.
        assert.deepEqual(request.run.proposals, ["Try the direct edit"]);
        return { summary: "Curate then assign", decision: "work", taskId: "t3",
          taskUpdates: [{ id: "t2", status: "dropped" }], newTasks: ["Try the direct edit"] };
      }
      if (request.role === "manage") {
        assert.equal(request.run.tasks[2].status, "pending", "a returning worker does not mark its own task done");
        assert.equal(request.run.tasks[2].attempts, 1);
        assert.equal(request.run.tasks[2].result, "Implemented feature");
        return { summary: "Done", decision: "done", taskUpdates: [{ id: "t3", status: "done" }] };
      }
      return worker(request);
    },
    verify: async () => ({ name: "test", passed: true, output: "ok", finishedAt: "now" }),
  });
  assert.equal(run.status, "completed");
  assert.deepEqual(run.tasks.map(task => task.status), ["pending", "dropped", "done"]);
  assert.deepEqual(run.proposals, []);
});

test("reassigning one task without progress stops the run and hands off", async () => {
  const guidance: (string | undefined)[] = [];
  const run = await workflow({ cwd: await directory(), goal: "Add feature", config: { ...config, maxSteps: 20, maxRepeats: 3 },
    signal: new AbortController().signal, onProgress() {},
    worker: async request => {
      if (request.role === "work") guidance.push(request.guidance);
      if (request.role === "manage") return { summary: "Same thing again", decision: "work", taskId: "t1" };
      return worker(request);
    },
    verify: async () => ({ name: "test", passed: true, output: "ok", finishedAt: "now" }),
  });
  assert.equal(run.status, "paused");
  assert.match(run.reason, /No progress/);
  assert.equal(run.steps, 3);
  // The second and third attempts are told the previous one did not resolve it.
  assert.deepEqual(guidance.map(text => text !== undefined), [false, true, true]);
});

test("a failed role invocation is retried before the run is abandoned", async () => {
  const attempts: Role[] = [];
  const run = await workflow({ cwd: await directory(), goal: "Add feature", config, signal: new AbortController().signal, onProgress() {},
    worker: async request => {
      attempts.push(request.role);
      if (request.role === "manage" && attempts.filter(role => role === "manage").length === 1) throw new Error("provider blew up");
      return worker(request);
    },
    verify: async () => ({ name: "test", passed: true, output: "ok", finishedAt: "now" }),
  });
  assert.equal(run.status, "completed");
  assert.equal(run.failures, 1);
  const abandoned = await workflow({ cwd: await directory(), goal: "Add feature", config: { ...config, maxFailures: 1 },
    signal: new AbortController().signal, onProgress() {},
    worker: async request => request.role === "manage" ? Promise.reject(new Error("provider blew up")) : worker(request),
    verify: async () => ({ name: "test", passed: true, output: "ok", finishedAt: "now" }),
  });
  assert.equal(abandoned.status, "failed");
  assert.equal(abandoned.failures, 2);
});

test("an unfinished worker report reaches the manager instead of failing the run", async () => {
  let seen = "";
  const run = await workflow({ cwd: await directory(), goal: "Add feature", config, signal: new AbortController().signal, onProgress() {},
    worker: async request => {
      if (request.role === "work") return { summary: "The worker did not finish this task: it stopped at its call bound", incomplete: true } satisfies Report;
      if (request.role === "manage" && request.run.steps) { seen = request.run.lastSummary; return { summary: "Done", decision: "done" }; }
      return worker(request);
    },
    verify: async () => ({ name: "test", passed: true, output: "ok", finishedAt: "now" }),
  });
  assert.equal(run.status, "completed");
  assert.match(seen, /did not finish/);
});

test("no configured checks pauses; resume reloads config and verifies", async () => {
  const cwd = await directory();
  const options = { cwd, signal: new AbortController().signal, onProgress() {}, worker };
  const paused = await workflow({ ...options, goal: "Feature", config: { ...config, checks: [] } });
  assert.equal(paused.status, "paused");
  assert.equal(paused.handoff, "Handoff written");
  const completed = await workflow({ ...options, config });
  assert.equal(completed.id, paused.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.handoff, "");
});

test("cancellation persists partial task, releases lock, and resume recovers", async () => {
  const cwd = await directory();
  const controller = new AbortController();
  const cancelled = await workflow({ cwd, goal: "Feature", config, signal: controller.signal, onProgress() {},
    worker: async request => {
      if (request.role === "work") { controller.abort(new Error("Stop")); request.signal.throwIfAborted(); }
      return worker(request);
    },
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.tasks[0].status, "working");
  assert.equal(cancelled.handoff, "", "a cancelled run does not spend another call on a handoff");
  const resumed = await workflow({ cwd, config, signal: new AbortController().signal, onProgress() {},
    worker: async request => {
      if (request.role === "manage" && request.run.steps === 1) return { summary: "Recover partial edits", decision: "work", taskId: "t1" };
      return worker(request);
    },
  });
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.steps, 2);
});

test("token and elapsed limits stop a run without declaring completion", async () => {
  const limited = await workflow({ cwd: await directory(), goal: "Feature", config: { ...config, maxTokens: 10 },
    signal: new AbortController().signal, onProgress() {}, worker: async request => { request.onTokens(12); return worker(request); },
  });
  assert.equal(limited.status, "paused");
  assert.equal(limited.tokens, 12);
  const timed = await workflow({ cwd: await directory(), goal: "Feature", config: { ...config, runTimeoutMs: 20 },
    signal: new AbortController().signal, onProgress() {}, worker: async request => {
      await new Promise<void>(resolve => { request.signal.addEventListener("abort", () => resolve(), { once: true }); if (request.signal.aborted) resolve(); });
      request.signal.throwIfAborted(); return { summary: "unreachable" };
    },
  });
  assert.equal(timed.status, "paused");
  assert.match(timed.reason, /time limit/);
});

test("lock excludes another controller and invalid reports are recoverable failures", async () => {
  const cwd = await directory();
  const ledger = new Ledger(cwd);
  const unlock = await ledger.lock();
  await assert.rejects(ledger.lock(), /already running/);
  await unlock();
  const failed = await workflow({ cwd, goal: "Feature", config, signal: new AbortController().signal,
    onProgress() {}, worker: async () => ({ summary: "Missing tasks" }),
  });
  assert.equal(failed.status, "failed");
  await assert.rejects(workflow({ cwd, goal: "Another", config, signal: new AbortController().signal, onProgress() {}, worker }), /unfinished/);
  assert.equal((await ledger.load())?.id, failed.id);
});

test("verification captures errors, kills timed-out checks, and handles pre-cancel", async () => {
  const cwd = await directory();
  const failed = await runCheck(cwd, { name: "fail", command: process.execPath, args: ["-e", "console.error('broken');process.exit(2)"] }, 5000, new AbortController().signal);
  assert.equal(failed.passed, false);
  assert.match(failed.output, /broken/);
  const timed = await runCheck(cwd, { name: "slow", command: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] }, 50, new AbortController().signal);
  assert.equal(timed.passed, false);
  assert.match(timed.output, /timed out/);
  await assert.rejects(runCheck(cwd, config.checks[0], 1000, AbortSignal.abort()));
});

test("configuration is validated before executing commands", async () => {
  const cwd = await directory();
  assert.deepEqual(await readConfig(cwd), defaults);
  await mkdir(join(cwd, ".pi"));
  const write = (json: string) => writeFile(join(cwd, ".pi", "gvs.json"), json);
  await write('{"checks":[{"command":"node"}]}');
  await assert.rejects(readConfig(cwd), /checks/);
  await write('{"temperatures":{"plan":3}}');
  await assert.rejects(readConfig(cwd), /temperature for plan/);
  await write('{"temperatures":{"boss":0.2}}');
  await assert.rejects(readConfig(cwd), /Unknown temperature role/);
  await write('{"maxWorkerTurns":0}');
  await assert.rejects(readConfig(cwd), /maxWorkerTurns/);
  await write('{"review":"yes"}');
  await assert.rejects(readConfig(cwd), /review must be/);
  await write('{"maxWorkerTurns":4,"temperatures":{"work":0.5}}');
  const loaded = await readConfig(cwd);
  assert.equal(loaded.maxWorkerTurns, 4);
  assert.deepEqual(loaded.temperatures, { work: 0.5 });
  const ledger = new Ledger(cwd);
  await ledger.save(createRun("saved"));
  assert.equal(JSON.parse(await readFile(join(cwd, ".pi", "gvs", "run.json"), "utf8")).goal, "saved");
});

test("a version 1 ledger is migrated rather than rejected", async () => {
  const cwd = await directory();
  const ledger = new Ledger(cwd);
  await mkdir(join(cwd, ".pi", "gvs"), { recursive: true });
  await writeFile(join(cwd, ".pi", "gvs", "run.json"), JSON.stringify({
    version: 1, id: "old", goal: "Feature", status: "paused", phase: "manage", plan: "p", notes: "n",
    tasks: [{ id: "t1", description: "Implement feature", status: "pending" }], steps: 1, tokens: 5,
    revision: 1, verifiedRevision: 1, checks: [], lastSummary: "s", reason: "", updatedAt: "now",
  }));
  const migrated = await ledger.load();
  assert.equal(migrated?.version, 2);
  assert.deepEqual(migrated?.proposals, []);
  assert.equal(migrated?.tasks[0].attempts, 0);
  const resumed = await workflow({ cwd, config, signal: new AbortController().signal, onProgress() {}, worker,
    verify: async () => ({ name: "test", passed: true, output: "ok", finishedAt: "now" }),
  });
  assert.equal(resumed.id, "old");
  assert.equal(resumed.status, "completed");
});
