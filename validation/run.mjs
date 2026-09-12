#!/usr/bin/env node
// Two-arm instance runner. One instance, one arm, one pass, one result.json.
//
//   node validation/run.mjs --instance qwen-next-speed-cap --arm none
//   node validation/run.mjs --instance qwen-next-speed-cap --arm plain --provider anthropic --model <id>
//   node validation/run.mjs --instance qwen-next-speed-cap --arm gvs   --provider anthropic --model <id>
//
// Arms: `none` grades the as-shipped copy and spends nothing, which is how the fail_to_pass
// property is verified; `plain` gives one ordinary Pi session the goal; `gvs` gives the same goal
// to /gvs. The grader is never copied into the working tree.

import { spawn } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function options(argv) {
  // The gvs budget must not bind where the baseline has none, or the scaffold is scored on a
  // shorter run than the arm it is compared against. Default it high; compare observed cost after.
  const parsed = { arm: "none", timeout: 3600, label: "", thinking: "medium", maxTokens: 4000000, maxSteps: 12 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (!key || argv[i + 1] === undefined) throw new Error(`Bad argument near ${argv[i]}`);
    parsed[key] = key === "timeout" ? Number(argv[i + 1]) : argv[i + 1];
  }
  if (!parsed.instance) throw new Error("--instance is required");
  if (!["none", "plain", "gvs"].includes(parsed.arm)) throw new Error("--arm must be none, plain or gvs");
  return parsed;
}

const run = async () => {
  const config = options(process.argv.slice(2));
  const instanceDirectory = join(here, "instances", config.instance);
  const instance = JSON.parse(await readFile(join(instanceDirectory, "instance.json"), "utf8"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDirectory = join(here, "results", instance.id, `${config.arm}${config.label ? `-${config.label}` : ""}-${stamp}`);
  const work = join(runDirectory, "work");
  await mkdir(runDirectory, { recursive: true });
  await cp(join(here, "repos", instance.repo), work, { recursive: true });

  // A git baseline of the as-shipped state, so the agent's edits can be extracted as a patch.
  const git = (...args) => execute("git", ["-C", work, ...args], { capture: true });
  await git("init", "-q");
  await git("config", "user.email", "validation@local");
  await git("config", "user.name", "validation");
  await git("add", "-A");
  await git("commit", "-q", "-m", "as shipped");

  const prompt = `${instance.goal}\n\n${instance.environmentNote}`;
  let transcript = "";
  let started = Date.now();
  if (config.arm !== "none") {
    if (config.arm === "gvs") {
      await mkdir(join(work, ".pi"), { recursive: true });
      // {{harness}} lets an instance point at a checker that lives outside the working tree, for
      // entries that ship no runnable tooling of their own.
      const checks = instance.checks.map(check => ({ ...check, args: check.args.map(arg => arg.replaceAll("{{harness}}", here)) }));
      await writeFile(join(work, ".pi", "gvs.json"), `${JSON.stringify({
        checks, maxTokens: Number(config.maxTokens), maxSteps: Number(config.maxSteps),
        runTimeoutMs: config.timeout * 1000,
      }, null, 2)}\n`);
    }
    const cli = resolve(root, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
    if (!existsSync(cli)) throw new Error(`Pi CLI not found at ${cli}; run npm ci first`);
    const args = [cli, "--mode", "rpc", "--no-session", "--no-skills"];
    if (config.provider) args.push("--provider", config.provider);
    if (config.model) args.push("--model", config.model);
    // Pinned and recorded: an unlogged thinking level is a confound between the arms.
    args.push("--thinking", config.thinking);
    // The gvs arm loads only this package's extension; the plain arm loads none, so the two
    // differ in the scaffold and nothing else.
    args.push("--no-extensions");
    if (config.arm === "gvs") args.push("-e", resolve(root, "extensions/index.ts"));
    started = Date.now();
    transcript = await drive(args, work, config, prompt);
  }

  const grade = await execute(process.execPath, [join(instanceDirectory, instance.grader), work], { capture: true });
  const verdict = parse(grade.stdout) ?? { passed: false, error: "the grader produced no JSON", raw: grade.stdout.slice(0, 4000) };
  const patch = await git("diff", "HEAD");
  const names = await git("diff", "--name-only", "HEAD");
  const ledgerPath = join(work, ".pi", "gvs", "run.json");
  const ledger = existsSync(ledgerPath) ? JSON.parse(await readFile(ledgerPath, "utf8")) : undefined;

  const result = {
    instance: instance.id, arm: config.arm, label: config.label || undefined,
    model: config.model ? `${config.provider ?? "default"}/${config.model}` : "default",
    thinking: config.arm === "none" ? undefined : config.thinking,
    budget: config.arm === "gvs"
      ? { maxTokens: Number(config.maxTokens), maxSteps: Number(config.maxSteps), runTimeoutMs: config.timeout * 1000 }
      : undefined,
    passed: verdict.passed === true,
    durationMs: config.arm === "none" ? 0 : Date.now() - started,
    tokens: ledger?.tokens ?? tokensFrom(transcript),
    tokensByRole: ledger?.tokensByRole,
    steps: ledger?.steps,
    workflow: ledger && { status: ledger.status, reason: ledger.reason, reviewVerdict: ledger.reviewVerdict,
      failures: ledger.failures, handoff: ledger.handoff, tasks: ledger.tasks },
    changedFiles: names.stdout.split("\n").filter(Boolean),
    grade: verdict,
    workDirectory: work,
  };
  await writeFile(join(runDirectory, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(join(runDirectory, "diff.patch"), patch.stdout);
  if (transcript) await writeFile(join(runDirectory, "transcript.jsonl"), transcript);

  const failed = (verdict.checks ?? []).filter(check => !check.passed);
  process.stdout.write([
    `${result.passed ? "PASS" : "FAIL"}  ${instance.id}  arm=${config.arm}`,
    `tokens=${result.tokens ?? "n/a"}${result.steps === undefined ? "" : ` steps=${result.steps}`}` +
      `${result.workflow ? ` workflow=${result.workflow.status}` : ""} files=${result.changedFiles.length}`,
    ...failed.map(check => `  FAILED ${check.kind}: ${check.name} — ${check.detail}`),
    `  ${join(runDirectory, "result.json")}`,
  ].join("\n") + "\n");
  process.exitCode = result.passed ? 0 : 1;
};

function parse(text) {
  const start = text.indexOf("{");
  if (start < 0) return undefined;
  try { return JSON.parse(text.slice(start)); } catch { return undefined; }
}

/** Sums reported assistant usage from an RPC transcript, for arms with no ledger of their own. */
function tokensFrom(transcript) {
  let total = 0;
  for (const line of transcript.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const event = JSON.parse(line);
      const usage = event?.message?.usage;
      if (event?.type === "message_end" && event.message?.role === "assistant" && usage) total += usage.totalTokens ?? 0;
    } catch { /* Not every line is an RPC event. */ }
  }
  return total || undefined;
}

/** Runs Pi in RPC mode, sends the goal, and waits for the arm's terminal signal. */
function drive(args, cwd, config, prompt) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, { cwd, windowsHide: true });
    let output = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error); else resolvePromise(output);
    };
    const timer = setTimeout(() => finish(new Error(`arm ${config.arm} exceeded ${config.timeout}s`)), config.timeout * 1000);
    child.stdout.on("data", chunk => {
      output += chunk.toString();
      // The gvs arm announces its own terminal state. An ordinary session ends with agent_settled;
      // the `response` event for the prompt is only an acknowledgement and arrives before any work,
      // so waiting on it would score an arm that never ran.
      if (config.arm === "gvs" && /GVS (completed|paused|failed|cancelled)/.test(output)) finish();
      if (config.arm === "plain" && output.includes('"type":"agent_settled"')) finish();
    });
    child.stderr.on("data", chunk => { output += chunk.toString(); });
    child.on("error", finish);
    child.on("close", () => finish());
    const message = config.arm === "gvs" ? `/gvs ${prompt.replace(/\s+/g, " ")}` : prompt;
    child.stdin.write(`${JSON.stringify({ id: "task", type: "prompt", message })}\n`);
  });
}

function execute(command, args, { capture = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr?.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => resolvePromise({ code, stdout, stderr }));
  });
}

run().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 2;
});
