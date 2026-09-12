export type Role = "plan" | "ideate" | "manage" | "work" | "review" | "finalize";
export const roles: readonly Role[] = ["plan", "ideate", "manage", "work", "review", "finalize"];
export type Status = "running" | "completed" | "cancelled" | "failed" | "paused";
export type TaskStatus = "pending" | "working" | "done" | "dropped";
export interface Task { id: string; description: string; status: TaskStatus; attempts: number; result: string }
export interface Check { name: string; command: string; args: string[] }
export interface Config {
  maxSteps: number;
  maxTokens: number;
  runTimeoutMs: number;
  checkTimeoutMs: number;
  /** Per-assignment bounds. One worker is one bounded call, not an open-ended session. */
  maxWorkerTurns: number;
  maxWorkerTokens: number;
  /** Consecutive reassignments of one task before the run stops for lack of progress. */
  maxRepeats: number;
  /** Retries of a single role invocation after a transport or contract failure. */
  maxFailures: number;
  /** Independent read-only review of the goal before completion is claimed. */
  review: boolean;
  /** Sampling temperature per role; omitted roles send no temperature. */
  temperatures: Partial<Record<Role, number>>;
  checks: Check[];
}
export interface CheckResult { name: string; passed: boolean; output: string; finishedAt: string }
export interface Run {
  version: 2;
  id: string;
  goal: string;
  status: Status;
  phase: Role;
  plan: string;
  notes: string;
  tasks: Task[];
  /** Next steps proposed by the last worker, awaiting the manager's curation. */
  proposals: string[];
  steps: number;
  tokens: number;
  /** Usage attributed to each role, so the cost of the scaffold can be read off a run. */
  tokensByRole: Partial<Record<Role, number>>;
  revision: number;
  verifiedRevision: number | null;
  reviewedRevision: number | null;
  reviewVerdict: "pass" | "fail" | null;
  checks: CheckResult[];
  lastSummary: string;
  lastTaskId: string | null;
  repeats: number;
  failures: number;
  handoff: string;
  reason: string;
  updatedAt: string;
}
export interface TaskUpdate { id: string; status: TaskStatus }
export interface Report {
  summary: string;
  notes?: string;
  /** Plan: the initial task list. Ideate and work: proposed next steps for the manager. */
  tasks?: string[];
  decision?: "work" | "done";
  taskId?: string;
  newTask?: string;
  newTasks?: string[];
  taskUpdates?: TaskUpdate[];
  verdict?: "pass" | "fail";
  /** Set by the runtime when an assignment ended at its bound instead of reporting. */
  incomplete?: boolean;
}
export interface WorkerRequest {
  role: Role;
  run: Run;
  task?: Task;
  /** Extra direction from the engine, such as a no-progress warning. */
  guidance?: string;
  signal: AbortSignal;
  onTokens: (tokens: number) => void;
  onProgress: (text: string) => void;
}
export type Worker = (request: WorkerRequest) => Promise<Report>;
