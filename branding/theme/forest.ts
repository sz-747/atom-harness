export type AtomColorMode = "truecolor" | "ansi256" | "ansi16" | "none";
export type RGB = readonly [red: number, green: number, blue: number];

export interface AtomEnvironment {
	[key: string]: string | undefined;
}

/** The reference's brightest jade, used for the small-terminal caption. */
export const CAPTION_COLOR: RGB = [160, 236, 124];

export function detectAtomColorMode(env: AtomEnvironment): AtomColorMode {
	if (env.NO_COLOR !== undefined || env.FORCE_COLOR === "0") return "none";

	const colorTerm = env.COLORTERM?.toLowerCase() ?? "";
	const term = env.TERM?.toLowerCase() ?? "";
	const termProgram = env.TERM_PROGRAM?.toLowerCase() ?? "";

	if (term === "dumb") return "none";
	if (
		env.FORCE_COLOR === "3" ||
		colorTerm.includes("truecolor") ||
		colorTerm.includes("24bit") ||
		term.includes("truecolor") ||
		term.includes("24bit") ||
		term.includes("direct") ||
		env.WT_SESSION !== undefined ||
		["iterm.app", "wezterm", "vscode", "hyper", "alacritty", "ghostty"].includes(termProgram)
	) {
		return "truecolor";
	}

	if (env.FORCE_COLOR === "2" || term.includes("256color")) return "ansi256";
	return "ansi16";
}

export const luminance = ([red, green, blue]: RGB): number => 0.2126 * red + 0.7152 * green + 0.0722 * blue;

const CUBE = [0, 95, 135, 175, 215, 255];
const nearest = (value: number) => CUBE.reduce((best, level, i) => Math.abs(level - value) < Math.abs(CUBE[best] - value) ? i : best, 0);

/** Nearest xterm-256 index: the 6×6×6 color cube or the 24-step gray ramp. */
export function ansi256(rgb: RGB): number {
	const cube = rgb.map(nearest);
	const gray = Math.round((rgb[0] + rgb[1] + rgb[2]) / 3);
	const step = gray < 8 ? 0 : gray > 238 ? 23 : Math.round((gray - 8) / 10);
	const distance = (candidate: readonly number[]) => candidate.reduce((sum, value, i) => sum + (value - rgb[i]) ** 2, 0);
	return distance(cube.map(i => CUBE[i])) <= distance([8 + step * 10, 8 + step * 10, 8 + step * 10])
		? 16 + 36 * cube[0] + 6 * cube[1] + cube[2]
		: 232 + step;
}

function sgr(rgb: RGB, background: boolean, mode: AtomColorMode): string {
	if (mode === "truecolor") return `${background ? 48 : 38};2;${rgb[0]};${rgb[1]};${rgb[2]}`;
	if (mode === "ansi256") return `${background ? 48 : 38};5;${ansi256(rgb)}`;
	// Plain green terminals: bright white for the eye, bright green for highlights, green for everything else.
	if (!background && Math.min(...rgb) > 200) return "97";
	return background ? "42" : luminance(rgb) > 150 ? "92" : "32";
}

/** One run of same-colored cells. Every painted run ends with a full SGR reset. */
export function paintRun(text: string, foreground: RGB, background: RGB | undefined, mode: AtomColorMode): string {
	if (text.length === 0) return text;
	if (mode === "none") {
		// Without color, two-tone cells become shading; edge glyphs keep their shape.
		if (!background) return text;
		const level = (luminance(foreground) + luminance(background)) / 2;
		// One shade per cell: octant and sextant glyphs are two UTF-16 units, so count code points.
		return (level > 140 ? "▓" : level > 70 ? "▒" : "░").repeat([...text].length);
	}
	const codes = [sgr(foreground, false, mode)];
	// Fill only occupied cells, never the surrounding terminal; 16-color mode has no dark green background.
	if (background && (mode !== "ansi16" || luminance(background) > 70)) codes.push(sgr(background, true, mode));
	return `\x1b[${codes.join(";")}m${text}\x1b[0m`;
}
