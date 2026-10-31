// Atom Calm - gapless built-in tool-shell presentation adapter.
//
// Adapted from Kun Chen's Pi Calm extension (itself adapted from Firstmate).
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Aligned with Pi 0.85.1, which exports AgentSession and ToolExecutionComponent.
// Built-in tools are registered with sourceInfo.source "builtin"; on Windows the
// set includes the powershell tool. The lookup returns Pi's active definition
// unchanged and the adapter changes only the final TUI row layout. Execution,
// settings, SDK overrides, and stored results stay owned by Pi. Image results stay
// visible without their shell; custom tools render unchanged.
//
// 0.85.1 difference: interactive mode no longer passes the registry object itself
// to a tool row. It spreads it into a fresh copy with built-in renderers merged in
// (core/tools/renderers withBuiltInRenderers). Kun's WeakSet identity check never
// matched that copy, so built-in shells stayed visible. The marker is therefore an
// enumerable symbol property on the definition, which the spread copies, and each
// row keeps the value the definition had at the moment it was built.
import { AgentSession, ToolExecutionComponent, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { calmPresentationIsActive } from "./visibility.ts";

const CALM_BUILT_IN_TOOL_NAMES = new Set(["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"]);

type ToolRowPresentationState = {
	toolName: string;
	toolDefinition?: ToolDefinition;
	imageComponents: Component[];
	imageSpacers: Component[];
};

type AgentSessionPresentationState = {
	_baseToolsOverride?: Record<string, unknown>;
};

type CalmBuiltInToolShellPatch = {
	hidesShell: () => boolean;
};

const CALM_BUILT_IN_TOOL_SHELL_PATCH = Symbol.for("atom-calm:built-in-tool-shell-layout:pi-0.85.1");
/** Set on a definition by the patched lookup; survives Pi's spread copy. */
const CALM_BUILT_IN_MARK = Symbol.for("atom-calm:built-in-definition");

type MarkedDefinition = ToolDefinition & { [CALM_BUILT_IN_MARK]?: boolean };

export function installCalmBuiltInToolShellLayout(): void {
	const registry = globalThis as typeof globalThis & { [key: symbol]: CalmBuiltInToolShellPatch | undefined };
	const hidesShell = (): boolean => calmPresentationIsActive();
	const installed = registry[CALM_BUILT_IN_TOOL_SHELL_PATCH];
	if (installed) {
		installed.hidesShell = hidesShell;
		return;
	}

	const originalGetToolDefinition = AgentSession.prototype.getToolDefinition;
	if (typeof originalGetToolDefinition !== "function") {
		throw new Error("Calm requires Pi AgentSession.getToolDefinition");
	}
	if (typeof ToolExecutionComponent !== "function") {
		throw new Error("Calm requires Pi ToolExecutionComponent");
	}
	const originalRender = ToolExecutionComponent.prototype.render;
	if (typeof originalRender !== "function") {
		throw new Error("Calm requires Pi ToolExecutionComponent.render");
	}

	const patch: CalmBuiltInToolShellPatch = { hidesShell };

	AgentSession.prototype.getToolDefinition = function (name: string): ToolDefinition | undefined {
		const definition = originalGetToolDefinition.call(this, name) as MarkedDefinition | undefined;
		const source = this.getAllTools().find(tool => tool.name === name)?.sourceInfo.source;
		if (definition) {
			const session = this as unknown as AgentSessionPresentationState;
			const isSdkBaseOverride = Object.hasOwn(session._baseToolsOverride ?? {}, name);
			if (source === "builtin" && !isSdkBaseOverride) {
				definition[CALM_BUILT_IN_MARK] = true;
			} else {
				delete definition[CALM_BUILT_IN_MARK];
			}
		}
		return definition;
	};

	ToolExecutionComponent.prototype.render = function (width: number): string[] {
		const state = this as unknown as ToolRowPresentationState;
		const isKnownBuiltIn =
			CALM_BUILT_IN_TOOL_NAMES.has(state.toolName) &&
			(state.toolDefinition as MarkedDefinition | undefined)?.[CALM_BUILT_IN_MARK] === true;
		if (!isKnownBuiltIn || !patch.hidesShell()) {
			return originalRender.call(this, width);
		}

		// Only the image results survive, without the call/result shell around them.
		const lines: string[] = [];
		for (let index = 0; index < state.imageComponents.length; index += 1) {
			const spacer = state.imageSpacers[index];
			if (spacer) lines.push(...spacer.render(width));
			const image = state.imageComponents[index];
			if (image) lines.push(...image.render(width));
		}
		return lines;
	};

	registry[CALM_BUILT_IN_TOOL_SHELL_PATCH] = patch;
}
