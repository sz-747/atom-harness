import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const COMPACTION_THRESHOLD_PERCENT = 50;

/** Compact once when the active context crosses half of its model window. */
export default function atomCompaction(pi: ExtensionAPI): void {
	let previousPercent: number | null = null;
	let compacting = false;

	const startCompaction = (ctx: ExtensionContext): void => {
		if (compacting) return;
		compacting = true;
		ctx.compact({
			onComplete: () => { compacting = false; },
			onError: error => {
				compacting = false;
				if (ctx.hasUI) ctx.ui.notify(`Auto-compaction failed: ${error.message}`, "warning");
			},
		});
	};

	pi.on("session_start", () => {
		previousPercent = null;
		compacting = false;
	});

	pi.on("turn_end", (_event, ctx) => {
		const percent = ctx.getContextUsage()?.percent;
		if (percent === null || percent === undefined) return;

		const crossed = percent >= COMPACTION_THRESHOLD_PERCENT &&
			(previousPercent === null || previousPercent < COMPACTION_THRESHOLD_PERCENT);
		previousPercent = percent;
		if (crossed) startCompaction(ctx);
	});
}
