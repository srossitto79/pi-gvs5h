import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAssistantMessageEventStream, type AssistantMessage, type Context } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createPiWorker } from "../src/pi-worker.ts";
import { createRun } from "../src/ledger.ts";
import { defaults } from "../src/config.ts";

test("real Pi SDK: fresh contexts, repository guidance, no recursive extensions, reporting stops writes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-gvs-sdk-"));
  const agentDir = join(cwd, "agent");
  await mkdir(join(cwd, ".pi", "extensions"), { recursive: true });
  await writeFile(join(cwd, "AGENTS.md"), "Unique project rule: preserve the turquoise widget.");
  await writeFile(join(cwd, ".pi", "extensions", "bad.ts"), 'throw new Error("Recursive extension was loaded");');
  const contexts: Context[] = [];
  const runtime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null,
    modelsStorePath: join(agentDir, "models-store.json"), refreshOnCreate: false });
  runtime.registerProvider("gvs-test", {
    baseUrl: "http://127.0.0.1:1", api: "openai-completions", apiKey: "fake-local-key",
    models: [{ id: "fake", name: "Fake", reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 1000 }],
    streamSimple: (model, context) => {
      contexts.push({ systemPrompt: context.systemPrompt, messages: structuredClone(context.messages),
        tools: context.tools?.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) });
      const stream = createAssistantMessageEventStream();
      const report = { summary: "Plan", tasks: ["Implement"], notes: "A finding" };
      const message: AssistantMessage = {
        role: "assistant", api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
        stopReason: "toolUse", content: [
          { type: "toolCall", id: "report", name: "gvs_report", arguments: report },
          { type: "toolCall", id: "late-write", name: "write", arguments: { path: "should-not-exist.txt", content: "bad" } },
        ],
        usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      };
      stream.push({ type: "done", reason: "toolUse", message });
      stream.end();
      return stream;
    },
  });
  const model = runtime.getModel("gvs-test", "fake");
  assert.ok(model);
  const runWorker = createPiWorker({ cwd, agentDir, model, modelRuntime: runtime, config: defaults });
  for (const role of ["plan", "work"] as const) {
    const report = await runWorker({ role, run: createRun("Test"), signal: new AbortController().signal, onTokens() {}, onProgress() {} });
    assert.equal(report.summary, "Plan");
  }
  assert.equal(contexts.length, 2, "report ends each invocation without an extra model turn");
  assert.ok(contexts.every(c => c.messages.length === 1), "fresh history for each role");
  assert.ok(contexts.every(c => c.systemPrompt?.includes("turquoise widget")));
  assert.ok(!contexts[0].tools?.some(t => t.name === "write"));
  assert.ok(contexts[1].tools?.some(t => t.name === "write"));
  await assert.rejects(readFile(join(cwd, "should-not-exist.txt")), { code: "ENOENT" });
});

test("real Pi SDK: an assignment is bounded, warned before the bound, and salvaged by a summarizer", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-gvs-bound-"));
  const agentDir = join(cwd, "agent");
  await mkdir(agentDir, { recursive: true });
  const contexts: Context[] = [];
  const temperatures: (number | undefined)[] = [];
  const runtime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null,
    modelsStorePath: join(agentDir, "models-store.json"), refreshOnCreate: false });
  runtime.registerProvider("gvs-test", {
    baseUrl: "http://127.0.0.1:1", api: "openai-completions", apiKey: "fake-local-key",
    models: [{ id: "fake", name: "Fake", reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 1000 }],
    streamSimple: (model, context, options) => {
      contexts.push({ systemPrompt: context.systemPrompt, messages: structuredClone(context.messages) });
      temperatures.push(options?.temperature);
      const summarizing = context.systemPrompt?.includes("cut off") === true;
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = {
        role: "assistant", api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
        stopReason: summarizing ? "stop" : "toolUse",
        content: summarizing
          ? [{ type: "text", text: "It was rewriting the parser and had not finished the tokenizer." }]
          : [{ type: "text", text: "Still exploring the repository." }, { type: "toolCall", id: `ls-${contexts.length}`, name: "ls", arguments: { path: "." } }],
        usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      };
      stream.push({ type: "done", reason: summarizing ? "stop" : "toolUse", message });
      stream.end();
      return stream;
    },
  });
  const model = runtime.getModel("gvs-test", "fake");
  assert.ok(model);
  const config = { ...defaults, maxWorkerTurns: 4 };
  const runWorker = createPiWorker({ cwd, agentDir, model, modelRuntime: runtime, config });
  let tokens = 0;
  const task = { id: "t1", description: "Rewrite the parser", status: "working" as const, attempts: 1, result: "" };
  const report = await runWorker({ role: "work", run: createRun("Test"), task,
    signal: new AbortController().signal, onTokens: n => { tokens += n; }, onProgress() {} });
  assert.equal(report.incomplete, true);
  assert.match(report.summary, /did not finish this task/);
  assert.match(report.summary, /stopped at its call bound after 4 turns/);
  assert.match(report.summary, /had not finished the tokenizer/, "the partial attempt is summarized for the manager");
  assert.equal(contexts.length, 5, "four bounded turns plus one summarizer call");
  assert.equal(tokens, 75, "the summarizer call is charged to the run budget");
  // The warning lands before the bound so the work can still be written down.
  const warning = contexts[3].messages.filter(m => m.role === "user" && JSON.stringify(m.content).includes("Budget notice"));
  assert.equal(warning.length, 1);
  assert.ok(!JSON.stringify(contexts[2].messages).includes("Budget notice"));
  assert.ok(contexts[0].systemPrompt?.includes("at most 4 turns"));
  assert.deepEqual(temperatures, [0.2, 0.2, 0.2, 0.2, 0.2], "a non-reasoning model receives the per-role temperature");
  // A role with nothing on disk to salvage fails loudly instead of inventing a report.
  await assert.rejects(runWorker({ role: "manage", run: createRun("Test"),
    signal: new AbortController().signal, onTokens() {}, onProgress() {} }), /manage stopped at its call bound/);
});
