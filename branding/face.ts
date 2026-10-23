/**
 * Exact reproduction of ../atom-face.png. The generated grid (see
 * scripts/sample-face.mjs) is area-averaged in linear light onto the terminal's
 * own cell grid, and every cell becomes the block-mosaic glyph plus pair of
 * colors that best reproduce its samples: 2×4 octants where the terminal draws
 * them itself, otherwise 2×3 sextants or 2×2 quadrants.
 */
import { inflateSync } from "node:zlib";
import { FACE_HEIGHT, FACE_PALETTE, FACE_PIXELS, FACE_SOURCE, FACE_WIDTH, WORDMARK_BOX } from "./generated/face-data";
import { CAPTION_COLOR, luminance, type AtomEnvironment, type RGB } from "./theme/forest";

export type Stroke = { col: number; text: string; fg: RGB; bg?: RGB };
export type AtomBlocks = "octants" | "sextants" | "quadrants";
/** A mosaic of columns × rows sub-cells; `glyphs[mask]` draws the sub-cells whose bit is set (row-major from the top left). */
export type BlockSet = { readonly columns: number; readonly rows: number; readonly glyphs: readonly string[] };
/** The name drawn where the reference's block lettering sits, unless `ATOM_WORDMARK` names another (or "ATOM", the PNG's own letters). */
const DEFAULT_WORDMARK = "BASILIX";
/** Upper-case, single-spaced; empty falls back to the reference's own lettering. */
export function wordmarkText(env: AtomEnvironment): string {
	return (env.ATOM_WORDMARK ?? DEFAULT_WORDMARK).trim().toUpperCase().replace(/\s+/g, " ") || "ATOM";
}
export const WORDMARK_TEXT = wordmarkText(process.env);
/** The spaced caption drawn where the lettering itself would be unreadable. */
export const WORDMARK = [...WORDMARK_TEXT].join(" ");
/** A terminal cell is about twice as tall as it is wide. */
export const FACE_ASPECT = FACE_WIDTH * 2 / FACE_HEIGHT;
/**
 * The reference is bright ink on near-black. Anything darker than this (0–255
 * luminance) is that background and stays transparent, so nothing is ever
 * painted over the terminal's own background color.
 */
const TRANSPARENT = 40;
/** Cells whose sub-cells differ by less than this are one solid color. */
const FLAT = 12;
/**
 * A sub-cell is drawn in its ink's own color once the ink covers at least
 * 1/GAIN of it; sparser strokes are dimmed in proportion. A plain average would
 * dilute every thin curve and the dotted lettering with black, which flattens
 * the reference's greens into one muddy tone and buries the fine strokes.
 */
const GAIN = 2;
/** Sub-cells with less ink than this fraction are the gaps beside a stroke, not the stroke. */
const MIN_COVERAGE = 0.15;
/** A cell's darker half gets a background color only where it is at least this much ink: solid artwork, never the black around a stroke. */
const SOLID = 0.5;
/**
 * The dragon's eye, in source pixels of the reference: a piercing white eyeball
 * with a dark vertical slit, painted over the reference's small yellow-green
 * highlight (which sits at about 410–428 × 292–305).: the one deliberate
 * departure from the PNG's drawing.
 */
export const EYE = { x: 419, y: 298.5, rx: 12, ry: 8, pupil: { rx: 3, ry: 6 } } as const;

/** Octant patterns whose glyph predates Unicode 16's BLOCK OCTANT range, keyed by bit mask. */
const OCTANT_LEGACY: Record<number, string> = {
	0: " ", 1: "\u{1CEA8}", 2: "\u{1CEAB}", 3: "\u{1FB82}", 5: "▘", 10: "▝", 15: "▀", 20: "\u{1FBE6}", 40: "\u{1FBE7}",
	63: "\u{1FB85}", 64: "\u{1CEA3}", 80: "▖", 85: "▌", 90: "▞", 95: "▛", 128: "\u{1CEA0}", 160: "▗", 165: "▚", 170: "▐",
	175: "▜", 192: "▂", 240: "▄", 245: "▙", 250: "▟", 252: "▆", 255: "█",
};
/** Sextant patterns that Unicode 13 left to the half and full blocks. */
const SEXTANT_LEGACY: Record<number, string> = { 0: " ", 21: "▌", 42: "▐", 63: "█" };

/** Unicode assigns every remaining pattern consecutively from `first`, in bit-mask order. */
function blockSet(columns: number, rows: number, first: number, legacy: Record<number, string>): BlockSet {
	const glyphs: string[] = [];
	let next = first;
	for (let mask = 0; mask < 1 << (columns * rows); mask++) glyphs.push(legacy[mask] ?? String.fromCodePoint(next++));
	return { columns, rows, glyphs };
}

/** Finest to coarsest: U+1CD00 octants (Unicode 16), U+1FB00 sextants (Unicode 13), U+2580 quadrants. */
export const BLOCK_SETS: Record<AtomBlocks, BlockSet> = {
	octants: blockSet(2, 4, 0x1cd00, OCTANT_LEGACY),
	sextants: blockSet(2, 3, 0x1fb00, SEXTANT_LEGACY),
	quadrants: { columns: 2, rows: 2, glyphs: [" ", "▘", "▝", "▀", "▖", "▌", "▞", "▛", "▗", "▚", "▐", "▜", "▄", "▙", "▟", "█"] },
};

/**
 * ATOM_BLOCKS=octants|sextants|quadrants overrides. Otherwise only terminals that
 * draw octants themselves (independent of the font) get them: Windows Terminal,
 * kitty, Ghostty, foot. WezTerm draws sextants. Everything else gets the quadrants
 * every block-capable font has, since a missing glyph is worse than a coarser one.
 */
export function detectAtomBlocks(env: AtomEnvironment): AtomBlocks {
	const wanted = env.ATOM_BLOCKS?.toLowerCase();
	if (wanted === "octants" || wanted === "sextants" || wanted === "quadrants") return wanted;
	const term = env.TERM?.toLowerCase() ?? "", program = env.TERM_PROGRAM?.toLowerCase() ?? "";
	if (env.WT_SESSION !== undefined || program === "ghostty" || term === "xterm-kitty" || env.KITTY_WINDOW_ID !== undefined || term.startsWith("foot")) return "octants";
	if (program === "wezterm") return "sextants";
	return "quadrants";
}

/** Octants and sextants sit above U+FFFF, so cell counts must walk code points, not UTF-16 units. */
export const cellCount = (text: string): number => { let count = 0; for (const _ of text) count++; return count; };

const LINEAR = Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const srgb = (l: number) => Math.round(255 * Math.max(0, Math.min(1, l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055)));

type Grid = { width: number; height: number; linear: Float32Array };
type Box = { x: number; y: number; width: number; height: number };
type Vec = readonly [number, number, number];
/** Per sample: the plain (box-filtered) linear mean and the brightness-weighted "ink" color. */
type Samples = { stride: number; mean: Float32Array; ink: Float32Array };
type Sample = { mean: Vec; ink: Vec; level: number; coverage: number; bit: number };
let grid: Grid | undefined;

/** Relative luminance of a linear-light color. */
const Y = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const WHITE: Vec = [1, 1, 1];
/** The reference's near-black background: the pupil's slit and the cleared lettering stay transparent like every other dark part. */
const BACKGROUND: Vec = [LINEAR[0], LINEAR[8], LINEAR[5]];

/**
 * Paint an overlay into the grid in linear light: every grid pixel of the source
 * box is supersampled and `shade` gives each sample's color, or nothing to keep
 * the reference there, so rims, slits and claw tips stay smooth at every size.
 */
function paintOverlay(linear: Float32Array, box: Box, shade: (px: number, py: number) => Vec | undefined, steps = 4): void {
	const { x: ox, y: oy, scale } = FACE_SOURCE;
	const x0 = Math.max(0, Math.floor((box.x - ox) / scale)), x1 = Math.min(FACE_WIDTH - 1, Math.ceil((box.x + box.width - ox) / scale));
	const y0 = Math.max(0, Math.floor((box.y - oy) / scale)), y1 = Math.min(FACE_HEIGHT - 1, Math.ceil((box.y + box.height - oy) / scale));
	for (let gy = y0; gy <= y1; gy++) {
		for (let gx = x0; gx <= x1; gx++) {
			const i = (gy * FACE_WIDTH + gx) * 3, under: Vec = [linear[i], linear[i + 1], linear[i + 2]], sum = [0, 0, 0];
			for (let sy = 0; sy < steps; sy++) {
				for (let sx = 0; sx < steps; sx++) {
					const color = shade(ox + (gx + (sx + 0.5) / steps) * scale, oy + (gy + (sy + 0.5) / steps) * scale) ?? under;
					for (let c = 0; c < 3; c++) sum[c] += color[c] / (steps * steps);
				}
			}
			linear.set(sum, i);
		}
	}
}

/** The eye: a white ellipse with the background-colored slit inside it. */
function paintEye(linear: Float32Array): void {
	const inside = (px: number, py: number, rx: number, ry: number) => ((px - EYE.x) / rx) ** 2 + ((py - EYE.y) / ry) ** 2 <= 1;
	paintOverlay(linear, { x: EYE.x - EYE.rx, y: EYE.y - EYE.ry, width: 2 * EYE.rx, height: 2 * EYE.ry }, (px, py) =>
		inside(px, py, EYE.pupil.rx, EYE.pupil.ry) ? BACKGROUND : inside(px, py, EYE.rx, EYE.ry) ? WHITE : undefined);
}

/**
 * Block capitals as centerline strokes in a unit box (x across the glyph, y from
 * its top to its bottom), each `width` of its height wide. Strokes get square
 * caps as thick as the reference's lettering, so every glyph fills its box.
 */
type Glyph = { width: number; strokes: readonly (readonly (readonly [number, number])[])[] };
const RING: Glyph["strokes"] = [[[0.18, 0], [0.82, 0], [1, 0.18], [1, 0.82], [0.82, 1], [0.18, 1], [0, 0.82], [0, 0.18], [0.18, 0]]];
const BOWL: Glyph["strokes"] = [[[0, 1], [0, 0], [0.8, 0], [1, 0.15], [1, 0.42], [0.8, 0.57], [0, 0.57]]];
const BLOCK_FONT: Record<string, Glyph> = {
	A: { width: 0.78, strokes: [[[0, 1], [0.28, 0], [0.72, 0], [1, 1]], [[0.16, 0.66], [0.84, 0.66]]] },
	B: { width: 0.72, strokes: [[[0, 0], [0, 1]], [[0, 0], [0.72, 0], [0.9, 0.12], [0.9, 0.38], [0.72, 0.5], [0, 0.5]], [[0, 0.5], [0.8, 0.5], [1, 0.62], [1, 0.88], [0.8, 1], [0, 1]]] },
	C: { width: 0.72, strokes: [[[1, 0.18], [0.82, 0], [0.18, 0], [0, 0.18], [0, 0.82], [0.18, 1], [0.82, 1], [1, 0.82]]] },
	D: { width: 0.72, strokes: [[[0, 0], [0, 1]], [[0, 0], [0.65, 0], [1, 0.25], [1, 0.75], [0.65, 1], [0, 1]]] },
	E: { width: 0.66, strokes: [[[1, 0], [0, 0], [0, 1], [1, 1]], [[0, 0.5], [0.85, 0.5]]] },
	F: { width: 0.64, strokes: [[[1, 0], [0, 0], [0, 1]], [[0, 0.5], [0.85, 0.5]]] },
	G: { width: 0.74, strokes: [[[1, 0.18], [0.82, 0], [0.18, 0], [0, 0.18], [0, 0.82], [0.18, 1], [0.82, 1], [1, 0.82], [1, 0.5], [0.5, 0.5]]] },
	H: { width: 0.72, strokes: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]] },
	I: { width: 0.42, strokes: [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]], [[0, 1], [1, 1]]] },
	J: { width: 0.62, strokes: [[[0.2, 0], [1, 0]], [[0.7, 0], [0.7, 0.82], [0.52, 1], [0.18, 1], [0, 0.82]]] },
	K: { width: 0.72, strokes: [[[0, 0], [0, 1]], [[1, 0], [0, 0.58]], [[0.32, 0.4], [1, 1]]] },
	L: { width: 0.64, strokes: [[[0, 0], [0, 1], [1, 1]]] },
	M: { width: 0.95, strokes: [[[0, 1], [0, 0], [0.5, 0.62], [1, 0], [1, 1]]] },
	N: { width: 0.76, strokes: [[[0, 1], [0, 0], [1, 1], [1, 0]]] },
	O: { width: 0.76, strokes: RING },
	P: { width: 0.7, strokes: BOWL },
	Q: { width: 0.76, strokes: [...RING, [[0.6, 0.65], [1, 1]]] },
	R: { width: 0.72, strokes: [...BOWL, [[0.45, 0.57], [1, 1]]] },
	S: { width: 0.72, strokes: [[[1, 0.18], [0.82, 0], [0.18, 0], [0, 0.18], [0, 0.36], [0.18, 0.5], [0.82, 0.5], [1, 0.64], [1, 0.82], [0.82, 1], [0.18, 1], [0, 0.82]]] },
	T: { width: 0.74, strokes: [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]]] },
	U: { width: 0.72, strokes: [[[0, 0], [0, 0.82], [0.18, 1], [0.82, 1], [1, 0.82], [1, 0]]] },
	V: { width: 0.78, strokes: [[[0, 0], [0.5, 1], [1, 0]]] },
	W: { width: 1, strokes: [[[0, 0], [0.22, 1], [0.5, 0.4], [0.78, 1], [1, 0]]] },
	X: { width: 0.76, strokes: [[[0, 0], [1, 1]], [[1, 0], [0, 1]]] },
	Y: { width: 0.76, strokes: [[[0, 0], [0.5, 0.5], [1, 0]], [[0.5, 0.5], [0.5, 1]]] },
	Z: { width: 0.7, strokes: [[[0, 0], [1, 0], [0, 1], [1, 1]]] },
	" ": { width: 0.45, strokes: [] },
};
/**
 * Stroke thickness and the gap between letters as fractions of the lettering
 * height, a little lighter than the reference's four blocks so longer names keep
 * open counters; a name is condensed to at most MIN_SQUEEZE of its natural width
 * before it is made shorter than the box instead.
 */
const STROKE = 0.2, GAP = 0.12, MIN_SQUEEZE = 0.85;

/**
 * Replace the reference's lettering with another name in the same block style:
 * the box is cleared to the background and the letters are drawn in the
 * reference's own gradient, read row by row off the "ATOM" blocks first, so
 * they keep its exact lime-to-dark shading. Letters fill the box's height and
 * are condensed only when the name is too long for its width.
 */
function paintWordmark(linear: Float32Array, text: string): void {
	const { x: ox, y: oy, scale } = FACE_SOURCE;
	const box = { x: ox + WORDMARK_BOX.x * scale, y: oy + WORDMARK_BOX.y * scale, width: WORDMARK_BOX.width * scale, height: WORDMARK_BOX.height * scale };
	const rows: (Vec | undefined)[] = [];
	for (let gy = WORDMARK_BOX.y; gy < WORDMARK_BOX.y + WORDMARK_BOX.height; gy++) {
		const sum = [0, 0, 0];
		let n = 0;
		for (let gx = WORDMARK_BOX.x; gx < WORDMARK_BOX.x + WORDMARK_BOX.width; gx++) {
			const i = (gy * FACE_WIDTH + gx) * 3;
			if (Y([linear[i], linear[i + 1], linear[i + 2]]) < LINEAR[90]) continue;
			for (let c = 0; c < 3; c++) sum[c] += linear[i + c];
			n++;
		}
		rows.push(n ? [sum[0] / n, sum[1] / n, sum[2] / n] : rows[rows.length - 1]);
	}
	// Rows above the reference's letters have no ink of their own; they take the first row that does.
	const first = rows.find(Boolean) ?? BACKGROUND;
	const shades: Vec[] = rows.map(row => row ?? first);
	const glyphs = [...text].map(ch => BLOCK_FONT[ch] ?? BLOCK_FONT[" "]);
	const perHeight = glyphs.reduce((sum, glyph) => sum + glyph.width, 0) + GAP * (glyphs.length - 1);
	const height = Math.min(box.height, box.width / (perHeight * MIN_SQUEEZE));
	const squeeze = Math.min(1, box.width / (perHeight * height)), radius = STROKE * height / 2, top = box.y + (box.height - height) / 2;
	// Every stroke as a square-capped segment in source pixels, with its bounds; centerlines are inset by the
	// stroke radius so the strokes fill each glyph's box exactly.
	const segments: { ax: number; ay: number; dx: number; dy: number; len: number; x0: number; x1: number; y0: number; y1: number }[] = [];
	let next = box.x + (box.width - perHeight * height * squeeze) / 2;
	for (const glyph of glyphs) {
		const width = glyph.width * height * squeeze;
		const sx = (u: number) => next + radius + u * (width - 2 * radius), sy = (v: number) => top + radius + v * (height - 2 * radius);
		for (const stroke of glyph.strokes) {
			for (let k = 0; k + 1 < stroke.length; k++) {
				const ax = sx(stroke[k][0]), ay = sy(stroke[k][1]), bx = sx(stroke[k + 1][0]), by = sy(stroke[k + 1][1]), len = Math.hypot(bx - ax, by - ay);
				if (!len) continue;
				const pad = radius * Math.SQRT2;
				segments.push({ ax, ay, dx: bx - ax, dy: by - ay, len, x0: Math.min(ax, bx) - pad, x1: Math.max(ax, bx) + pad, y0: Math.min(ay, by) - pad, y1: Math.max(ay, by) + pad });
			}
		}
		next += (glyph.width + GAP) * height * squeeze;
	}
	// Rasterize the letters once per source pixel (twice the grid's resolution), each stroke over its own bounds only.
	const columns = Math.ceil(box.width) + 1, lines = Math.ceil(box.height) + 1, mask = new Uint8Array(columns * lines);
	for (const { ax, ay, dx, dy, len, x0, x1, y0, y1 } of segments) {
		for (let my = Math.max(0, Math.floor(y0 - box.y)); my < Math.min(lines, Math.ceil(y1 - box.y)); my++) {
			for (let mx = Math.max(0, Math.floor(x0 - box.x)); mx < Math.min(columns, Math.ceil(x1 - box.x)); mx++) {
				if (mask[my * columns + mx]) continue;
				const px = box.x + mx + 0.5, py = box.y + my + 0.5;
				const s = ((px - ax) * dx + (py - ay) * dy) / len, p = Math.abs((px - ax) * dy - (py - ay) * dx) / len;
				if (s >= -radius && s <= len + radius && p <= radius) mask[my * columns + mx] = 1;
			}
		}
	}
	// The gradient spans the letters' own height, so a shorter name still runs from the reference's lime top to its dark foot.
	// Two samples per grid pixel land once in each mask pixel, so denser sampling would only repeat lookups.
	paintOverlay(linear, box, (px, py) => {
		const mx = Math.floor(px - box.x), my = Math.floor(py - box.y);
		if (mx < 0 || my < 0 || mx >= columns || my >= lines || !mask[my * columns + mx]) return BACKGROUND;
		return shades[Math.max(0, Math.min(shades.length - 1, Math.floor((py - top) / height * shades.length)))];
	}, 2);
}

/** Inflate the generated grid once into linear-light RGB, then add the eye and the claws, and any other name over the lettering. */
export function loadFace(): Grid {
	if (grid) return grid;
	const indices = inflateSync(Buffer.from(FACE_PIXELS, "base64"));
	if (indices.length !== FACE_WIDTH * FACE_HEIGHT) throw new Error(`Atom face grid is ${indices.length} pixels, expected ${FACE_WIDTH * FACE_HEIGHT}`);
	const palette = Array.from({ length: FACE_PALETTE.length / 6 }, (_, i) =>
		[0, 2, 4].map(offset => LINEAR[parseInt(FACE_PALETTE.slice(i * 6 + offset, i * 6 + offset + 2), 16)]));
	const linear = new Float32Array(indices.length * 3);
	for (let i = 0; i < indices.length; i++) {
		const color = palette[indices[i]];
		if (!color) throw new Error(`Atom face pixel ${i} uses missing color ${indices[i]}`);
		linear.set(color, i * 3);
	}
	paintEye(linear);
	if (WORDMARK_TEXT !== "ATOM") paintWordmark(linear, WORDMARK_TEXT);
	return grid = { width: FACE_WIDTH, height: FACE_HEIGHT, linear };
}

/**
 * Box-filter the grid onto width × height samples; masked pixels read as background.
 * Alongside the plain mean, each sample keeps its ink color: the same pixels
 * weighted by brightness, so a thin stroke reads as its own green rather than
 * that green diluted with the black around it.
 */
function resample(source: Grid, width: number, height: number, mask?: Box): Samples {
	const mean = new Float32Array(width * height * 3), ink = new Float32Array(width * height * 3);
	const scaleX = source.width / width, scaleY = source.height / height;
	for (let ty = 0; ty < height; ty++) {
		const top = ty * scaleY, bottom = top + scaleY;
		for (let tx = 0; tx < width; tx++) {
			const left = tx * scaleX, right = left + scaleX;
			let r = 0, g = 0, b = 0, total = 0, ir = 0, ig = 0, ib = 0, inkTotal = 0;
			for (let y = Math.floor(top); y < Math.min(source.height, Math.ceil(bottom)); y++) {
				const rowWeight = Math.min(y + 1, bottom) - Math.max(y, top);
				for (let x = Math.floor(left); x < Math.min(source.width, Math.ceil(right)); x++) {
					const weight = rowWeight * (Math.min(x + 1, right) - Math.max(x, left));
					total += weight;
					if (mask && x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height) continue;
					const i = (y * source.width + x) * 3;
					const lr = source.linear[i], lg = source.linear[i + 1], lb = source.linear[i + 2];
					r += lr * weight;
					g += lg * weight;
					b += lb * weight;
					const brightness = weight * (0.2126 * lr + 0.7152 * lg + 0.0722 * lb);
					ir += lr * brightness;
					ig += lg * brightness;
					ib += lb * brightness;
					inkTotal += brightness;
				}
			}
			const o = (ty * width + tx) * 3;
			mean[o] = r / total;
			mean[o + 1] = g / total;
			mean[o + 2] = b / total;
			ink[o] = inkTotal > 0 ? ir / inkTotal : mean[o];
			ink[o + 1] = inkTotal > 0 ? ig / inkTotal : mean[o + 1];
			ink[o + 2] = inkTotal > 0 ? ib / inkTotal : mean[o + 2];
		}
	}
	return { stride: width, mean, ink };
}

/**
 * Keep the pupil at every size. Its slit is only six source pixels wide, so once
 * a sub-cell grows past it the white around it outvotes it and the eye becomes
 * a blank disc. After resampling, the sub-cell column under the eye's center is
 * blacked out wherever it overlaps the pupil, as long as the eye is still at
 * least two sub-cells wide so white remains on both sides of the slit. Returns
 * the indices of the pinned samples; their cells leave those sub-cells unlit.
 */
function pinPupil(samples: Samples, columns: number, rows: number): Set<number> {
	const pinned = new Set<number>();
	const { x: ox, y: oy, scale } = FACE_SOURCE;
	const subWidth = FACE_WIDTH * scale / columns, subHeight = FACE_HEIGHT * scale / rows;
	if (subWidth > EYE.rx) return pinned;
	const column = Math.floor((EYE.x - ox) / subWidth);
	const top = EYE.y - EYE.pupil.ry, bottom = EYE.y + EYE.pupil.ry;
	for (let row = Math.floor((top - oy) / subHeight); row <= Math.floor((bottom - oy) / subHeight); row++) {
		if (row < 0 || row >= rows) continue;
		const rowTop = oy + row * subHeight, rowBottom = rowTop + subHeight;
		const overlap = Math.min(rowBottom, bottom) - Math.max(rowTop, top);
		if (overlap < subHeight / 2 && !(EYE.y >= rowTop && EYE.y < rowBottom)) continue;
		const i = row * samples.stride + column;
		pinned.add(i);
		samples.mean.fill(0, i * 3, i * 3 + 3);
		samples.ink.fill(0, i * 3, i * 3 + 3);
	}
	return pinned;
}

/** Squared deviation of the sub-cells' levels from their mean. */
const variance = (group: readonly Sample[]): number => {
	const center = group.reduce((sum, sample) => sum + sample.level, 0) / group.length;
	return group.reduce((sum, sample) => sum + (sample.level - center) ** 2, 0);
};

/**
 * A group's color is its ink's, brighter sub-cells weighing more, dimmed only
 * where the ink covers less than 1/GAIN of the group. `coverage` is the fraction
 * of the group the ink occupies.
 */
function paint(group: readonly Sample[]): { color: RGB; coverage: number } {
	const mean = [0, 0, 0], ink = [0, 0, 0];
	let weight = 0;
	for (const sample of group) {
		const w = Y(sample.mean);
		for (let c = 0; c < 3; c++) {
			mean[c] += sample.mean[c] / group.length;
			ink[c] += sample.ink[c] * w;
		}
		weight += w;
	}
	for (let c = 0; c < 3; c++) ink[c] = weight > 0 ? ink[c] / weight : mean[c];
	const coverage = Y(ink) > 0 ? Math.min(1, Y(mean) / Y(ink)) : 1;
	const scale = Math.min(1, GAIN * coverage);
	return { color: [srgb(ink[0] * scale), srgb(ink[1] * scale), srgb(ink[2] * scale)], coverage };
}

/** Pick the mosaic glyph and two colors that best reproduce a cell's sub-cell samples. */
function paintCell(samples: Samples, set: BlockSet, col: number, row: number, pinned: ReadonlySet<number>): Omit<Stroke, "col"> | undefined {
	const cell: Sample[] = [];
	let pins = false;
	for (let bit = 0; bit < set.columns * set.rows; bit++) {
		const y = row * set.rows + Math.floor(bit / set.columns), x = col * set.columns + bit % set.columns;
		if (pinned.has(y * samples.stride + x)) pins = true;
		const i = (y * samples.stride + x) * 3;
		const mean = [samples.mean[i], samples.mean[i + 1], samples.mean[i + 2]] as const;
		const ink = [samples.ink[i], samples.ink[i + 1], samples.ink[i + 2]] as const;
		const level = luminance([srgb(mean[0]), srgb(mean[1]), srgb(mean[2])]);
		cell.push({ mean, ink, level, coverage: Y(ink) > 0 ? Math.min(1, Y(mean) / Y(ink)) : 1, bit: 1 << bit });
	}
	cell.sort((a, b) => b.level - a.level);
	if (cell[0].level < TRANSPARENT || cell[0].coverage < MIN_COVERAGE) return undefined;
	if (cell[0].level - cell[cell.length - 1].level < FLAT) return { text: "█", fg: paint(cell).color };
	// Split the brightest k sub-cells from the rest where both groups are most uniform.
	let split = 1, error = Infinity;
	for (let k = 1; k < cell.length; k++) {
		const candidate = variance(cell.slice(0, k)) + variance(cell.slice(k));
		if (candidate < error) { error = candidate; split = k; }
	}
	const bright = cell.slice(0, split), dark = paint(cell.slice(split));
	// A pinned sub-cell (the pupil) must stay the terminal's own background, so its cell paints none.
	const bg = !pins && dark.coverage >= SOLID && luminance(dark.color) >= TRANSPARENT ? dark.color : undefined;
	return { text: set.glyphs[bright.reduce((mask, sample) => mask | sample.bit, 0)], fg: paint(bright).color, bg };
}

const same = (a?: RGB, b?: RGB) => a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

/** Remove the cells in [from, to) from a row, splitting runs that straddle the edges. */
function cut(strokes: readonly Stroke[], from: number, to: number): Stroke[] {
	const kept: Stroke[] = [];
	for (const stroke of strokes) {
		const glyphs = Array.from(stroke.text);
		const end = stroke.col + glyphs.length;
		if (end <= from || stroke.col >= to) { kept.push(stroke); continue; }
		if (stroke.col < from) kept.push({ ...stroke, text: glyphs.slice(0, from - stroke.col).join("") });
		if (end > to) kept.push({ ...stroke, col: to, text: glyphs.slice(to - stroke.col).join("") });
	}
	return kept;
}

/** Render the reference at width × height cells. With `caption`, the block lettering becomes readable text. */
export function drawFace(width: number, height: number, caption = false, blocks: AtomBlocks = "quadrants"): Stroke[][] {
	const source = loadFace();
	const set = BLOCK_SETS[blocks];
	const samples = resample(source, width * set.columns, height * set.rows, caption ? WORDMARK_BOX : undefined);
	const pinned = pinPupil(samples, width * set.columns, height * set.rows);
	const rows = Array.from({ length: height }, (_, row) => {
		const strokes: Stroke[] = [];
		let last: Stroke | undefined;
		for (let col = 0; col < width; col++) {
			const cell = paintCell(samples, set, col, row, pinned);
			if (!cell) { last = undefined; continue; }
			if (last && same(last.fg, cell.fg) && same(last.bg, cell.bg)) last.text += cell.text;
			else strokes.push(last = { col, ...cell });
		}
		return strokes;
	});
	if (caption) {
		const row = Math.min(height - 1, Math.floor((WORDMARK_BOX.y + WORDMARK_BOX.height / 2) / source.height * height));
		const col = Math.floor((width - WORDMARK.length) / 2);
		rows[row] = cut(rows[row], col - 1, col + WORDMARK.length + 1);
		rows[row].push({ col, text: WORDMARK, fg: CAPTION_COLOR });
		rows[row].sort((a, b) => a.col - b.col);
	}
	return rows;
}
