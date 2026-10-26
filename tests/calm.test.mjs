import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mock } from "node:test";
import { createShip } from "../.pi/extensions/calm/ship.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const globalModules = execSync("npm root -g", { encoding: "utf8" }).trim();
const pi = [join(root, "node_modules"), globalModules]
	.map(base => join(base, "@earendil-works/pi-coding-agent"))
	.find(base => existsSync(join(base, "dist/index.js")));
assert(pi, "Installed Pi runtime not found");
const { AgentSession, ToolExecutionComponent } = await import(pathToFileURL(join(pi, "dist/index.js")));
const { initTheme } = await import(pathToFileURL(join(pi, "dist/modes/interactive/theme/theme.js")));
const { withBuiltInRenderers } = await import(pathToFileURL(join(pi, "dist/core/tools/renderers/index.js")));
const { loadExtensions } = await import(pathToFileURL(join(pi, "dist/core/extensions/loader.js")));
const require = createRequire(import.meta.url);
const ts = require(require.resolve("typescript", { paths: [root, globalModules] }));
const tui = [join(pi, "node_modules"), globalModules]
	.map(base => join(base, "@earendil-works/pi-tui/dist/index.d.ts")).find(existsSync);
const program = ts.createProgram([join(root, ".pi/extensions/calm/index.ts")], {
	noEmit: true, strict: true, skipLibCheck: true, allowImportingTsExtensions: true,
	target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: pi,
	paths: { "@earendil-works/pi-coding-agent": ["dist/index.d.ts"], "@earendil-works/pi-tui": [tui] },
	typeRoots: [join(root, "node_modules/@types"), join(pi, "node_modules/@types")],
});
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
	getCurrentDirectory: () => root, getCanonicalFileName: f => f, getNewLine: () => "\n",
}));
console.log("PASS Calm strict TypeScript");

const scratch = mkdtempSync(join(tmpdir(), "atom-calm-test-"));
const previous = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = scratch;
mock.timers.enable({ apis: ["setInterval"] });
try {
	initTheme("dark", false);
	const loaded = await loadExtensions([join(root, ".pi/extensions/calm/index.ts")], root);
	assert.deepEqual(loaded.errors, []);
	const extension = loaded.extensions[0];
	const emit = async (event, ctx) => {
		for (const handler of extension.handlers.get(event) ?? []) await handler({}, ctx);
	};
	let widget, expanded = true, visible, renders = 0;
	const notices = [];
	const ui = {
		setWidget(_key, factory) { widget?.dispose(); widget = factory?.({ requestRender() { renders++; } }); },
		setWorkingVisible(value) { visible = value; },
		getToolsExpanded() { return expanded; },
		setToolsExpanded(value) { expanded = value; },
		notify(...args) { notices.push(args); },
	};
	const ctx = { mode: "tui", ui };
	const toggle = () => extension.commands.get("calm").handler("", ctx);
	// No stored setting: opt in. Non-TUI modes must not install a boat.
	for (const mode of ["print", "json", "rpc"]) await emit("session_start", { mode, ui });
	assert.equal(visible, undefined);
	await emit("session_start", ctx);
	await emit("agent_start", ctx);
	assert.equal(widget, undefined);
	await toggle();
	assert(widget);
	assert.equal(visible, false);
	assert.equal(expanded, true);
	assert.equal(readFileSync(join(scratch, "calm"), "utf8"), "on\n");
	await emit("agent_end", ctx); // Continuations/retries are not the end of work.
	assert(widget);
	mock.timers.tick(220);
	assert(renders > 0);

	const execute = async () => ({ content: [{ type: "text", text: "unchanged" }], details: {} });
	const definition = { name: "read", label: "Read", description: "Read", parameters: {}, execute };
	const session = {
		_toolDefinitions: new Map([["read", { definition }]]),
		getAllTools: () => [{ name: "read", sourceInfo: { source: "builtin" } }],
	};
	const found = AgentSession.prototype.getToolDefinition.call(session, "read");
	assert.notEqual(found, definition, "Presentation metadata does not mutate the registry");
	assert.equal(Reflect.ownKeys(definition).some(key => typeof key === "symbol"), false);
	assert.equal(found.execute, execute);
	assert.equal((await found.execute()).content[0].text, "unchanged");
	const row = new ToolExecutionComponent("read", "call-1", { path: "test.txt" }, {}, withBuiltInRenderers("read", { ...found }), { requestRender() {} }, root);
	row.updateResult({ content: [{ type: "text", text: "stored output" }], details: {} });
	assert.deepEqual(row.render(80), []);
	assert.equal(row.result.content[0].text, "stored output");
	row.imageComponents = [{ render: () => ["IMAGE"] }];
	row.imageSpacers = [{ render: () => [""] }];
	assert.deepEqual(row.render(80), ["", "IMAGE"]);
	row.imageComponents = []; row.imageSpacers = [];
	// Even a custom tool that reuses a built-in executor must remain visible.
	const customDefinition = { ...definition };
	const custom = new ToolExecutionComponent("read", "custom", {}, {}, customDefinition, { requestRender() {} }, root);
	assert(custom.render(80).length > 0, "Custom overrides remain visible");
	const sdkSession = { ...session, _baseToolsOverride: { read: customDefinition }, _toolDefinitions: new Map([["read", { definition: customDefinition }]]) };
	const sdkDefinition = AgentSession.prototype.getToolDefinition.call(sdkSession, "read");
	const sdkRow = new ToolExecutionComponent("read", "sdk", {}, {}, { ...sdkDefinition }, { requestRender() {} }, root);
	assert(sdkRow.render(80).length > 0, "SDK overrides remain visible");
	await toggle();
	assert(row.render(80).length > 0, "Turning Calm off restores original tool rendering");
	assert.equal(widget, undefined);
	assert.equal(visible, true);
	await toggle();
	await emit("agent_settled", ctx);
	assert.equal(widget, undefined);
	assert.equal(visible, true);
	const count = renders;
	mock.timers.tick(2000);
	assert.equal(renders, count, "Settling stops animation timers");
	await emit("session_start", ctx);
	await emit("agent_start", ctx);
	assert(widget, "Saved preference survives session restart");
	await emit("session_shutdown", ctx);
	assert.equal(widget, undefined);
	assert(row.render(80).length > 0, "Shutdown disables presentation patch");
	writeFileSync(join(scratch, "calm"), "invalid");
	await emit("session_start", ctx); await emit("agent_start", ctx);
	assert.equal(widget, undefined, "Invalid preference is off");
	await emit("session_shutdown", ctx);
	console.log("PASS real Pi loader/rows: hide, restore, images, custom/SDK overrides, unchanged execution/results");
	console.log("PASS toggle persistence, run lifecycle, retries, non-TUI guard, timer cleanup");

	const plain = text => text.replace(/\x1b\[[0-9;]*m/g, "");
	const ship = createShip({ requestRender() {} });
	for (let step = 0; step < 200; step++) {
		mock.timers.tick(220);
		for (let width = 0; width <= 160; width++) {
			const lines = ship.render(width).map(plain);
			assert(lines.every(line => line.length <= width));
			if (width >= 4) { assert.equal(lines.length, 2); assert.equal(lines[1].length, width); assert(lines[1].includes("\\__/")); }
		}
	}
	ship.dispose(); ship.dispose();
	assert.deepEqual(ship.render(80), []);
	assert.match(readFileSync(join(root, "atom.ps1"), "utf8"), /--extension \$calm/);
	console.log("PASS boat animation, widths 0-160, resize, disposal, launcher wiring");
} finally {
	mock.timers.reset();
	if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = previous;
	rmSync(scratch, { recursive: true, force: true });
}
