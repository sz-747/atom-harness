// Atom Calm - an outcome-oriented progress view for Pi.
//
// Adapted from Kun Chen's Pi Calm extension (itself adapted from Firstmate).
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Legacy presentation policy, originally aligned with Pi 0.85.1.
// The offline compatibility tests also exercise the installed Pi runtime:
//   - AgentSession.prototype.getToolDefinition / getAllTools (builtin source metadata)
//   - ToolExecutionComponent.prototype.render
//   - ExtensionUIContext working widgets, visibility and transcript expansion
// See README.md in this directory for tested versions and limits.
//
// /calm groups reported subtasks, preserves expandable tool evidence and images,
// and replaces the working row with a boat. Work-progress metadata is recorded
// through one model-authored tool; no extra model/classifier or task runner is used.
import { type ExtensionAPI, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { installCalmBuiltInToolShellLayout } from "./lib/built-in-tool-shells.ts";
import { CalmProgress } from "./lib/progress.ts";
import { attachWorkProgress } from "./lib/work-progress.ts";
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
	let progress = new CalmProgress();
	installCalmPresentationAdapter("built-in-tool-shells", () => installCalmBuiltInToolShellLayout(() => progress));

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
		progress = new CalmProgress();
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
		description: "Toggle Calm: show subtask progress and outcomes with expandable operation details",
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
	attachWorkProgress(pi, () => progress);
}
