// Copyright (c) 2026 sz-747. Licensed under the repository's MIT license.
import { AgentSession, ToolExecutionComponent, getAgentDir, type ExtensionAPI, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createShip } from "./ship.ts";

// Pi has no public API for hiding a whole built-in tool row. Tag a presentation
// copy of its definition so the registry and executors remain untouched. Symbols
// survive Pi's object spread when it adds renderers to the row definition.
const adapterKey = Symbol.for("atom.calm.presentation.v1");
const rowOrigin = Symbol.for("atom.calm.builtin.v1");
type Adapter = { enabled: boolean };
type ToolRow = {
	toolDefinition?: { [rowOrigin]?: boolean };
	imageComponents?: Component[];
	imageSpacers?: Component[];
};

function presentationAdapter(): Adapter {
	const globals = globalThis as typeof globalThis & { [adapterKey]?: Adapter };
	if (globals[adapterKey]) return globals[adapterKey];
	const lookup = AgentSession.prototype.getToolDefinition;
	const render = ToolExecutionComponent.prototype.render;
	if (typeof lookup !== "function" || typeof render !== "function") {
		throw new Error("This Pi version does not expose the tool presentation hooks required by Calm.");
	}
	const state: Adapter = { enabled: false };
	AgentSession.prototype.getToolDefinition = function (name) {
		const definition = lookup.call(this, name);
		if (!definition) return undefined;
		const overrides = (this as unknown as { _baseToolsOverride?: Record<string, unknown> })._baseToolsOverride;
		const builtin = this.getAllTools().some(tool => tool.name === name && tool.sourceInfo.source === "builtin");
		return { ...definition, [rowOrigin]: builtin && !Object.hasOwn(overrides ?? {}, name) };
	};
	ToolExecutionComponent.prototype.render = function (width) {
		const row = this as unknown as ToolRow;
		if (!state.enabled || !row.toolDefinition?.[rowOrigin]) {
			return render.call(this, width);
		}
		// Preserve Pi's already-created image components, including their spacers.
		return (row.imageComponents ?? []).flatMap((image, i) => [
			...(row.imageSpacers?.[i]?.render(width) ?? []), ...image.render(width),
		]);
	};
	globals[adapterKey] = state;
	return state;
}

export default function calm(pi: ExtensionAPI): void {
	let adapter: Adapter | undefined;
	let enabled = false;
	let running = false;
	let ui: ExtensionUIContext | undefined;
	let widget: ReturnType<typeof createShip> | undefined;
	let showingShip = false;
	const preference = () => join(getAgentDir(), "calm");

	function update(): void {
		if (!ui) return;
		if (adapter) adapter.enabled = enabled;
		const wanted = enabled && running;
		if (wanted !== showingShip) {
			widget?.dispose();
			widget = undefined;
			ui.setWidget("atom-calm-ship", wanted ? tui => (widget = createShip(tui)) : undefined);
			showingShip = wanted;
		}
		ui.setWorkingVisible(!wanted);
	}

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ui = ctx.ui;
		running = false;
		try { enabled = readFileSync(preference(), "utf8").trim() === "on"; }
		catch { enabled = false; }
		try { adapter = presentationAdapter(); }
		catch (error) { ui.notify(`Calm tool hiding unavailable: ${String(error)}`, "warning"); }
		update();
	});
	pi.on("agent_start", () => { running = true; update(); });
	pi.on("agent_settled", () => { running = false; update(); });
	pi.on("session_shutdown", () => {
		running = false;
		update();
		if (adapter) adapter.enabled = false;
		widget?.dispose();
		ui = undefined;
	});
	pi.registerCommand("calm", {
		description: "Toggle hidden built-in tool rows and the working boat (display only)",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") return ctx.ui.notify("Calm requires the interactive terminal.", "info");
			const next = !enabled;
			// The existing plain on/off preference also works with older installations.
			mkdirSync(getAgentDir(), { recursive: true });
			writeFileSync(preference(), next ? "on\n" : "off\n", "utf8");
			enabled = next;
			update();
			const expanded = ctx.ui.getToolsExpanded();
			ctx.ui.setToolsExpanded(!expanded);
			ctx.ui.setToolsExpanded(expanded);
			ctx.ui.notify(`Calm ${enabled ? "on" : "off"}`, "info");
		},
	});
}
