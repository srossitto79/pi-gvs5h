import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { readConfig } from "../src/config.ts";
import { runCheck } from "../src/verification.ts";

// Explicit manual smoke for this workspace's installed package and configured checks.
const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = fileURLToPath(new URL("../node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js", import.meta.url));
const child = spawn(process.execPath, [cli, "--mode", "rpc", "--no-session", "--offline", "--approve"], { cwd: root, windowsHide: true });
let output = "";
let errors = "";
child.stdout.on("data", data => { output += data.toString(); });
child.stderr.on("data", data => { errors += data.toString(); });
try {
  child.stdin.write(JSON.stringify({ id: "commands", type: "get_commands" }) + "\n");
  const deadline = Date.now() + 10000;
  while (!output.includes('"command":"get_commands"') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 30));
  const command = output.split("\n").filter(Boolean).map(line => JSON.parse(line)).find(e => e.id === "commands");
  assert.ok(command?.data?.commands?.some((c: { name: string }) => c.name === "gvs"), errors + output);
  console.log(`Installed /gvs discovered from ${resolve(root, ".pi/settings.json")}`);
} finally {
  child.kill();
  await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else child.once("close", () => resolve()); });
}
for (const check of (await readConfig(root)).checks) {
  const result = await runCheck(root, check, 120000, new AbortController().signal);
  assert.equal(result.passed, true, result.output);
  console.log(`Passed configured check: ${check.name}`);
}
