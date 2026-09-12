import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Run } from "./types.ts";

export class Ledger {
  readonly directory: string;
  constructor(cwd: string) { this.directory = join(resolve(cwd), ".pi", "gvs"); }
  async load(): Promise<Run | undefined> {
    try {
      const run = JSON.parse(await readFile(join(this.directory, "run.json"), "utf8")) as Run;
      if (run.version !== 1 || !Array.isArray(run.tasks) || typeof run.id !== "string") throw new Error("Invalid GVS ledger");
      return run;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  async save(run: Run): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    run.updatedAt = new Date().toISOString();
    const temporary = join(this.directory, `run-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(run, null, 2) + "\n");
    await rename(temporary, join(this.directory, "run.json"));
  }
  async lock(): Promise<() => Promise<void>> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, "lock.json");
    const token = randomUUID();
    try { await writeFile(path, JSON.stringify({ pid: process.pid, token }), { flag: "wx" }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Never steal a live or unreadable lock. A dead PID can be recovered after a crash.
      const owner = JSON.parse(await readFile(path, "utf8")) as { pid: number };
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error("Invalid GVS lock; inspect .pi/gvs/lock.json");
      try { process.kill(owner.pid, 0); }
      catch (probe) {
        if ((probe as NodeJS.ErrnoException).code === "ESRCH") {
          await unlink(path);
          return this.lock();
        }
        throw new Error("Cannot establish GVS lock ownership");
      }
      throw new Error("A GVS workflow is already running in this project");
    }
    return async () => {
      const owner = JSON.parse(await readFile(path, "utf8")) as { token: string };
      if (owner.token === token) await unlink(path);
    };
  }
}

export function createRun(goal: string): Run {
  return {
    version: 1, id: randomUUID(), goal, status: "running", phase: "plan", plan: "", notes: "",
    tasks: [], steps: 0, tokens: 0, revision: 0, verifiedRevision: null, checks: [],
    lastSummary: "", reason: "", updatedAt: new Date().toISOString(),
  };
}
