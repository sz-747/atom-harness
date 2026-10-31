// Atom Calm - animated working presentation.
//
// Adapted from Kun Chen's Pi Calm extension (itself adapted from Firstmate).
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// While an agent run is active, Calm replaces Pi's stock working row with a tiny
// two-row boat on rippling water. Atom's version uses green water to match the
// theme; the boat stays yellow so it reads against it.
//
// One scheduler drives two clocks: every tick advances the water phase, and every
// CALM_WORKING_SHIP_TICKS_PER_MOVE-th tick moves the boat one column. Disposing the
// widget freezes the state so the next working period resumes where it left off;
// session_start resets it.
//
// Aligned with Pi 0.85.1: ExtensionUIContext.setWidget() accepts a component factory
// (tui, theme) => Component & { dispose?() } and Pi renders widgets through
// Component.render(width), so the track is recomputed from that width each frame.
import type { Component, TUI } from "@earendil-works/pi-tui";

const HULL = "\\__/";
const SAIL_RIGHT = "<|";
const SAIL_LEFT = "|>";
const SAIL_OFFSET = 1;
const HULL_WIDTH = HULL.length;
const SAIL_WIDTH = SAIL_RIGHT.length;

// Fixed one-cell water phases: advancing the phase ripples without changing width.
const WAVE_CYCLE = ["~", "~", "-", "~"] as const;

// Standard ANSI foreground codes only, so no theme lookup is needed.
const WATER = "\u001b[32m";
const BOAT = "\u001b[33m";
const RESET = "\u001b[39m";

export const CALM_WORKING_SHIP_WIDGET_KEY = "calm-working-ship";
/** Scheduler period. One tick advances the water by one phase. */
export const CALM_WORKING_SHIP_TICK_MS = 220;
/** The boat moves one column every Nth tick. */
export const CALM_WORKING_SHIP_TICKS_PER_MOVE = 4;

export type CalmWorkingShipAnimation = {
	render(width: number): string[];
	tick(): void;
	restoreLastRendered(): void;
	reset(): void;
	clampToWidth(width: number): void;
	position(): number;
	direction(): number;
	waterPhase(): number;
};

/** Longest hull start column that still fits the sprite in `width` cells. */
function trackSpan(width: number): number {
	if (width >= HULL_WIDTH) return width - HULL_WIDTH;
	if (width >= SAIL_WIDTH) return width - SAIL_WIDTH;
	return 0;
}

export function createCalmWorkingShipAnimation(): CalmWorkingShipAnimation {
	let position = 0;
	let direction = 1;
	let span = 0;
	let phase = 0;
	let ticks = 0;
	let renderedPosition = position;
	let renderedDirection = direction;
	let renderedSpan = span;
	let renderedPhase = phase;
	let renderedTicks = ticks;

	// Reverse the moment the boat lands on an endpoint so no frame shows the old sail.
	const settleDirectionAtEdges = (): void => {
		if (span <= 0) return;
		if (position >= span) direction = -1;
		else if (position <= 0) direction = 1;
	};

	const applyWidth = (width: number): void => {
		if (width <= 0) {
			span = 0;
			position = 0;
			return;
		}
		span = trackSpan(width);
		position = Math.min(position, span);
		settleDirectionAtEdges();
	};

	const commitRenderedState = (): void => {
		renderedPosition = position;
		renderedDirection = direction;
		renderedSpan = span;
		renderedPhase = phase;
		renderedTicks = ticks;
	};

	const restoreLastRenderedState = (): void => {
		position = renderedPosition;
		direction = renderedDirection;
		span = renderedSpan;
		phase = renderedPhase;
		ticks = renderedTicks;
	};

	const water = (from: number, count: number): string => {
		if (count <= 0) return "";
		let cells = "";
		for (let column = from; column < from + count; column += 1) {
			cells += WAVE_CYCLE[(column + phase) % WAVE_CYCLE.length];
		}
		return `${WATER}${cells}${RESET}`;
	};

	const boat = (text: string): string => `${BOAT}${text}${RESET}`;

	return {
		position: () => position,
		direction: () => direction,
		waterPhase: () => phase,
		restoreLastRendered: restoreLastRenderedState,

		reset(): void {
			position = 0;
			direction = 1;
			span = 0;
			phase = 0;
			ticks = 0;
			commitRenderedState();
		},

		clampToWidth(width: number): void {
			applyWidth(width);
		},

		tick(): void {
			ticks += 1;
			phase = (phase + 1) % WAVE_CYCLE.length;
			if (ticks % CALM_WORKING_SHIP_TICKS_PER_MOVE !== 0) return;
			if (span <= 0) {
				position = 0;
				return;
			}
			position = Math.min(span, Math.max(0, position + direction));
			settleDirectionAtEdges();
		},

		render(width: number): string[] {
			if (width <= 0) return [];
			applyWidth(width);
			const sail = direction >= 0 ? SAIL_RIGHT : SAIL_LEFT;

			let frame: string[];
			if (width < SAIL_WIDTH) {
				frame = [water(0, width)];
			} else if (width < HULL_WIDTH) {
				frame = [water(0, position) + boat(sail) + water(position + SAIL_WIDTH, width - position - SAIL_WIDTH)];
			} else {
				frame = [
					" ".repeat(position + SAIL_OFFSET) + boat(sail),
					water(0, position) + boat(HULL) + water(position + HULL_WIDTH, width - position - HULL_WIDTH),
				];
			}

			commitRenderedState();
			return frame;
		},
	};
}

/**
 * Build the working widget bound to one caller-owned animation. Pi disposes the
 * previous component before installing a replacement under the same key, so the
 * scheduler cannot outlive the widget or duplicate.
 */
export function createCalmWorkingShipWidget(
	tui: TUI,
	animation: CalmWorkingShipAnimation = createCalmWorkingShipAnimation(),
): Component & { dispose(): void } {
	let disposed = false;
	const timer = setInterval(() => {
		if (disposed) return;
		animation.tick();
		tui.requestRender();
	}, CALM_WORKING_SHIP_TICK_MS);
	// The animation must never keep Pi's process alive on its own.
	timer.unref?.();

	return {
		render: width => (disposed ? [] : animation.render(width)),
		invalidate: () => {},
		dispose: () => {
			if (disposed) return;
			disposed = true;
			clearInterval(timer);
			animation.restoreLastRendered();
		},
	};
}
