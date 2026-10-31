// Atom Calm - a presentation-only "calm transcript" toggle for Pi.
//
// Adapted from Kun Chen's Pi Calm extension (itself adapted from Firstmate).
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Aligned with Pi 0.85.1 (see ATOM-CONFIG.md in E:\atom-harness). Every Pi seam
// this extension touches was checked against that version:
//   - AgentSession.prototype.getToolDefinition / getAllTools (sourceInfo.source "builtin")
//   - ToolExecutionComponent.prototype.render
//   - ExtensionUIContext.setWidget / setWorkingVisible / getToolsExpanded / setToolsExpanded
//
// /calm toggles it; the choice is stored in ~/.pi/agent/calm and is off by default.
// When on: the call/result shells of Pi's built-in tools are hidden (their image
// results stay) and a small boat replaces Pi's working row during a run. Thinking
// is deliberately left to Pi (settings hideThinkingBlock, Ctrl+T, click on a block)
// so the model's reasoning still shows where a long run is up to. Two parts of
// Kun's version were dropped for 0.85.1: the zero-row thinking adapter (Steve wants
// reasoning visible) and the /export and /share stock-render guard (0.85.1 exports
// HTML through core/export-html and shares JSONL, neither of which renders through
// the patched TUI component). Calm never changes prompts, tool execution, model
// context, or session data.
import { type ExtensionAPI, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { installCalmBuiltInToolShellLayout } from "./lib/built-in-tool-shells.ts";
import { loadCalmPreference, persistCalmPreference } from "./lib/preference.ts";
import { calmPresentationIsActive, setCalmPresentation } from "./lib/visibility.ts";
import { CALM_WORKING_SHIP_WIDGET_KEY, createCalmWorkingShipAnimation, createCalmWorkingShipWidget } from "./lib/working-ship.ts";

// The adapter probes the exact Pi API it patches. If a future Pi removes that API,
// it degrades with one diagnostic and the boat keeps working.
function installCalmPresentationAdapter(name: string, install: () => void): void {
	try {
		install();
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		console.error(`Calm: ${name} presentation adapter unavailable, skipping. ${reason}`);
	}
}

export default function calm(pi: ExtensionAPI): void {
	installCalmPresentationAdapter("built-in-tool-shells", installCalmBuiltInToolShellLayout);

	// One logical run, tracked from agent_start to agent_settled, so the boat does not
	// flicker between tool calls, continuations, retries, or compaction inside a run.
	let agentRunActive = false;
	let workingShipShown = false;
	// One animation per extension lifetime; hiding freezes it, session_start resets it.
	const workingShipAnimation = createCalmWorkingShipAnimation();

	// Sole owner of the working-row choice. The widget is only created or removed on a
	// real transition, so repeated starts cannot duplicate its timer.
	const applyWorkingPresentation = (ui: ExtensionUIContext, forceStockVisibility = false): void => {
		const showShip = agentRunActive && calmPresentationIsActive();
		if (showShip !== workingShipShown) {
			workingShipShown = showShip;
			ui.setWidget(CALM_WORKING_SHIP_WIDGET_KEY, showShip ? tui => createCalmWorkingShipWidget(tui, workingShipAnimation) : undefined);
			ui.setWorkingVisible(!showShip);
		} else if (forceStockVisibility && !showShip) {
			ui.setWorkingVisible(true);
		}
	};

	// Flip tool expansion twice to force a transcript redraw while keeping the Ctrl+O state.
	const redrawTranscript = (ui: ExtensionUIContext): void => {
		const expanded = ui.getToolsExpanded();
		ui.setToolsExpanded(!expanded);
		ui.setToolsExpanded(expanded);
	};

	pi.on("session_start", (_event, ctx) => {
		setCalmPresentation(loadCalmPreference());
		agentRunActive = false;
		workingShipShown = false;
		workingShipAnimation.reset();
		applyWorkingPresentation(ctx.ui, true);
	});

	pi.on("agent_start", (_event, ctx) => {
		agentRunActive = true;
		applyWorkingPresentation(ctx.ui);
	});

	// agent_settled fires from a finally block, so it also covers abort and failure.
	pi.on("agent_settled", (_event, ctx) => {
		agentRunActive = false;
		applyWorkingPresentation(ctx.ui);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		agentRunActive = false;
		applyWorkingPresentation(ctx.ui);
	});

	pi.registerCommand("calm", {
		description: "Toggle Calm: hide built-in tool shells and show a boat while working (presentation only)",
		handler: async (_args, ctx) => {
			const active = !calmPresentationIsActive();
			// Persist first: if the file cannot be written, the toggle fails with a clear
			// error instead of silently reverting on the next restart.
			persistCalmPreference(active);
			setCalmPresentation(active);
			applyWorkingPresentation(ctx.ui, true);
			redrawTranscript(ctx.ui);
			ctx.ui.notify(`Calm ${active ? "on" : "off"}`, "info");
		},
	});
}
