import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAssistantMessageEventStream, type AssistantMessage, type Context } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createPiWorker } from "../src/pi-worker.ts";
import { createRun } from "../src/ledger.ts";

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
  const runWorker = createPiWorker({ cwd, agentDir, model, modelRuntime: runtime });
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
