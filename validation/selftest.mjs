#!/usr/bin/env node
// Tests the graders, not the agents. For each instance it grades the as-shipped repository and
// every stored fixture, and asserts the verdict each one is supposed to get:
//
//   as shipped      must FAIL, and fail only on fail_to_pass checks. A pass_to_pass check that
//                   fails here is miscategorised: it is describing the defect, not guarding
//                   behaviour the repair must preserve.
//   reference-fix   must PASS. Without this the grader could be rejecting every possible repair.
//   cheat-*         must FAIL. Each one is a repair that satisfies the bug report while damaging
//                   something else, so it proves a specific guard earns its place.
//
// Run: node validation/selftest.mjs

import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const failures = [];
const lines = [];

const gradeCopy = async (instance, instanceDirectory, overlay) => {
  const work = await mkdtemp(join(tmpdir(), "gvs-selftest-"));
  try {
    await cp(join(here, "repos", instance.repo), work, { recursive: true });
    if (overlay) await cp(overlay, work, { recursive: true });
    const grade = await new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, [join(instanceDirectory, instance.grader), work], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      child.stdout.on("data", chunk => { stdout += chunk.toString(); });
      child.stderr.on("data", chunk => { stdout += chunk.toString(); });
      child.on("error", reject);
      child.on("close", () => resolvePromise(stdout));
    });
    const start = grade.indexOf("{");
    if (start < 0) throw new Error(`grader produced no JSON:\n${grade.slice(0, 2000)}`);
    return JSON.parse(grade.slice(start));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
};

const expect = (name, condition, detail) => {
  lines.push(`${condition ? "  ok  " : "  FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures.push(name);
};

for (const id of (await readdir(join(here, "instances"), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name)) {
  const instanceDirectory = join(here, "instances", id);
  const instance = JSON.parse(await readFile(join(instanceDirectory, "instance.json"), "utf8"));
  lines.push(`${id} (${instance.repo})`);

  const shipped = await gradeCopy(instance, instanceDirectory);
  expect(`${id}: as shipped fails`, shipped.passed === false, shipped.passed ? "the defect is not detected" : undefined);
  const defectChecks = shipped.checks.filter(check => check.kind === "fail_to_pass");
  expect(`${id}: the defect is what fails`, defectChecks.some(check => !check.passed),
    defectChecks.length ? undefined : "no fail_to_pass check is defined");
  const guards = shipped.checks.filter(check => check.kind === "pass_to_pass" && !check.passed);
  expect(`${id}: every guard holds as shipped`, guards.length === 0,
    guards.map(check => check.name).join(", ") || undefined);

  let fixtures = [];
  try { fixtures = (await readdir(join(instanceDirectory, "fixtures"), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name); }
  catch { /* An instance may ship no fixtures yet. */ }
  expect(`${id}: a reference fix is stored`, fixtures.includes("reference-fix"));
  for (const fixture of fixtures) {
    const verdict = await gradeCopy(instance, instanceDirectory, join(instanceDirectory, "fixtures", fixture));
    const shouldPass = fixture === "reference-fix";
    const caught = verdict.checks.filter(check => !check.passed).map(check => check.name).join(", ");
    expect(`${id}: ${fixture} ${shouldPass ? "passes" : "is rejected"}`, verdict.passed === shouldPass,
      shouldPass ? caught : (verdict.passed ? "it was accepted" : `caught by: ${caught}`));
  }
}

process.stdout.write(`${lines.join("\n")}\n\n${failures.length ? `${failures.length} expectation(s) failed\n` : "grader expectations hold\n"}`);
process.exitCode = failures.length ? 1 : 0;
