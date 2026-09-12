import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Run } from "./types.ts";

export class Ledger {
  readonly directory: string;
  constructor(cwd: string) { this.directory = join(resolve(cwd), ".pi", "gvs"); }
  async load(): Promise<Run | undefined> {
    try {
      const run = JSON.parse(await readFile(join(this.directory, "run.json"), "utf8")) as Stored;
      if (!Array.isArray(run.tasks) || typeof run.id !== "string") throw new Error("Invalid GVS ledger");
      if (run.version !== 1 && run.version !== 2) throw new Error("Unsupported GVS ledger version");
      return migrate(run);
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
    version: 2, id: randomUUID(), goal, status: "running", phase: "plan", plan: "", notes: "",
    tasks: [], proposals: [], steps: 0, tokens: 0, revision: 0, verifiedRevision: null,
    reviewedRevision: null, reviewVerdict: null, checks: [], lastSummary: "", lastTaskId: null,
    repeats: 0, failures: 0, handoff: "", reason: "", updatedAt: new Date().toISOString(),
  };
}

type Stored = Omit<Run, "version"> & { version: number };

// A version 1 ledger predates curation, proposals, review and handoff. Fill the additions
// rather than discarding a run whose edits are already on disk.
function migrate(run: Stored): Run {
  run.proposals ??= [];
  run.reviewedRevision ??= null;
  run.reviewVerdict ??= null;
  run.lastTaskId ??= null;
  run.repeats ??= 0;
  run.failures ??= 0;
  run.handoff ??= "";
  for (const task of run.tasks) { task.attempts ??= 0; task.result ??= ""; }
  return { ...run, version: 2 };
}
