import { stripVTControlCharacters } from "node:util";

export type ProgressUpdate = { id: string; title: string; status: "working" | "done" | "blocked"; summary: string };
type Step = { callId: string; label: string; status: "working" | "done" | "failed" | "stopped" };
export type ProgressGroup = ProgressUpdate & { leader: string; state: ProgressUpdate["status"] | "stopped"; steps: Step[]; operations: number; failed: number; running: Set<string> };
export const cleanProgressText = (value: string, limit = 180): string => Array.from(stripVTControlCharacters(value).replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim()).slice(0, limit).join("");

/** Describe known operations, never classify intent from arbitrary shell/script text. */
export function describeOperation(name: string, args: Record<string, unknown> | null = {}): string {
 const file = typeof args?.path === "string" ? cleanProgressText(args.path.replaceAll("\\", "/").split("/").at(-1) ?? "", 100) : "";
 switch (name) {
  case "read": return file ? `Read ${file}` : "Read a file";
  case "edit": return file ? `Edit ${file}` : "Edit a file";
  case "write": return file ? `Write ${file}` : "Write a file";
  case "find": case "ls": return "Inspect project files";
  case "grep": return "Search project contents";
  case "web_search": case "source_check": return "Check reference sources";
  case "fetch_content": case "get_search_content": return "Read reference material";
  default: return "Carry out the current step";
 }
}

/** Small presentation projection. Raw tools/results stay in Pi; only three steps per group are retained here. */
export class CalmProgress {
 readonly groups = new Map<string, ProgressGroup>();
 readonly owners = new Map<string, string>();
 private ids = new Map<string, string>();
 private active: string | undefined;
 private completed = new Set<string>();
 private parents = new Map<string, string>();
 private failedCalls = new Set<string>();
 hasFailure(callId: string): boolean { return this.failedCalls.has(callId); }
 beginRun(): void { this.settle(false); this.ids.clear(); this.active = undefined; }
 update(callId: string, input: ProgressUpdate): ProgressUpdate {
  const data = { id: cleanProgressText(input.id, 64), title: cleanProgressText(input.title), status: input.status, summary: cleanProgressText(input.summary, 300) };
  if (!data.id || !data.title || !data.summary) throw Error("Supply a subtask id, plain-language title and a truthful progress/result summary.");
  const leader = this.ids.get(data.id), group = leader ? this.groups.get(leader) : undefined;
  if (this.active && this.active !== leader && this.groups.get(this.active)?.running.size) throw Error("Wait for the active subtask operations to finish before changing subtasks.");
  if (group?.running.size && data.status !== "working") throw Error("Operations are still running; do not report this subtask complete yet.");
  if (group?.state === "done") throw Error("This subtask is already complete. Start another id for new work.");
  if (this.active && this.active !== leader) this.groups.get(this.active)!.state = "stopped";
  if (group) Object.assign(group, data, { state: data.status });
  else {
   this.ids.set(data.id, callId);
   this.groups.set(callId, { ...data, leader: callId, state: data.status, steps: [], operations: 0, failed: 0, running: new Set() });
  }
  const actual = this.groups.get(leader ?? callId)!;
  this.owners.set(callId, actual.leader);
  this.active = actual.state === "working" ? actual.leader : undefined;
  return { id: actual.id, title: actual.title, status: actual.state === "blocked" ? "blocked" : data.status, summary: actual.summary };
 }
 start(callId: string, name: string, args: Record<string, unknown> = {}, parentId?: string): void {
  if (parentId && parentId !== callId) this.parents.set(callId, parentId);
  if (name === "work_progress" || this.owners.has(callId)) return;
  const owner = (parentId && this.owners.get(parentId)) || this.active;
  const group = owner ? this.groups.get(owner) : undefined;
  if (!group) return;
  this.owners.set(callId, group.leader); group.running.add(callId); group.operations++;
  group.steps.push({ callId, label: describeOperation(name, args), status: "working" });
  if (group.steps.length > 3) group.steps.shift();
 }
 end(callId: string, failed: boolean): void {
  if (this.completed.has(callId)) return;
  this.completed.add(callId);
  if (failed) {
   let id: string | undefined = callId;
   while (id && !this.failedCalls.has(id)) { this.failedCalls.add(id); id = this.parents.get(id); }
  }
  const owner = this.owners.get(callId), group = owner ? this.groups.get(owner) : undefined;
  if (!group) return;
  group.running.delete(callId);
  const step = group.steps.find(s => s.callId === callId);
  if (step) step.status = failed ? "failed" : "done";
  if (failed) group.failed++;
 }
 settle(error: boolean): void {
  for (const group of this.groups.values()) {
   if (group.state !== "working") continue;
   group.state = error || group.failed ? "blocked" : "stopped";
   for (const step of group.steps) if (step.status === "working") step.status = "stopped";
   group.running.clear();
  }
  this.active = undefined;
 }
 lines(callId: string): string[] | undefined {
  const owner = this.owners.get(callId), group = owner ? this.groups.get(owner) : undefined;
  if (!group) return undefined;
  if (callId !== group.leader) return [];
  const marker = { working: "▶", done: "✓", blocked: "!", stopped: "○" }[group.state];
  const lines = [`${marker} ${group.title}`, `  ${group.summary}`];
  if (group.state === "stopped") lines.push("  Stopped before completion was reported.");
  if (group.failed) lines.push(`  ! Earlier operation errors: ${group.failed}. Details remain available.`);
  if (group.state !== "done" && group.operations > group.steps.length) lines.push(`  … ${group.operations - group.steps.length} earlier operation(s); expand details.`);
  if (group.state !== "done") for (const step of group.steps) lines.push(`  ${{ working: "▶", done: "✓", failed: "×", stopped: "○" }[step.status]} ${step.label}`);
  return [...lines, ""];
 }
}
