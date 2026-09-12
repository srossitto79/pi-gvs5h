import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaults, readConfig } from "../src/config.ts";
import { createRun, Ledger } from "../src/ledger.ts";
import { workflow } from "../src/workflow.ts";
import { runCheck } from "../src/verification.ts";
import type { Config, Worker } from "../src/types.ts";

const directory = () => mkdtemp(join(tmpdir(), "pi-gvs-test-"));
const config: Config = { ...defaults, checks: [{ name: "test", command: process.execPath, args: ["-e", "process.exit(0)"] }] };
const worker: Worker = async ({ role, run }) => {
  if (role === "plan") return { summary: "Implement and check", tasks: ["Implement feature"] };
  if (role === "ideate") return { summary: "Compare approaches", notes: "Use the simplest compatible change" };
  if (role === "manage") return run.steps ? { summary: "Feature implemented", decision: "done" } : { summary: "Implement", decision: "work", taskId: "t1" };
  return { summary: "Implemented feature" };
};

test("fresh role sequence and successful completion requires final checks", async () => {
  const cwd = await directory();
  const roles: string[] = [];
  let checks = 0;
  const run = await workflow({ cwd, goal: "Add feature", config, signal: new AbortController().signal, onProgress() {},
    worker: async request => { roles.push(request.role); request.onTokens(10); return worker(request); },
    verify: async () => { checks++; return { name: "test", passed: true, output: "ok", finishedAt: "now" }; },
  });
  assert.equal(run.status, "completed");
  assert.deepEqual(roles, ["plan", "ideate", "manage", "work", "manage"]);
  assert.equal(checks, 2);
  assert.equal(run.tokens, 50);
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
});

test("no configured checks pauses; resume reloads config and verifies", async () => {
  const cwd = await directory();
  const options = { cwd, signal: new AbortController().signal, onProgress() {}, worker };
  const paused = await workflow({ ...options, goal: "Feature", config: { ...config, checks: [] } });
  assert.equal(paused.status, "paused");
  const completed = await workflow({ ...options, config });
  assert.equal(completed.id, paused.id);
  assert.equal(completed.status, "completed");
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
  const resumed = await workflow({ cwd, config, signal: new AbortController().signal, onProgress() {},
    worker: async request => {
      if (request.role === "manage" && request.run.tasks[0].status === "pending") return { summary: "Recover partial edits", decision: "work", taskId: "t1" };
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
  await writeFile(join(cwd, ".pi", "gvs.json"), '{"checks":[{"command":"node"}]}');
  await assert.rejects(readConfig(cwd), /checks/);
  const ledger = new Ledger(cwd);
  await ledger.save(createRun("saved"));
  assert.equal(JSON.parse(await readFile(join(cwd, ".pi", "gvs", "run.json"), "utf8")).goal, "saved");
});
