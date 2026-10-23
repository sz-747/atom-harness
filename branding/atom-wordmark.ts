import { type Component } from "@earendil-works/pi-tui";
import { detectAtomBlocks, drawFace, FACE_ASPECT, WORDMARK, WORDMARK_TEXT } from "./face";
import { renderInkRows } from "./ink-banner";
import { CAPTION_COLOR, detectAtomColorMode, type AtomEnvironment } from "./theme/forest";

export { BLOCK_SETS, detectAtomBlocks, EYE, FACE_ASPECT, WORDMARK, WORDMARK_TEXT, wordmarkText } from "./face";
export type { AtomBlocks } from "./face";

/** Below this many columns the block lettering is unreadable, so a caption replaces it. */
const CAPTION_BELOW = 64;
/** Rows left to Pi's UI below the banner when there is no component tree to measure. */
const RESERVED = 8;

/** Anything in Pi's component tree: a component, or a container that exposes its children. */
interface Renderable { render(width: number): string[]; children?: readonly Renderable[] }
/** What the header reads from Pi's TUI: the live terminal height and, when present, the component tree it shares the screen with. */
export interface HeaderHost { terminal: { rows: number }; children?: readonly Renderable[] }
export interface AtomHeader extends Component {
	/** The conversation has begun: stop refitting the banner around Pi's startup output (a resize still refits it). */
	settle(): void;
}

/** The reference image sampled onto the terminal's own cell grid, never stretched glyphs. */
export function renderAtomHeader(width: number, env: AtomEnvironment = process.env, terminalHeight = 32, reserved = RESERVED): string[] {
	const available = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
	const mode = detectAtomColorMode(env);
	const height = Number.isFinite(terminalHeight) ? Math.max(0, Math.floor(terminalHeight)) : 32;
	const budget = Math.max(0, height - reserved);
	const artWidth = Math.floor(Math.min(available - 2, (budget - 1) * FACE_ASPECT));
	const artHeight = Math.ceil(artWidth / FACE_ASPECT);
	if (artWidth >= 20 && artHeight >= 4) {
		const layout = drawFace(artWidth, artHeight, artWidth < CAPTION_BELOW, detectAtomBlocks(env));
		return [...renderInkRows(layout, available, Math.floor((available - artWidth) / 2), mode), ""];
	}
	if (budget < 2) return [];
	const name = available >= WORDMARK.length + 2 ? WORDMARK : WORDMARK_TEXT;
	if (available < name.length + 2) return [];
	return [...renderInkRows([[{ col: 0, text: name, fg: CAPTION_COLOR }]], available, Math.floor((available - name.length) / 2), mode), ""];
}

const holds = (node: Renderable, target: object): boolean => node.children?.some(child => child === target || holds(child, target)) ?? false;

/** Rows everything except the header occupies at this width: containers on the header's own path are descended, everything else renders exactly as Pi will render it. */
function rowsAround(root: { children?: readonly Renderable[] }, target: object, width: number): number {
	let rows = 0;
	for (const child of root.children ?? []) {
		if (child === target) continue;
		rows += holds(child, target) ? rowsAround(child, target, width) : child.render(width).length;
	}
	return rows;
}

/**
 * Width, height, color mode and glyph set changes invalidate the single-frame cache.
 * Pi anchors a frame taller than the terminal to its bottom, so the banner only takes
 * the rows Pi's own UI (startup notes, warnings, editor, footer) leaves free: measured on
 * every render until the conversation starts, then again whenever the terminal is resized.
 */
export function createAtomHeader(host: HeaderHost = { terminal: { get rows() { return process.stdout.rows ?? 32; } } }): AtomHeader {
	let key = "", lines: string[] = [], size = "", reserved = RESERVED, settled = false;
	const header: AtomHeader = {
		render(width) {
			const rows = host.terminal.rows;
			const nextSize = `${width}:${rows}`;
			if (host.children && (!settled || size !== nextSize)) {
				const around = rowsAround(host, header, width);
				// Once Pi's output alone fills the screen the banner sits in scrollback whatever its size; keep the default share there.
				reserved = around < rows ? around : RESERVED;
			}
			size = nextSize;
			const nextKey = `${nextSize}:${reserved}:${detectAtomColorMode(process.env)}:${detectAtomBlocks(process.env)}`;
			if (key !== nextKey) {
				lines = renderAtomHeader(width, process.env, rows, reserved);
				key = nextKey;
			}
			return [...lines];
		},
		invalidate() { key = ""; },
		settle() { settled = true; },
	};
	return header;
}
