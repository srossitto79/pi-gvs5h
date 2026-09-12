export type Role = "plan" | "ideate" | "manage" | "work";
export type Status = "running" | "completed" | "cancelled" | "failed" | "paused";
export interface Task { id: string; description: string; status: "pending" | "working" | "done" }
export interface Check { name: string; command: string; args: string[] }
export interface Config {
  maxSteps: number;
  maxTokens: number;
  runTimeoutMs: number;
  checkTimeoutMs: number;
  checks: Check[];
}
export interface CheckResult { name: string; passed: boolean; output: string; finishedAt: string }
export interface Run {
  version: 1;
  id: string;
  goal: string;
  status: Status;
  phase: Role;
  plan: string;
  notes: string;
  tasks: Task[];
  steps: number;
  tokens: number;
  revision: number;
  verifiedRevision: number | null;
  checks: CheckResult[];
  lastSummary: string;
  reason: string;
  updatedAt: string;
}
export interface Report {
  summary: string;
  notes?: string;
  tasks?: string[];
  decision?: "work" | "done";
  taskId?: string;
  newTask?: string;
}
export interface WorkerRequest {
  role: Role;
  run: Run;
  task?: Task;
  signal: AbortSignal;
  onTokens: (tokens: number) => void;
  onProgress: (text: string) => void;
}
export type Worker = (request: WorkerRequest) => Promise<Report>;
