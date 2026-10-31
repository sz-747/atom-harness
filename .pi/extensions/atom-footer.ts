import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

function formatTokens(count: number): string {
	if (count < 1000) return String(count);
	if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1_000_000).toFixed(1)}M`;
}

function formatCwd(cwd: string): string {
	const home = process.env.USERPROFILE || process.env.HOME;
	if (!home) return cwd;
	if (cwd === home) return "~";
	const prefix = home.endsWith("\\") ? home : `${home}\\`;
	return cwd.startsWith(prefix) ? `~\\${cwd.slice(prefix.length)}` : cwd;
}

/** Keep Pi's footer information but omit the redundant provider name. */
export default function atomFooter(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setFooter((tui, theme, footerData) => {
			const rerender = () => tui.requestRender();
			const unsubscribers = [
				footerData.onBranchChange(rerender),
				pi.on("agent_start", rerender),
				pi.on("agent_end", rerender),
				pi.on("turn_end", rerender),
				pi.on("message_update", rerender),
				pi.on("session_compact", rerender),
			];
			return {
				dispose: () => unsubscribers.forEach(unsubscribe => unsubscribe()),
				invalidate() {},
				render(width: number): string[] {
					const usage = ctx.getContextUsage();
					const context = usage?.percent === null || usage?.percent === undefined
						? "?"
						: `${usage.percent.toFixed(1)}%`;
					const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const model = ctx.model?.id ?? "no-model";
					const thinking = ctx.thinkingLevel && ctx.thinkingLevel !== "off" ? ` • ${ctx.thinkingLevel}` : "";
					const branch = footerData.getGitBranch();
					const branchSuffix = branch ? ` (${branch})` : "";
					const cwd = theme.fg("dim", `${formatCwd(ctx.cwd)}${branchSuffix}`);
					const right = theme.fg("dim", `${model}${thinking}`);
					const stats = theme.fg("dim", `context ${context}/${formatTokens(contextWindow)} (auto)`);
					const padding = " ".repeat(Math.max(1, width - visibleWidth(stats) - visibleWidth(right)));
					return [truncateToWidth(cwd, width), truncateToWidth(stats + padding + right, width)];
				},
			};
		});
	});
}
