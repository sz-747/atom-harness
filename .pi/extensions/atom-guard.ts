import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Atom guard: a confirmation prompt before shell commands that destroy work or publish it.
 *
 * Pi has no permission system, so the model runs whatever it decides to run. This extension
 * watches the built-in bash and powershell tools and, when a command matches one of the rules
 * below, asks in the UI before it runs. Declined commands are blocked with a reason the model
 * sees, so it explains instead of retrying. Without a UI (print mode) a matching command is
 * blocked outright.
 *
 * The rules enforce a narrow approval policy for destructive or publishing commands. The
 * implementation uses Pi's tool_call event, as in Pi's permission-gate example.
 *
 * /guard toggles the guard for the current session, for a batch that would otherwise ask
 * many times.
 */
interface Rule {
	readonly label: string;
	readonly test: RegExp;
}

const RULES: readonly Rule[] = [
	{ label: "force push", test: /\bgit\s+push\b[^\n;&|]*\s(-f|--force|--force-with-lease|--force-if-includes)\b/ },
	{ label: "push to main or master", test: /\bgit\s+push\b[^\n;&|]*\b(main|master)\b/ },
	{ label: "hard reset", test: /\bgit\s+reset\b[^\n;&|]*--hard\b/ },
	{ label: "discard working tree changes", test: /\bgit\s+(checkout|restore)\s+(--\s+|--staged\s+|--worktree\s+)*\.(\s|$)|\bgit\s+clean\b[^\n;&|]*\s-[a-zA-Z]*[fX]/ },
	{ label: "force-delete branch", test: /\bgit\s+branch\s+(-[a-zA-Z]*D\b|--delete\s+--force|--force\s+--delete)/ },
	{ label: "drop stash", test: /\bgit\s+stash\s+(drop|clear)\b/ },
	{ label: "recursive delete", test: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*|--recursive)\b|\bRemove-Item\b[^\n;&|]*-Recurse|\b(rmdir|rd)\s+\/s\b|\bdel\s+[^\n;&|]*\/s\b/i },
	{ label: "merge or publish", test: /\bgh\s+pr\s+merge\b|\bnpm\s+publish\b/ },
];

/** A bare `git push` (no refspec) pushes the current branch; look that branch up. */
const BARE_PUSH = /\bgit\s+push(\s+(-[a-zA-Z]+|--[a-z-]+(=\S+)?)(\s+\S+)?)*\s*(;|&&|\|\||$)/m;

function truncate(text: string, max = 400): string {
	return text.length > max ? `${text.slice(0, max)} ...` : text;
}

export default function atomGuard(pi: ExtensionAPI): void {
	let enabled = true;

	async function currentBranch(cwd: string): Promise<string | undefined> {
		try {
			const result = await pi.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, timeout: 5000 });
			return result.code === 0 ? result.stdout.trim() : undefined;
		} catch {
			return undefined;
		}
	}

	async function match(command: string, cwd: string): Promise<string | undefined> {
		const rule = RULES.find((r) => r.test.test(command));
		if (rule) return rule.label;
		if (BARE_PUSH.test(command)) {
			const branch = await currentBranch(cwd);
			if (branch === "main" || branch === "master") return `push to ${branch} (current branch)`;
		}
		return undefined;
	}

	pi.on("tool_call", async (event, ctx) => {
		if (!enabled) return undefined;
		if (event.toolName !== "bash" && event.toolName !== "powershell") return undefined;
		const input = event.input as { command?: unknown };
		const command = typeof input.command === "string" ? input.command : "";
		if (!command) return undefined;

		const label = await match(command, ctx.cwd);
		if (!label) return undefined;

		if (!ctx.hasUI) {
			return {
				block: true,
				reason: `Atom guard: "${label}" needs the user's confirmation and there is no UI to ask. Do not retry; explain what you wanted to run and why.`,
			};
		}

		const ok = await ctx.ui.confirm(`Atom guard: ${label}`, `${truncate(command)}\n\nRun it?`);
		if (!ok) {
			return {
				block: true,
				reason: `Atom guard: the user declined "${label}". Do not retry it; say what you wanted to do and ask how to proceed.`,
			};
		}
		return undefined;
	});

	pi.registerCommand("guard", {
		description: "Toggle Atom's confirmation before destructive shell commands",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			ctx.ui.notify(`Atom guard ${enabled ? "on" : "off"} for this session`, "info");
		},
	});
}
