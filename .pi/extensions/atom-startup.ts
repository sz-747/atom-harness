import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stat } from "node:fs/promises";
import type * as AtomHeaderModule from "../../branding/atom-wordmark";

/** Project-local UI branding; Pi remains the underlying runtime. */
export default function atomStartup(pi: ExtensionAPI): void {
	let header: AtomHeaderModule.AtomHeader | undefined;
	let create: typeof AtomHeaderModule.createAtomHeader | undefined;
	let visible = true;
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		// Native ESM preserves Ink/Yoga's async initialization. Never load React
		// or mount Ink in print, JSON, or RPC modes. Rebuild with npm run build.
		const moduleUrl = new URL("../../branding/generated/header.mjs", import.meta.url);
		moduleUrl.searchParams.set("build", String((await stat(moduleUrl)).mtimeMs));
		({ createAtomHeader: create } = await import(moduleUrl.href) as typeof AtomHeaderModule);
		// The header reads the live terminal size and Pi's component tree, so it fits the rows Pi's own UI leaves free.
		if (visible) ctx.ui.setHeader(tui => header = create!(tui));
	});
	pi.registerCommand("banner", {
		description: "Toggle Atom's startup art (dragon and BASILIX wordmark) for this session",
		handler: async (_args, ctx) => {
			if (!create) return ctx.ui.notify("Atom banner is only available in the interactive UI", "info");
			visible = !visible;
			if (visible) ctx.ui.setHeader(tui => header = create!(tui));
			else { header = undefined; ctx.ui.setHeader(undefined); }
			ctx.ui.notify(`Atom banner ${visible ? "on" : "off"}`, "info");
		},
	});
	// From the first prompt on, only a resize refits the banner; the growing conversation scrolls it away like any output.
	pi.on("agent_start", () => header?.settle());
}
