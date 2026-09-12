import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "./types.ts";

export const defaults: Config = {
  maxSteps: 8, maxTokens: 200000, runTimeoutMs: 1800000, checkTimeoutMs: 120000, checks: [],
};
export async function readConfig(cwd: string): Promise<Config> {
  let value: unknown;
  try { value = JSON.parse(await readFile(join(cwd, ".pi", "gvs.json"), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(defaults);
    throw error;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(".pi/gvs.json must be an object");
  const config = { ...defaults, ...value } as Config;
  for (const key of ["maxSteps", "maxTokens", "runTimeoutMs", "checkTimeoutMs"] as const) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw new Error(`Invalid gvs ${key}`);
  }
  if (!Array.isArray(config.checks) || config.checks.some(c => !c || typeof c.name !== "string" ||
    !c.name.trim() || typeof c.command !== "string" || !c.command.trim() ||
    !Array.isArray(c.args) || c.args.some(a => typeof a !== "string"))) {
    throw new Error("checks must contain { name, command, args: string[] }");
  }
  return config;
}
