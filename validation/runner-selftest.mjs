#!/usr/bin/env node
// Tests run.mjs, not the graders and not a model. A local fake model stands in for the provider
// and applies the stored reference fix, so both model arms are driven end to end -- process spawn,
// RPC prompt, terminal-signal detection, token accounting, ledger capture, diff capture and the
// pass verdict -- without a paid call. What this cannot test is whether a real model solves
// anything; it tests that the harness around it reports honestly.
//
// Run: node validation/runner-selftest.mjs

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const instance = "qwen-next-speed-cap";
const fixedSource = await readFile(join(here, "instances", instance, "fixtures", "reference-fix", "src", "player.js"), "utf8");
const failures = [];
const lines = [];
const expect = (name, condition, detail) => {
  lines.push(`${condition ? "  ok  " : "  FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures.push(name);
};

/** An openai-completions endpoint that plays every GVS role and writes the reference fix once. */
function fakeModel(arm) {
  const roles = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    try {
      const input = JSON.parse(body);
      const textOf = content => typeof content === "string" ? content : (content ?? []).map(part => part.text ?? "").join("\n");
      const system = input.messages.filter(m => m.role === "system" || m.role === "developer").map(m => textOf(m.content)).join("\n");
      const role = system.includes("propose a concise plan") ? "plan"
        : system.includes("Explore distinct approaches") ? "ideate"
        : system.includes("First curate the task list") ? "manage"
        : system.includes("Independently judge") ? "review"
        : system.includes("write a handoff") ? "finalize"
        : "work";
      roles.push(role);
      const alreadyEdited = input.messages.some(m => m.role === "tool");
      const write = { name: "write", arguments: { path: "src/player.js", content: fixedSource } };
      let calls = [];
      let text;
      if (arm === "plain") {
        // An ordinary session: edit, then answer in prose on the following turn.
        if (alreadyEdited) text = "Clamped the horizontal limiter so the configured cap holds.";
        else calls = [write];
      } else {
        const decided = roles.filter(entry => entry === "manage").length > 1;
        const report = role === "plan" ? { summary: "Hold the configured cap", tasks: ["Clamp the horizontal limiter"] }
          : role === "ideate" ? { summary: "Clamp rather than decay", notes: "The limiter decays by 0.985 per tick", tasks: ["Clamp in the acceleration path"] }
          : role === "review" ? { summary: "The cap holds and the dash is intact", verdict: "pass" }
          : role === "finalize" ? { summary: "Nothing outstanding" }
          : role === "manage" ? (decided
            ? { summary: "Cap holds", decision: "done", taskUpdates: [{ id: "t1", status: "done" }] }
            : { summary: "Clamp it", decision: "work", taskId: "t1" })
          : { summary: "Clamped the limiter", notes: "Acceleration no longer pushes past the cap" };
        calls = [...(role === "work" ? [write] : []), { name: "gvs_report", arguments: report }];
      }
      const delta = calls.length
        ? { role: "assistant", tool_calls: calls.map((call, index) => ({ index, id: `call-${roles.length}-${index}`, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) }
        : { role: "assistant", content: text };
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(`data: ${JSON.stringify({ id: "fake", object: "chat.completion.chunk", model: "fake", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      response.write(`data: ${JSON.stringify({ id: "fake", object: "chat.completion.chunk", model: "fake", choices: [{ index: 0, delta: {}, finish_reason: calls.length ? "tool_calls" : "stop" }], usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 } })}\n\n`);
      response.end("data: [DONE]\n\n");
    } catch (error) {
      response.writeHead(500);
      response.end(String(error));
    }
  });
  return { server, roles };
}

async function runArm(arm) {
  const { server, roles } = fakeModel(arm);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const agentDirectory = await mkdtemp(join(tmpdir(), "gvs-runner-agent-"));
  await writeFile(join(agentDirectory, "models.json"), JSON.stringify({ providers: { "gvs-local": {
    baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", apiKey: "fake-key",
    models: [{ id: "fake", reasoning: false, contextWindow: 100000, maxTokens: 4000 }],
  } } }));
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(here, "run.mjs"),
        "--instance", instance, "--arm", arm, "--provider", "gvs-local", "--model", "fake",
        "--label", "selftest", "--timeout", "120"], {
        windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PI_CODING_AGENT_DIR: agentDirectory, PI_OFFLINE: "1" },
      });
      let output = "";
      child.stdout.on("data", chunk => { output += chunk.toString(); });
      child.stderr.on("data", chunk => { output += chunk.toString(); });
      child.on("error", reject);
      child.on("close", code => resolve({ code, output }));
    });
    const path = result.output.split("\n").map(line => line.trim()).find(line => line.endsWith("result.json"));
    return { ...result, roles, record: path ? JSON.parse(await readFile(path, "utf8")) : undefined, directory: path && dirname(path) };
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(agentDirectory, { recursive: true, force: true });
  }
}

for (const arm of ["gvs", "plain"]) {
  lines.push(`run.mjs --arm ${arm} against a local fake model`);
  const run = await runArm(arm);
  expect(`${arm}: the run finished and was graded`, !!run.record, run.output.slice(-600));
  if (!run.record) continue;
  const record = run.record;
  expect(`${arm}: the reference fix is accepted`, record.passed === true && run.code === 0,
    (record.grade?.checks ?? []).filter(check => !check.passed).map(check => check.name).join(", ") || `exit ${run.code}`);
  expect(`${arm}: the edit is attributed to the agent`, record.changedFiles.includes("src/player.js"),
    record.changedFiles.join(", ") || "no changed files were recorded");
  expect(`${arm}: a patch was captured`, (await readFile(join(run.directory, "diff.patch"), "utf8")).includes("moveSpeed"));
  expect(`${arm}: reported usage was recorded`, typeof record.tokens === "number" && record.tokens > 0, `tokens=${record.tokens}`);
  expect(`${arm}: the run did not hit its timeout`, record.durationMs > 0 && record.durationMs < 120000, `${record.durationMs}ms`);
  if (arm === "gvs") {
    expect("gvs: every role ran in a fresh session", run.roles.join(",") === "plan,ideate,manage,work,manage,review",
      run.roles.join(","));
    expect("gvs: the ledger was captured", record.workflow?.status === "completed", record.workflow?.status ?? "no ledger");
    expect("gvs: the review verdict was recorded", record.workflow?.reviewVerdict === "pass", record.workflow?.reviewVerdict ?? "none");
    expect("gvs: the configured check ran", record.workflow?.tasks?.length > 0);
  } else {
    expect("plain: no workflow ledger was written", record.workflow === undefined);
  }
}

process.stdout.write(`${lines.join("\n")}\n\n${failures.length ? `${failures.length} expectation(s) failed\n` : "runner expectations hold\n"}`);
process.exitCode = failures.length ? 1 : 0;
