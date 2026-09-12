#!/usr/bin/env node
// Parses every JavaScript file under the working directory without executing it. Entries that
// ship no runnable tooling still deserve an agent-visible check: this one catches an edit that
// breaks the file, and says nothing about any particular defect.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Script } from "node:vm";

const root = process.cwd();
const skip = new Set(["node_modules", ".git", ".pi"]);
const files = [];
(function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (skip.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (entry.endsWith(".js")) files.push(path);
  }
})(root);

let failed = 0;
for (const file of files) {
  try { new Script(readFileSync(file, "utf8"), { filename: file }); }
  catch (error) {
    failed++;
    process.stdout.write(`${relative(root, file)}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}
process.stdout.write(`${files.length - failed}/${files.length} JavaScript files parse\n`);
process.exit(failed ? 1 : 0);
