import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getMarkdownTheme, ModelRuntime, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";
import { defaults, readConfig } from "../src/config.ts";
import { Ledger } from "../src/ledger.ts";
import { createPiWorker } from "../src/pi-worker.ts";
import { workflow } from "../src/workflow.ts";
import type { Run } from "../src/types.ts";

export default function gvsExtension(pi: ExtensionAPI) {
  // Render results directly, without the default padded custom-message box.
  pi.registerMessageRenderer("gvs", message => new Markdown(
    typeof message.content === "string" ? message.content : message.content.filter(c => c.type === "text").map(c => c.text).join("\n"),
    0, 0, getMarkdownTheme(),
  ));
  let active: { controller: AbortController; promise: Promise<void> } | undefined;
  const say = (text: string) => pi.sendMessage({ customType: "gvs", content: text, display: true });
  const describe = (run: Run) => [
    `GVS ${run.status} — ${run.goal}`,
    run.reason || run.lastSummary,
    run.handoff && `**Handoff**\n\n${run.handoff}`,
    `Steps: ${run.steps}; tokens: ${run.tokens}; recovered failures: ${run.failures}. Ledger: .pi/gvs/run.json`,
  ].filter(Boolean).join("\n");

  pi.registerCommand("gvs", {
    description: "GVS workflow: <goal> | plan | status | cancel | resume | init | reset | help",
    handler: async (args, ctx) => {
      const text = args.trim();
      if (!text || text === "help") {
        say("/gvs <goal> — start a coding workflow\n/gvs plan | status | cancel | resume | init | reset\nConfigure checks and limits in .pi/gvs.json (/gvs init creates it). Workers use your selected model and stored Pi credentials. /gvs reset archives the ledger, preserving code edits.");
        return;
      }
      if (text === "plan") {
        const run = await new Ledger(ctx.cwd).load();
        const mark = (status: string) => status === "done" ? "x" : status === "dropped" ? "-" : " ";
        say(run?.plan ? `**GVS plan**\n\n${run.plan}\n\n${run.tasks.map(t => `- [${mark(t.status)}] ${t.description}${t.attempts ? ` (attempts: ${t.attempts})` : ""}`).join("\n")}` : "No plan saved yet.");
        return;
      }
      if (text === "cancel") {
        if (!active) { say("No GVS workflow is running in this Pi session."); return; }
        active.controller.abort(new Error("Cancelled by user"));
        say("Cancelling GVS; waiting for the active worker to stop.");
        return;
      }
      if (text === "status") {
        const run = await new Ledger(ctx.cwd).load();
        say(run ? describe(run) + (!active && run.status === "running" ? "\nNo active worker in this Pi session; another session may own it, or use /gvs resume after interruption." : "") : "No GVS run saved in this project.");
        return;
      }
      if (active) { say("GVS is already running. Use /gvs status or /gvs cancel."); return; }
      if (text === "init") {
        await mkdir(join(ctx.cwd, ".pi"), { recursive: true });
        try {
          await writeFile(join(ctx.cwd, ".pi", "gvs.json"), JSON.stringify(defaults, null, 2) + "\n", { flag: "wx" });
          say("Created .pi/gvs.json. Add verification commands to checks before running /gvs <goal>. See the package README for examples.");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          say(".pi/gvs.json already exists; left unchanged.");
        }
        return;
      }
      if (text === "reset") {
        const ledger = new Ledger(ctx.cwd);
        const unlock = await ledger.lock();
        try {
          const run = await ledger.load();
          if (run) await rename(join(ledger.directory, "run.json"), join(ledger.directory, `archive-${run.id}-${Date.now()}.json`));
          say("GVS ledger archived. Repository edits are preserved. Start another run with /gvs <goal>.");
        } finally { await unlock(); }
        return;
      }
      if (!ctx.isIdle()) { say("Wait for Pi's current response to finish before starting GVS."); return; }
      if (!ctx.model) { say("Select a model in Pi before starting GVS."); return; }
      const controller = new AbortController();
      // Mark active synchronously before asynchronous setup, preventing overlapping starts.
      const entry = { controller, promise: Promise.resolve() };
      active = entry;
      const model = ctx.model;
      entry.promise = (async () => {
        try {
          const config = await readConfig(ctx.cwd);
          const modelRuntime = await ModelRuntime.create({ signal: controller.signal });
          controller.signal.throwIfAborted();
          if (!modelRuntime.getModel(model.provider, model.id)) throw new Error("Selected model is not available in stored Pi configuration. Configure it in Pi models.json first.");
          const run = await workflow({ cwd: ctx.cwd, goal: text === "resume" ? undefined : text,
            config, signal: controller.signal,
            worker: createPiWorker({ cwd: ctx.cwd, model, thinkingLevel: ctx.thinkingLevel, modelRuntime, config }),
            onReport: (role, report) => {
              const label = report.verdict ? `**GVS ${role} result: ${report.verdict}**` : `**GVS ${role} result**`;
              const listed = [...(report.tasks ?? []), ...(report.newTasks ?? [])].map((task, index) => `${index + 1}. ${task}`).join("\n");
              const curated = report.taskUpdates?.map(update => `- ${update.id}: ${update.status}`).join("\n");
              const notes = report.notes && report.notes !== report.summary ? report.notes : undefined;
              say([label, report.summary, listed, curated, notes].filter(Boolean).join("\n\n"));
            },
            onProgress: (progress) => {
              // One keyed widget is replaced in place for phase/tool/check updates.
              // Completed reports remain in the transcript, including for RPC clients.
              if (ctx.mode === "tui" || ctx.mode === "rpc") {
                ctx.ui.setWidget("gvs-progress", [`GVS · ${progress.replace(/\s+/g, " ").slice(0, 180)}`]);
              }
            },
          });
          say(describe(run));
        } catch (error) { say(`GVS: ${error instanceof Error ? error.message : String(error)}`); }
        finally {
          if (ctx.mode === "tui" || ctx.mode === "rpc") ctx.ui.setWidget("gvs-progress", undefined);
          if (active === entry) active = undefined;
        }
      })();
      say("GVS started. Use /gvs status or /gvs cancel. Ordinary prompts are paused while workers edit.");
    },
  });
  const busy = (_event: unknown, ctx: ExtensionContext) => {
    if (!active) return;
    ctx.ui.notify("Cancel GVS before switching sessions.", "warning");
    return { cancel: true };
  };
  pi.on("session_before_switch", busy);
  pi.on("session_before_fork", busy);
  pi.on("session_before_tree", busy);
  pi.on("input", () => {
    if (active) { say("GVS is running. Use /gvs cancel before sending another prompt."); return { action: "handled" as const }; }
  });
  pi.on("tool_call", () => active ? { block: true, reason: "GVS owns repository work until it stops" } : undefined);
  pi.on("user_bash", () => active ? { result: { output: "Cancel GVS before running shell commands.", exitCode: 1, cancelled: false, truncated: false } } : undefined);
  pi.on("session_shutdown", async () => {
    if (active) { active.controller.abort(new Error("Pi session closed")); await active.promise; }
  });
}
