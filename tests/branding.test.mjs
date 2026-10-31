// Run: node tests/branding.test.mjs (Node 24+, using the installed Pi runtime).
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { decodePng } from "../scripts/png.mjs";
import { FACE_HEIGHT, FACE_PALETTE, FACE_PIXELS, FACE_SOURCE, FACE_WIDTH, WORDMARK_BOX } from "../branding/generated/face-data.ts";
import { BLOCK_SETS, detectAtomBlocks, EYE, FACE_ASPECT, WORDMARK, wordmarkText } from "../branding/generated/header.mjs";
import { detectAtomColorMode } from "../branding/theme/forest.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const globalModules = execSync("npm root -g", { encoding: "utf8" }).trim();
const require = createRequire(import.meta.url);
const pi = [join(root, "node_modules"), globalModules]
	.map(base => join(base, "@earendil-works/pi-coding-agent"))
	.find(base => existsSync(join(base, "dist/index.js")));
assert(pi, "Installed Pi runtime not found");
const tui = [join(pi, "node_modules"), globalModules]
	.map(base => join(base, "@earendil-works/pi-tui/dist/index.js"))
	.find(existsSync);
assert(tui, "Pi TUI runtime not found");
const { visibleWidth } = await import(pathToFileURL(tui));
const { loadExtensions } = await import(pathToFileURL(join(pi, "dist/core/extensions/loader.js")));

// Use an already installed compiler, never install dependencies during tests.
let ts;
for (const base of [root, globalModules, join(globalModules, "vercel")]) {
	try { ts = require(require.resolve("typescript", { paths: [base] })); break; } catch {}
}
assert(ts, "TypeScript compiler not found. Install/provide TypeScript to run the typecheck.");
const sourceFiles = [
	".pi/extensions/atom-startup.ts",
	".pi/extensions/atom-compaction.ts",
	".pi/extensions/atom-footer.ts",
	"branding/face.ts", "branding/atom-wordmark.ts", "branding/theme/forest.ts",
].map(f => join(root, f));
const options = {
	noEmit: true, strict: true, skipLibCheck: true, jsx: ts.JsxEmit.ReactJSX,
	target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: pi,
	paths: {
		"@earendil-works/pi-coding-agent": ["dist/index.d.ts"],
		"@earendil-works/pi-tui": [tui.replace(/\.js$/, ".d.ts")],
	},
	typeRoots: [join(root, "node_modules/@types"), join(pi, "node_modules/@types"), join(globalModules, "@types")],
};
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(sourceFiles, options));
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
	getCurrentDirectory: () => root, getCanonicalFileName: f => f, getNewLine: () => "\n",
}));
console.log("PASS strict TypeScript (no emit)");

// The artwork is the reference itself: a palette grid sampled from the PNG at build time.
const png = decodePng(readFileSync(join(root, "atom-face.png")));
assert(FACE_SOURCE.x >= 0 && FACE_SOURCE.y >= 0 && FACE_SOURCE.scale >= 1);
assert(FACE_SOURCE.x + FACE_SOURCE.width <= png.width && FACE_SOURCE.y + FACE_SOURCE.height <= png.height);
assert.equal(FACE_WIDTH, Math.ceil(FACE_SOURCE.width / FACE_SOURCE.scale));
assert.equal(FACE_HEIGHT, Math.ceil(FACE_SOURCE.height / FACE_SOURCE.scale));
assert.equal(FACE_ASPECT, FACE_WIDTH * 2 / FACE_HEIGHT);
assert.equal(FACE_PALETTE.length % 6, 0);
const palette = FACE_PALETTE.match(/.{6}/g).map(hex => [0, 2, 4].map(o => parseInt(hex.slice(o, o + 2), 16)));
const indices = inflateSync(Buffer.from(FACE_PIXELS, "base64"));
assert.equal(indices.length, FACE_WIDTH * FACE_HEIGHT);
assert(indices.every(index => index < palette.length));
assert(WORDMARK_BOX.x > 0 && WORDMARK_BOX.y > 0);
assert(WORDMARK_BOX.x + WORDMARK_BOX.width < FACE_WIDTH && WORDMARK_BOX.y + WORDMARK_BOX.height <= FACE_HEIGHT);
// Every grid pixel is the linear-light mean of its source block, within palette error.
const toLinear = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = l => Math.round(255 * Math.max(0, Math.min(1, l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055)));
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
let drift = 0, checked = 0, inside = 0, insideCount = 0, outside = 0;
for (let i = 0; i < indices.length; i++) {
	const gx = i % FACE_WIDTH, gy = Math.floor(i / FACE_WIDTH), level = luminance(palette[indices[i]]);
	const boxed = gx >= WORDMARK_BOX.x && gx < WORDMARK_BOX.x + WORDMARK_BOX.width && gy >= WORDMARK_BOX.y && gy < WORDMARK_BOX.y + WORDMARK_BOX.height;
	if (boxed) { inside += level; insideCount++; } else outside += level;
	if (i % 13) continue;
	const sum = [0, 0, 0];
	let n = 0;
	for (let y = 0; y < FACE_SOURCE.scale; y++) for (let x = 0; x < FACE_SOURCE.scale; x++) {
		const sx = FACE_SOURCE.x + gx * FACE_SOURCE.scale + x, sy = FACE_SOURCE.y + gy * FACE_SOURCE.scale + y;
		if (sx >= FACE_SOURCE.x + FACE_SOURCE.width || sy >= FACE_SOURCE.y + FACE_SOURCE.height) continue;
		png.rgb(sx, sy).forEach((v, c) => { sum[c] += toLinear(v); });
		n++;
	}
	drift += Math.abs(luminance(sum.map(v => toSrgb(v / n))) - level);
	checked++;
}
assert(drift / checked < 4, `Grid drifts ${(drift / checked).toFixed(2)} luminance from the PNG`);
const ratio = (inside / insideCount) / (outside / (indices.length - insideCount));
assert(ratio > 2, `The wordmark box must cover the bright block lettering (only ${ratio.toFixed(2)}x brighter than the rest)`);
console.log(`PASS grid is sampled from atom-face.png (${FACE_WIDTH}×${FACE_HEIGHT}, ${palette.length} colors, ${checked} pixels checked)`);

// Block mosaics: every pattern has exactly one glyph; the new ones are Unicode 16 octants and Unicode 13 sextants.
const codePoints = text => Array.from(text, ch => ch.codePointAt(0));
for (const [name, set, first, last] of [["octants", BLOCK_SETS.octants, 0x1cd00, 0x1cde5], ["sextants", BLOCK_SETS.sextants, 0x1fb00, 0x1fb3b], ["quadrants", BLOCK_SETS.quadrants, 0x2580, 0x259f]]) {
	assert.equal(set.glyphs.length, 1 << (set.columns * set.rows), name);
	assert.equal(new Set(set.glyphs).size, set.glyphs.length, `${name} glyphs must be unique`);
	assert(set.glyphs.every(glyph => codePoints(glyph).length === 1), `${name} glyphs are single code points`);
	assert.equal(set.glyphs[0], " ");
	assert.equal(set.glyphs[set.glyphs.length - 1], "\u2588");
	const fresh = set.glyphs.map(glyph => glyph.codePointAt(0)).filter(cp => cp >= first && cp <= last);
	assert.equal(fresh.length, name === "quadrants" ? 15 : last - first + 1, `${name} must use the whole Unicode range`);
	if (name !== "quadrants") assert.deepEqual(fresh, [...fresh].sort((a, b) => a - b), `${name} must follow Unicode's bit-mask order`);
}
assert.equal(BLOCK_SETS.octants.glyphs[3], "\u{1FB82}");
assert.equal(BLOCK_SETS.octants.glyphs[20], "\u{1FBE6}");
assert.equal(BLOCK_SETS.octants.glyphs[0b11110000], "\u2584");
assert.equal(BLOCK_SETS.sextants.glyphs[0b010101], "\u258C");
assert.equal(detectAtomBlocks({ WT_SESSION: "x" }), "octants");
assert.equal(detectAtomBlocks({ TERM: "xterm-kitty" }), "octants");
assert.equal(detectAtomBlocks({ TERM_PROGRAM: "ghostty" }), "octants");
assert.equal(detectAtomBlocks({ TERM_PROGRAM: "WezTerm" }), "sextants");
assert.equal(detectAtomBlocks({ TERM: "xterm-256color" }), "quadrants");
assert.equal(detectAtomBlocks({ TERM_PROGRAM: "vscode", COLORTERM: "truecolor" }), "quadrants");
assert.equal(detectAtomBlocks({ WT_SESSION: "x", ATOM_BLOCKS: "quadrants" }), "quadrants");
assert.equal(detectAtomBlocks({ ATOM_BLOCKS: "Sextants" }), "sextants");
assert.equal(detectAtomBlocks({ ATOM_BLOCKS: "braille" }), "quadrants");
console.log("PASS block mosaics: octant, sextant and quadrant tables, terminal detection, ATOM_BLOCKS override");

const loaded = await loadExtensions([sourceFiles[0]], root);
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 1);
const handlers = loaded.extensions[0].handlers.get("session_start");
assert.equal(handlers.length, 1);
let component, installs = 0, terminalHeight = 32;
const ui = { setHeader: factory => { installs++; component = factory({ terminal: { get rows() { return terminalHeight; } } }); } };
for (const mode of ["print", "json", "rpc"]) await handlers[0]({ reason: "startup" }, { mode, ui });
assert.equal(installs, 0);
await handlers[0]({ reason: "startup" }, { mode: "tui", ui });
assert.equal(installs, 1);
console.log("PASS Pi extension loader, one header, non-TUI modes untouched");

const keys = ["COLORTERM", "TERM", "TERM_PROGRAM", "WT_SESSION", "KITTY_WINDOW_ID", "ATOM_BLOCKS", "NO_COLOR", "FORCE_COLOR"];
const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, "");
try {
	for (const [env, expected] of [
		[{ COLORTERM: "truecolor" }, "truecolor"],
		[{ WT_SESSION: "test" }, "truecolor"],
		[{ WT_SESSION: "test", ATOM_BLOCKS: "sextants" }, "truecolor"],
		[{ TERM: "xterm-256color" }, "ansi256"],
		[{ TERM: "vt100" }, "ansi16"],
		[{ NO_COLOR: "", FORCE_COLOR: "3" }, "none"],
		[{ NO_COLOR: "1", WT_SESSION: "test" }, "none"],
		[{ FORCE_COLOR: "0", WT_SESSION: "test" }, "none"],
		[{ TERM: "dumb", COLORTERM: "truecolor" }, "none"],
	]) {
		keys.forEach(k => delete process.env[k]);
		Object.assign(process.env, env);
		assert.equal(detectAtomColorMode(process.env), expected);
		for (const width of [...Array.from({ length: 201 }, (_, n) => n), -1, NaN, Infinity]) {
			const lines = component.render(width);
			for (const line of lines) {
				assert(visibleWidth(line) <= Math.max(0, width), `Overflow at ${width}`);
				assert(!line.includes(String.fromCharCode(8230)), "Ink must never truncate a row with an ellipsis at " + width);
				if (line.includes("\x1b[")) assert(line.endsWith("\x1b[0m"));
				if (expected === "none") assert(!line.includes("\x1b"));
				if (expected === "ansi256") assert(!/\x1b\[[0-9;]*;2;/.test(line), "256-color terminals get no truecolor codes");
				if (expected === "ansi16") assert(!/\x1b\[[0-9;]*;[25];/.test(line), "16-color terminals get plain SGR codes");
			}
			const text = lines.map(strip).join("\n");
			const blocks = detectAtomBlocks(process.env);
			const astral = codePoints(text).filter(cp => cp > 0xffff);
			if (blocks === "quadrants") assert.equal(astral.length, 0, "Quadrant mode must stay within Block Elements");
			else assert(astral.every(cp => blocks === "octants"
				? (cp >= 0x1cd00 && cp <= 0x1cde5) || [0x1cea0, 0x1cea3, 0x1cea8, 0x1ceab, 0x1fb82, 0x1fb85, 0x1fbe6, 0x1fbe7].includes(cp)
				: cp >= 0x1fb00 && cp <= 0x1fb3b), `${blocks} mode drew a glyph from another set`);
			if (lines.length > 2 && width >= 100) assert.equal(astral.length > 0, blocks !== "quadrants", `${blocks} mode should use its own glyphs at ${width} columns`);
			assert(!/agent harness|automate|evolve/i.test(text));
			assert(!/[⠀-⣿]/u.test(text), "No dotted Braille-only artwork");
			if (lines.length > 2) {
				assert(lines.length <= terminalHeight - 8);
				const nameLine = lines.map(strip).find(line => line.includes(WORDMARK));
				if (nameLine) {
					assert.equal(text.split(WORDMARK).length - 1, 1);
					const nameCol = codePoints(nameLine.slice(0, nameLine.indexOf(WORDMARK))).length;
					assert(Math.abs(nameCol + WORDMARK.length / 2 - width / 2) <= 1);
				} else {
					// The lettering box (see WORDMARK_BOX) must be drawn, whichever mosaic is in use.
					const artWidth = Math.floor(Math.min(width - 2, (terminalHeight - 9) * FACE_ASPECT)), artHeight = Math.ceil(artWidth / FACE_ASPECT), artIndent = Math.floor((width - artWidth) / 2);
					assert.equal(lines.length, artHeight + 1, "One spacer line follows the artwork");
					const cellsOf = lines.slice(0, artHeight).map(line => codePoints(strip(line)));
					let painted = 0, cells = 0;
					for (let row = Math.floor(WORDMARK_BOX.y / FACE_HEIGHT * artHeight); row < Math.ceil((WORDMARK_BOX.y + WORDMARK_BOX.height) / FACE_HEIGHT * artHeight); row++)
						for (let col = Math.floor(WORDMARK_BOX.x / FACE_WIDTH * artWidth); col < Math.ceil((WORDMARK_BOX.x + WORDMARK_BOX.width) / FACE_WIDTH * artWidth); col++) { cells++; if ((cellsOf[row][artIndent + col] || 32) !== 32) painted++; }
					assert(painted > cells * 0.35, "Full layout must draw the block lettering (" + painted + "/" + cells + " cells painted at " + width + " columns)");
				}
			} else assert(lines.length <= 2);
		}
		const before = component.render(80);
		component.invalidate();
		assert.deepEqual(component.render(80), before);
		before[0] = "mutated";
		assert.notEqual(component.render(80)[0], "mutated");
	}
	for (const height of [0, 8, 12, 16, 24, 32, 48, 80]) {
		terminalHeight = height;
		for (const width of [10, 24, 40, 60, 80, 120, 200]) {
			const lines = component.render(width);
			assert(lines.length <= Math.max(0, height - 8));
			assert(lines.every(line => visibleWidth(line) < width));
		}
	}
	terminalHeight = 48;
	const large = component.render(120);
	terminalHeight = 24;
	assert(component.render(120).length < large.length, "Height-only resize must invalidate cache");
	assert(component.render(40).length > 2, "Narrow terminals should retain a scaled dragon");
	// Pi anchors a frame taller than the terminal to its bottom, so with a component tree to measure the banner takes only the rows Pi's own UI leaves free.
	{
		const block = n => ({ render: () => Array.from({ length: n }, () => "x") });
		const container = () => ({ children: [], renders: 0, render(width) { this.renders++; return this.children.flatMap(child => child.render(width)); } });
		const document = container(), chat = container(), editor = block(3), footer = block(2);
		let fitted, rows = 30;
		const host = { terminal: { get rows() { return rows; } }, children: [document, chat, editor, footer] };
		await handlers[0]({ reason: "startup" }, { mode: "tui", ui: { setHeader: factory => { fitted = factory(host); } } });
		document.children.push(fitted);
		const around = () => host.children.filter(child => child !== document).reduce((sum, child) => sum + child.render(120).length, 0);
		let lines = fitted.render(120);
		assert.equal(around(), 5);
		assert.equal(lines.length, 24, "With 5 rows of Pi UI the banner may use 25 rows, more than the default 22");
		assert.equal(document.renders, 0, "The container holding the header is descended, never rendered recursively");
		assert(chat.renders > 0, "Pi's other components are measured by rendering them");
		chat.children.push(block(10)); // Startup notes and warnings arrive after the header is installed.
		lines = fitted.render(120);
		assert.equal(lines.length, 15);
		assert(lines.length + around() <= rows, "The whole frame fits on screen at startup");
		assert.equal(lines.length, fitted.render(120).length, "Nothing changed, nothing re-fitted");
		const agentStart = loaded.extensions[0].handlers.get("agent_start");
		assert.equal(agentStart.length, 1, "The extension settles the header when the conversation starts");
		await agentStart[0]({}, {});
		chat.children.push(block(40));
		assert.equal(fitted.render(120).length, 15, "A growing conversation scrolls the banner away instead of shrinking it");
		rows = 40;
		assert.equal(fitted.render(120).length, 24, "A resize refits; with Pi's output already filling the screen the default share applies");
		chat.children.pop();
		rows = 30;
		assert.equal(fitted.render(120).length, 15, "A resize with a short conversation refits around it");
		rows = 17;
		lines = fitted.render(120);
		assert.equal(lines.length, 2, "Two free rows leave room for the caption alone");
		assert(strip(lines[0]).includes(WORDMARK));
		rows = 16;
		assert.deepEqual(fitted.render(120), [], "One free row draws nothing");
		console.log("PASS banner fits around Pi's own rows until the first prompt, then only on resize");
	}
	terminalHeight = 32;
	delete process.env.NO_COLOR;
	delete process.env.TERM;
	process.env.COLORTERM = "truecolor";
	// Two-tone cells carry a background color only inside solid artwork (letter bodies, dense scales), never across the terminal.
	terminalHeight = 48;
	let filledCells = 0, colors = new Set();
	for (const line of component.render(120)) {
		let background = false;
		for (const token of line.split(/(\x1b\[[0-9;]*m)/g)) {
			if (token.startsWith("\x1b[")) {
				const codes = token.slice(2, -1).split(";").map(Number);
				for (let i = 0; i < codes.length; i++) {
					const code = codes[i];
					if (code === 38 || code === 48) {
						if (code === 48) background = true;
						if (codes[i + 1] === 2) colors.add(codes.slice(i + 2, i + 5).join(","));
						i += codes[i + 1] === 2 ? 4 : 2;
					} else if (code === 0 || code === 49) background = false;
					else if (code >= 40 && code <= 47) background = true;
				}
			} else if (background) {
				assert(!token.includes(" "), "Artwork fill must not bleed into negative space");
				filledCells += codePoints(token).length;
			}
		}
		assert(!background, "Each row must reset its background");
	}
	assert(filledCells > 40, `Expected two-tone cells inside the solid artwork, got ${filledCells}`);
	assert(colors.size > 64, `Expected the reference's full green range, got ${colors.size} colors`);

	// The eye is painted over the reference: at 200 columns its center is white, and narrower renders keep the pupil.
	{
		const lines = component.render(200), artWidth = 198, artHeight = Math.ceil(artWidth / FACE_ASPECT), margin = Math.floor((200 - artWidth) / 2);
		assert(lines.length > artHeight, `Expected ${artHeight} art rows at 200 columns, got ${lines.length - 1}`);
		const cell = ([sx, sy]) => [margin + Math.floor((sx - FACE_SOURCE.x) / FACE_SOURCE.scale * artWidth / FACE_WIDTH), Math.floor((sy - FACE_SOURCE.y) / FACE_SOURCE.scale * artHeight / FACE_HEIGHT)];
		const painted = lines.map(line => {
			const cells = [];
			let fg = null, col = 0;
			for (const token of line.split(/([[0-9;]*m)/g)) {
				if (token.startsWith("[")) {
					const codes = token.slice(2, -1).split(";").map(Number);
					for (let i = 0; i < codes.length; i++) {
						if (codes[i] === 38) { fg = codes[i + 1] === 2 ? codes.slice(i + 2, i + 5) : null; i += codes[i + 1] === 2 ? 4 : 2; }
						else if (codes[i] === 48) i += codes[i + 1] === 2 ? 4 : 2;
						else if (codes[i] === 0 || codes[i] === 39) fg = null;
					}
				} else for (const ch of token) cells[col++] = ch !== " " && fg ? fg : null;
			}
			return cells;
		});
		const [eyeCol, eyeRow] = cell([EYE.x, EYE.y]), eye = painted[eyeRow]?.[eyeCol];
		assert(eye && Math.min(...eye) > 200, `The eye at cell ${eyeCol},${eyeRow} must be white, got ${eye}`);
		// In narrower terminals the pupil is thinner than a sub-cell, so the cell under the eye's center is pinned: a mosaic glyph, never a solid block, with the terminal's own background showing through the slit.
		for (const columns of [100, 120]) {
			const small = component.render(columns), smallWidth = columns - 2, smallHeight = Math.ceil(smallWidth / FACE_ASPECT), smallMargin = Math.floor((columns - smallWidth) / 2);
			const col = smallMargin + Math.floor((EYE.x - FACE_SOURCE.x) / FACE_SOURCE.scale * smallWidth / FACE_WIDTH), row = Math.floor((EYE.y - FACE_SOURCE.y) / FACE_SOURCE.scale * smallHeight / FACE_HEIGHT);
			let bg = null, at = 0, found = null;
			for (const token of small[row].split(/(\x1b\[[0-9;]*m)/g)) {
				if (token.startsWith("\x1b[")) {
					const codes = token.slice(2, -1).split(";").map(Number);
					for (let i = 0; i < codes.length; i++) {
						if (codes[i] === 48) { bg = codes[i + 1] === 2 ? codes.slice(i + 2, i + 5) : codes[i + 1]; i += codes[i + 1] === 2 ? 4 : 2; }
						else if (codes[i] === 38) i += codes[i + 1] === 2 ? 4 : 2;
						else if (codes[i] === 0 || codes[i] === 49) bg = null;
					}
				} else for (const ch of token) { if (at++ === col) found = { ch, bg }; }
			}
			assert(found && found.ch !== "\u2588" && found.ch !== " " && found.bg === null, `The pupil at ${columns} columns (cell ${col},${row}) must show through a mosaic glyph with no background, got ${JSON.stringify(found)}`);
		}
		// The wordmark: the name is normalized, and its block letters keep the reference's gradient from a lime top to a dark foot.
		assert.equal(wordmarkText({}), "BASILIX");
		assert.equal(wordmarkText({ ATOM_WORDMARK: "  atom " }), "ATOM");
		assert.equal(wordmarkText({ ATOM_WORDMARK: "" }), "ATOM");
		assert.equal(wordmarkText({ ATOM_WORDMARK: "my   name" }), "MY NAME");
		assert.equal(WORDMARK, "B A S I L I X");
		const boxRows = [Math.floor(WORDMARK_BOX.y / FACE_HEIGHT * artHeight), Math.ceil((WORDMARK_BOX.y + WORDMARK_BOX.height) / FACE_HEIGHT * artHeight)];
		const boxCols = [margin + Math.floor(WORDMARK_BOX.x / FACE_WIDTH * artWidth), margin + Math.ceil((WORDMARK_BOX.x + WORDMARK_BOX.width) / FACE_WIDTH * artWidth)];
		const band = (from, to) => { let sum = 0, n = 0; for (let row = from; row < to; row++) for (let col = boxCols[0]; col < boxCols[1]; col++) { const c = painted[row]?.[col]; if (c) { sum += c[1]; n++; } } return n ? sum / n : 0; };
		const third = Math.floor((boxRows[1] - boxRows[0]) / 3), head = band(boxRows[0] + 1, boxRows[0] + 1 + third), foot = band(boxRows[1] - 1 - third, boxRows[1] - 1);
		assert(head > foot + 30, `Lettering must shade from lime (${head.toFixed(0)}) to dark (${foot.toFixed(0)})`);
		console.log(`PASS eye, pupil pin at 100 and 120 columns, and wordmark painted over the reference (lettering green ${head.toFixed(0)} at the top, ${foot.toFixed(0)} at the foot)`);
	}

	// Ink is off-screen: no terminal writes, console patching or leaked listeners.
	const stdoutWrite = process.stdout.write, stderrWrite = process.stderr.write, consoleLog = console.log;
	const events = ["SIGINT", "SIGTERM", "beforeExit", "exit"];
	const listeners = events.map(event => process.listenerCount(event));
	const inputListeners = process.stdin.eventNames().map(event => [event, process.stdin.listenerCount(event)]);
	try {
		process.stdout.write = () => { throw new Error("Ink wrote to real stdout"); };
		process.stderr.write = () => { throw new Error("Ink wrote to real stderr"); };
		for (const width of [80, 120, 40, 160, 80]) component.render(width);
		assert.equal(console.log, consoleLog);
	} finally {
		process.stdout.write = stdoutWrite;
		process.stderr.write = stderrWrite;
	}
	await new Promise(resolve => setImmediate(resolve));
	assert.deepEqual(events.map(event => process.listenerCount(event)), listeners);
	assert.deepEqual(process.stdin.eventNames().map(event => [event, process.stdin.listenerCount(event)]), inputListeners);
	console.log(`PASS React/Ink off-screen isolation, cleanup, two-tone cells (${filledCells} filled, ${colors.size} colors), transparent margins`);
	terminalHeight = 32;
	const started = performance.now();
	for (let n = 0; n < 1000; n++) component.render(80);
	console.log(`PASS widths 0–200, centering, color tiers/resets, invalidation; 1000 cached renders: ${(performance.now() - started).toFixed(1)}ms`);
	const previewIndex = process.argv.indexOf("--preview");
	if (previewIndex >= 0) {
		const previewWidth = Number(process.argv[previewIndex + 1]) || 80;
		terminalHeight = Number(process.argv[previewIndex + 2]) || 32;
		console.log(component.render(previewWidth).join("\n"));
	}
} finally {
	for (const key of keys) {
		if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
	}
}
