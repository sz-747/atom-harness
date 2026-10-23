import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Terminal title for Atom: a status mark, the Atom symbol, and the session name or project directory.
 *
 *   ○ ⚛ | atom-harness     idle
 *   ⠋ ⚛ | atom-harness     working (spinner)
 *   ✓ ⚛ | atom-harness     done
 *   ✗ ⚛ | atom-harness     the last run ended in an error
 *
 * Terminals without a known Unicode-capable identity get the plain form "ATOM | atom-harness"
 * with ASCII marks.
 *
 * Pi writes its own "π - <dir>" title after extensions bind, on /reload, and again after its
 * Windows package check, so the Atom title is re-asserted on a short schedule after every
 * session start as well as on each status change.
 */
const MAX_NAME_LENGTH = 40;
const SPINNER_INTERVAL_MS = 120;
const REASSERT_DELAYS_MS = [0, 300, 1500, 5000];

type Status = "idle" | "working" | "done" | "error";

interface Marks { readonly prefix: string; readonly spinner: readonly string[]; readonly done: string; readonly error: string; readonly idle: string }

const UNICODE: Marks = { prefix: "⚛", spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], done: "✓", error: "✗", idle: "○" };
const ASCII: Marks = { prefix: "ATOM", spinner: ["|", "/", "-", "\\"], done: "ok", error: "!!", idle: "--" };

/** Windows Terminal, WezTerm, VS Code, iTerm and friends announce themselves; a bare console does not. */
function marksFor(env: NodeJS.ProcessEnv): Marks {
	const unicode = env.WT_SESSION !== undefined || env.TERM_PROGRAM !== undefined || env.WEZTERM_PANE !== undefined || (env.TERM ?? "").includes("xterm");
	return unicode ? UNICODE : ASCII;
}

/** The last path segment, with trailing separators of either kind stripped. */
function basename(path: string | undefined): string {
	const trimmed = (path ?? "").replace(/[\\/]+$/, "");
	return trimmed.split(/[\\/]/).pop() || "atom";
}

function truncate(name: string): string {
	return name.length <= MAX_NAME_LENGTH ? name : `${name.slice(0, MAX_NAME_LENGTH - 3)}...`;
}

interface TitleHost { hasUI: boolean; cwd: string; ui: { setTitle(title: string): void } }

export default function atomTitle(pi: ExtensionAPI): void {
	const marks = marksFor(process.env);
	let status: Status = "idle";
	let outcome: Status = "done";
	let frame = 0;
	let spinner: NodeJS.Timeout | undefined;
	let host: TitleHost | undefined;
	const pending = new Set<NodeJS.Timeout>();

	const mark = (): string => {
		if (status === "working") return marks.spinner[frame % marks.spinner.length];
		return status === "done" ? marks.done : status === "error" ? marks.error : marks.idle;
	};

	const write = (): void => {
		if (!host?.hasUI) return;
		const name = pi.getSessionName()?.trim() || basename(host.cwd);
		host.ui.setTitle(`${mark()} ${marks.prefix} | ${truncate(name)}`);
	};

	const stopSpinner = (): void => {
		if (spinner) clearInterval(spinner);
		spinner = undefined;
		frame = 0;
	};

	const startSpinner = (): void => {
		if (spinner) return;
		spinner = setInterval(() => { frame++; write(); }, SPINNER_INTERVAL_MS);
		spinner.unref?.();
	};

	const setStatus = (next: Status, ctx: TitleHost): void => {
		host = ctx;
		status = next;
		if (next === "working") startSpinner(); else stopSpinner();
		write();
	};

	const clearPending = (): void => {
		for (const timer of pending) clearTimeout(timer);
		pending.clear();
	};

	/** Re-assert the title after the moments Pi overwrites it. */
	const reassert = (): void => {
		clearPending();
		for (const delay of REASSERT_DELAYS_MS) {
			const timer = setTimeout(() => { pending.delete(timer); write(); }, delay);
			timer.unref?.();
			pending.add(timer);
		}
	};

	pi.on("session_start", (_event, ctx) => {
		setStatus("idle", ctx);
		reassert();
	});
	pi.on("session_info_changed", (_event, ctx) => { host = ctx; write(); });
	pi.on("agent_start", (_event, ctx) => {
		outcome = "done";
		setStatus("working", ctx);
	});
	// agent_end can fire more than once per run (retries, continuations); the last assistant stop reason decides the mark.
	pi.on("agent_end", (event) => {
		const last = [...event.messages].reverse().find(message => message.role === "assistant");
		const stop = last && "stopReason" in last ? last.stopReason : undefined;
		outcome = stop === "error" ? "error" : stop === "aborted" ? "idle" : "done";
	});
	pi.on("agent_settled", (_event, ctx) => setStatus(outcome, ctx));
	pi.on("session_shutdown", () => {
		clearPending();
		stopSpinner();
	});
}
