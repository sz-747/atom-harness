// Atom Calm tool-row presentation adapter.
// Adapted from Kun Chen's Pi Calm extension (itself adapted from Firstmate).
// Copyright (c) 2026 Kun Chen. MIT License - see ../LICENSE.
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { calmPresentationIsActive } from "./visibility.ts";
import { describeOperation, type CalmProgress } from "./progress.ts";

type Row = {
 toolName: string; toolCallId: string; args: Record<string, unknown>; expanded: boolean;
 executionStarted: boolean; isPartial: boolean; result?: { isError?: boolean };
 imageComponents: Component[]; imageSpacers: Component[];
};
type Patch = { active: () => boolean; progress: () => CalmProgress };
const KEY = Symbol.for("atom-calm:outcome-progress-rows:v1");

export function installCalmBuiltInToolShellLayout(progress: () => CalmProgress): void {
 const registry = globalThis as typeof globalThis & { [key: symbol]: Patch | undefined };
 if (registry[KEY]) { registry[KEY]!.active = calmPresentationIsActive; registry[KEY]!.progress = progress; return; }
 if (typeof ToolExecutionComponent !== "function" || typeof ToolExecutionComponent.prototype.render !== "function") throw Error("Calm requires Pi ToolExecutionComponent.render");
 const original = ToolExecutionComponent.prototype.render;
 const patch = { active: calmPresentationIsActive, progress };
 ToolExecutionComponent.prototype.render = function(width: number): string[] {
  const row = this as unknown as Row;
  // Expanded details and real failures always retain Pi's native evidence view.
  if (!patch.active() || row.expanded || row.result?.isError || patch.progress().hasFailure(row.toolCallId)) return original.call(this, width);
  const group = patch.progress().lines(row.toolCallId);
  const status = row.result && !row.isPartial ? "✓" : row.executionStarted ? "▶" : "○";
  const lines = (group ?? [`${status} ${describeOperation(row.toolName, row.args)}`]).map(line => truncateToWidth(line, Math.max(0, width)));
  // Images remain visible even when their textual call/result is grouped away.
  for (let i = 0; i < row.imageComponents.length; i++) {
   if (row.imageSpacers[i]) lines.push(...row.imageSpacers[i].render(width));
   lines.push(...row.imageComponents[i].render(width));
  }
  return lines;
 };
 registry[KEY] = patch;
}
