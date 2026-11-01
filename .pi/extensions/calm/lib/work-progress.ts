import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { CalmProgress, type ProgressUpdate } from "./progress.ts";
import { calmPresentationIsActive } from "./visibility.ts";

const guidance = `When Calm is enabled, show meaningful multi-step work through work_progress: use a short outcome-oriented subtask title and a truthful progress summary in the user's language, not tool names or shell commands. Start a subtask with working, reuse its id to update it, and explicitly report done with the actual result/artifact and verification or limitations. A tool finishing is not proof the goal succeeded. Use blocked when work cannot complete. Keep one active subtask per session; choose a new id for new work. Update only at meaningful boundaries, not every tool call; it may share a tool-call batch with execution tools. Do not invent subtask completion, permissions, verification, percentages or future work. Discussion-only answers do not need subtasks. This tool reports presentation metadata only; it does not execute or schedule work.`;
const valid = (value: unknown): value is ProgressUpdate => {
 if (!value || typeof value !== "object") return false;
 const v = value as ProgressUpdate;
 return typeof v.id === "string" && typeof v.title === "string" && typeof v.summary === "string" && ["working", "done", "blocked"].includes(v.status);
};

export function attachWorkProgress(pi: ExtensionAPI, current: () => CalmProgress): void {
 pi.registerTool({
  name: "work_progress", label: "Work progress", exposure: "model-only", executionMode: "sequential",
  description: "Report a meaningful subtask's progress or actual outcome for Calm. Reuse the id while working; done requires a result and verification/limitations in summary. UI metadata only, not execution, scheduling or approval. Call directly, optionally in a batch with execution tools; not inside codemode.",
  parameters: Type.Object({ id: Type.String({ minLength: 1, maxLength: 64 }), title: Type.String({ minLength: 1, maxLength: 180 }), status: Type.Union([Type.Literal("working"), Type.Literal("done"), Type.Literal("blocked")]), summary: Type.String({ minLength: 1, maxLength: 300 }) }),
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async execute(callId, input) {
   const record = current().update(callId, input);
   return { content: [{ type: "text", text: `${record.status}: ${record.title}\n${record.summary}` }], details: { calmProgress: record } };
  },
 });
 let modelFailed = false;
 pi.on("before_agent_start", (event, ctx) => {
  current().beginRun(); modelFailed = false;
  if (ctx.mode === "tui" && calmPresentationIsActive() && pi.getActiveTools().includes("work_progress")) event.systemPromptOptions.sections.calm_progress = guidance;
  else delete event.systemPromptOptions.sections.calm_progress;
 });
 pi.on("tool_execution_start", event => current().start(event.toolCallId, event.toolName, event.args, event.parentToolCallId));
 pi.on("tool_execution_end", event => current().end(event.toolCallId, event.isError));
 pi.on("message_end", event => { if (event.message.role === "assistant") modelFailed = event.message.stopReason === "error"; });
 pi.on("agent_settled", () => current().settle(modelFailed));
 pi.on("session_shutdown", () => current().settle(false));
 pi.on("session_start", (_event, ctx) => {
  // Rebuild presentation from recorded progress/results, never replay tool execution.
  const calls = new Map<string, { name: string; arguments: Record<string, unknown> }>();
  for (const entry of ctx.sessionManager.getBranch()) {
   if (entry.type === "custom_message") { current().beginRun(); continue; }
   if (entry.type !== "message") continue;
   const m = entry.message;
   if (m.role === "user") current().beginRun();
   if (m.role === "assistant") for (const c of m.content) if (c.type === "toolCall") calls.set(c.id, c);
   if (m.role !== "toolResult") continue;
   if (m.toolName === "work_progress") {
    const record = (m.details as { calmProgress?: unknown } | undefined)?.calmProgress;
    if (!m.isError && valid(record)) {
     try { current().update(m.toolCallId, record); } catch { /* Invalid historical metadata never prevents session restoration. */ }
    }
   } else {
    current().start(m.toolCallId, m.toolName, calls.get(m.toolCallId)?.arguments);
    for (const nested of m.nestedCalls?.calls ?? []) {
     if (nested.name === "work_progress") continue;
     current().start(nested.id, nested.name, nested.arguments, m.toolCallId);
     current().end(nested.id, nested.status !== "ok");
    }
    current().end(m.toolCallId, m.isError);
   }
  }
  current().settle(false);
 });
}
