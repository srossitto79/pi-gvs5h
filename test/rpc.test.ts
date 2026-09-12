import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

test("unmodified Pi RPC discovers /gvs and emits command output without a model call", { timeout: 30000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-gvs-rpc-"));
  const root = fileURLToPath(new URL("../", import.meta.url));
  const cli = resolve(root, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
  const child = spawn(process.execPath, [cli, "--mode", "rpc", "--no-session", "--no-extensions", "--no-skills", "-e", join(root, "extensions/index.ts")], {
    cwd, env: { ...process.env, PI_CODING_AGENT_DIR: join(cwd, "agent"), PI_OFFLINE: "1" }, windowsHide: true,
  });
  let buffer = "";
  let errors = "";
  const events: Record<string, unknown>[] = [];
  child.stderr.on("data", data => { errors += data.toString(); });
  child.stdout.on("data", data => {
    buffer += data.toString();
    const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
    for (const line of lines) { try { events.push(JSON.parse(line)); } catch { /* Startup diagnostics are not RPC events. */ } }
  });
  const waitFor = async (predicate: (event: Record<string, unknown>) => boolean) => {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      const event = events.find(predicate);
      if (event) return event;
      if (child.exitCode !== null) throw new Error(`Pi exited: ${errors}`);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`RPC timeout: ${errors}\n${JSON.stringify(events)}`);
  };
  try {
    child.stdin.write(JSON.stringify({ id: "commands", type: "get_commands" }) + "\n");
    const commands = await waitFor(e => e.id === "commands");
    assert.equal(commands.success, true);
    assert.match(JSON.stringify(commands.data), /"name":"gvs"/);
    child.stdin.write(JSON.stringify({ id: "help", type: "prompt", message: "/gvs help" }) + "\n");
    await waitFor(e => e.id === "help");
    await waitFor(e => JSON.stringify(e).includes("Configure checks and limits"));
    child.stdin.write(JSON.stringify({ id: "status", type: "prompt", message: "/gvs status" }) + "\n");
    await waitFor(e => e.id === "status");
    await waitFor(e => JSON.stringify(e).includes("No GVS run saved"));
    assert.ok(!events.some(e => e.type === "agent_start"));
  } finally {
    child.kill();
    await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once("close", () => resolve()); });
  }
});

test("/gvs completes a real file edit and verification through Pi RPC using a local fake model", { timeout: 30000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-gvs-e2e-"));
  const agentDir = join(cwd, "agent");
  await mkdir(agentDir);
  await mkdir(join(cwd, ".pi"));
  const requests: string[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk.toString();
    try {
      const input = JSON.parse(body) as { messages: { role: string; content: string | { type: string; text?: string }[] }[] };
      const contentText = (content: typeof input.messages[number]["content"]) => typeof content === "string" ? content : content.map(p => p.text ?? "").join("\n");
      const system = input.messages.filter(m => m.role === "system" || m.role === "developer").map(m => contentText(m.content)).join("\n");
      const role = system.includes("propose a concise plan") ? "plan" : system.includes("Explore distinct approaches") ? "ideate" : system.includes("Select ONE next task") ? "manage" : "work";
      requests.push(role);
      const data = JSON.parse(contentText(input.messages.find(m => m.role === "user")!.content)) as { step: number };
      const report = role === "plan" ? { summary: "Create feature file", tasks: ["Create feature.txt"] }
        : role === "ideate" ? { summary: "Use a text file", notes: "Write exactly working" }
        : role === "manage" ? data.step ? { summary: "File implemented", decision: "done" } : { summary: "Write file", decision: "work", taskId: "t1" }
        : { summary: "Created feature.txt", notes: "File is ready for checks" };
      const calls: { name: string; arguments: object }[] = role === "work" ? [{ name: "write", arguments: { path: "feature.txt", content: "working" } }] : [];
      calls.push({ name: "gvs_report", arguments: report });
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ id: "fake", object: "chat.completion.chunk", model: "fake", choices: [{ index: 0,
        delta: { role: "assistant", tool_calls: calls.map((call, index) => ({ index, id: `call-${index}`, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) }, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: "fake", object: "chat.completion.chunk", model: "fake", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\n`);
      res.end("data: [DONE]\n\n");
    } catch (error) { res.writeHead(500); res.end(String(error)); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { "gvs-local": {
    baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", apiKey: "fake-key",
    models: [{ id: "fake", reasoning: false, contextWindow: 100000, maxTokens: 1000 }],
  } } }));
  await writeFile(join(cwd, ".pi", "gvs.json"), JSON.stringify({ checks: [{ name: "feature content", command: process.execPath,
    args: ["-e", "if(require('node:fs').readFileSync('feature.txt','utf8')!=='working')process.exit(1)"] }] }));
  const root = fileURLToPath(new URL("../", import.meta.url));
  const child = spawn(process.execPath, [join(root, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js"),
    "--mode", "rpc", "--no-session", "--no-extensions", "--no-skills", "--provider", "gvs-local", "--model", "fake", "-e", join(root, "extensions/index.ts")], {
    cwd, env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" }, windowsHide: true,
  });
  let output = "";
  let errors = "";
  child.stdout.on("data", data => { output += data.toString(); });
  child.stderr.on("data", data => { errors += data.toString(); });
  try {
    child.stdin.write(JSON.stringify({ id: "start", type: "prompt", message: "/gvs Create feature.txt containing working" }) + "\n");
    const deadline = Date.now() + 20000;
    while (!output.includes("GVS completed") && Date.now() < deadline) {
      if (child.exitCode !== null || output.includes("GVS failed")) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.match(output, /GVS completed/, `${errors}\n${output}`);
    assert.match(output, /GVS plan result/);
    assert.match(output, /1\. Create feature.txt/);
    assert.match(output, /GVS ideate result/);
    assert.match(output, /Write exactly working/);
    const events = output.split("\n").filter(Boolean).map(line => JSON.parse(line));
    const widgets = events.filter(e => e.type === "extension_ui_request" && e.method === "setWidget");
    assert.ok(widgets.length > 1, "live progress is sent as widget updates");
    assert.ok(widgets.every(e => e.widgetKey === "gvs-progress"), "updates reuse one panel");
    assert.equal(widgets.at(-1).widgetLines, undefined, "panel clears when finished");
    assert.ok(!events.some(e => e.type === "message_end" && e.message?.content === "GVS work: write"), "tool activity does not create transcript boxes");
    assert.equal(await readFile(join(cwd, "feature.txt"), "utf8"), "working");
    const ledger = JSON.parse(await readFile(join(cwd, ".pi", "gvs", "run.json"), "utf8"));
    assert.equal(ledger.status, "completed");
    assert.equal(ledger.checks[0].passed, true);
    assert.deepEqual(requests, ["plan", "ideate", "manage", "work", "manage"]);
  } finally {
    child.kill();
    await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once("close", () => resolve()); });
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
