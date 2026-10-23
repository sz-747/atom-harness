import React from "react";
import { Box, Text, render } from "ink";
import { PassThrough, Writable } from "node:stream";
import { cellCount, type Stroke } from "./face";
import { paintRun, type AtomColorMode } from "./theme/forest";

type BannerProps = { layout: readonly Stroke[][]; width: number; indent: number; mode: AtomColorMode };

function ArtworkRow({ strokes, mode }: { strokes: readonly Stroke[]; mode: AtomColorMode }) {
	let cursor = 0, text = "";
	for (const stroke of strokes) {
		text += " ".repeat(Math.max(0, stroke.col - cursor));
		text += paintRun(stroke.text, stroke.fg, stroke.bg, mode);
		cursor = stroke.col + cellCount(stroke.text);
	}
	return <Box height={1} flexShrink={0}><Text wrap="truncate">{text || " "}</Text></Box>;
}

/** React/Ink owns the artwork's terminal layout, but never Pi's terminal. */
export function AtomBanner({ layout, width, indent, mode }: BannerProps) {
	return <Box width={width} paddingLeft={indent} flexDirection="column" height={layout.length}>
		{layout.map((strokes, row) => <ArtworkRow key={row} strokes={strokes} mode={mode} />)}
	</Box>;
}

/** Synchronous Ink frame captured off-screen for Pi's render(width) contract. */
export function renderInkRows(layout: readonly Stroke[][], width: number, indent: number, mode: AtomColorMode): string[] {
	if (!layout.length || width <= 0) return [];
	let output = "", errors = "";
	const stdout = Object.assign(new Writable({ write(chunk, _encoding, done) { output += chunk.toString(); done(); } }), {
		columns: width, rows: layout.length + 2, isTTY: false,
	});
	const stderr = new Writable({ write(chunk, _encoding, done) { errors += chunk.toString(); done(); } });
	const stdin = Object.assign(new PassThrough(), { isTTY: false });
	let instance: ReturnType<typeof render> | undefined;
	try {
		instance = render(<AtomBanner layout={layout} width={width} indent={indent} mode={mode} />, {
			stdout: stdout as unknown as NodeJS.WriteStream,
			stderr: stderr as unknown as NodeJS.WriteStream,
			stdin: stdin as unknown as NodeJS.ReadStream,
			interactive: false, concurrent: false, patchConsole: false, exitOnCtrlC: false,
			isScreenReaderEnabled: false, kittyKeyboard: { mode: "disabled" },
		});
		instance.unmount(); // Ink's non-interactive mode writes exactly its final frame.
		if (errors) throw new Error(`Atom Ink render failed: ${errors}`);
		const rows = output.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
		if (rows.length !== layout.length) throw new Error(`Atom Ink height mismatch: ${rows.length}/${layout.length}`);
		return rows.map(line => {
			const trimmed = line.trimEnd();
			return trimmed.includes("\x1b[") ? trimmed + "\x1b[0m" : trimmed;
		});
	} finally {
		instance?.cleanup();
		stdin.destroy(); stdout.destroy(); stderr.destroy();
	}
}
