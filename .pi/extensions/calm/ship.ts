// Copyright (c) 2026 sz-747. Licensed under the repository's MIT license.
import type { Component, TUI } from "@earendil-works/pi-tui";

/** A two-line, ASCII-only animation. Each widget owns its timer. */
export function createShip(tui: Pick<TUI, "requestRender">): Component & { dispose(): void } {
	let step = 0;
	let closed = false;
	const clock = setInterval(() => {
		if (!closed) { step++; tui.requestRender(); }
	}, 220);
	clock.unref?.();
	return {
		render(width) {
			const columns = Math.max(0, Math.floor(width));
			if (closed || !columns) return [];
			if (columns < 4) return ["~".repeat(columns)];
			const travel = columns - 4;
			const distance = Math.floor(step / 4);
			const cycle = travel ? distance % (2 * travel) : 0;
			const left = cycle > travel;
			const column = left ? 2 * travel - cycle : cycle;
			const sail = cycle === travel && travel > 0 || left ? "|>" : "<|";
			const waves = Array.from({ length: columns }, (_, i) => (i + step) % 4 === 0 ? "-" : "~");
			return [
				" ".repeat(column + 1) + `\x1b[33m${sail}\x1b[39m`,
				`\x1b[32m${waves.slice(0, column).join("")}\x1b[33m\\__/\x1b[32m${waves.slice(column + 4).join("")}\x1b[39m`,
			];
		},
		invalidate() {},
		dispose() { closed = true; clearInterval(clock); },
	};
}
