import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { roles, type Config, type Role } from "./types.ts";

export const defaults: Config = {
  maxSteps: 8, maxTokens: 200000, runTimeoutMs: 1800000, checkTimeoutMs: 120000,
  maxWorkerTurns: 32, maxWorkerTokens: 150000, maxRepeats: 3, maxFailures: 2, review: true,
  temperatures: { plan: 0.3, ideate: 0.4, manage: 0.2, work: 0.2, review: 0.2, finalize: 0.2 },
  checks: [],
};
const positive = ["maxSteps", "maxTokens", "runTimeoutMs", "checkTimeoutMs", "maxWorkerTurns", "maxWorkerTokens", "maxRepeats"] as const;

export async function readConfig(cwd: string): Promise<Config> {
  let value: unknown;
  try { value = JSON.parse(await readFile(join(cwd, ".pi", "gvs.json"), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(defaults);
    throw error;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(".pi/gvs.json must be an object");
  const config = { ...structuredClone(defaults), ...value } as Config;
  for (const key of positive) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw new Error(`Invalid gvs ${key}`);
  }
  if (!Number.isSafeInteger(config.maxFailures) || config.maxFailures < 0) throw new Error("Invalid gvs maxFailures");
  if (typeof config.review !== "boolean") throw new Error("gvs review must be true or false");
  if (!config.temperatures || typeof config.temperatures !== "object" || Array.isArray(config.temperatures)) {
    throw new Error("temperatures must map role names to numbers");
  }
  for (const [role, temperature] of Object.entries(config.temperatures)) {
    if (!roles.includes(role as Role)) throw new Error(`Unknown temperature role ${role}`);
    if (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      throw new Error(`Invalid temperature for ${role}`);
    }
  }
  if (!Array.isArray(config.checks) || config.checks.some(c => !c || typeof c.name !== "string" ||
    !c.name.trim() || typeof c.command !== "string" || !c.command.trim() ||
    !Array.isArray(c.args) || c.args.some(a => typeof a !== "string"))) {
    throw new Error("checks must contain { name, command, args: string[] }");
  }
  return config;
}
