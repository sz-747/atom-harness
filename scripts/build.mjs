// Bundles the header into one native-ESM file, React, Ink and Yoga included.
// Left external, Ink's dependency tree costs Node hundreds of file opens and
// stats under node_modules at every startup (about two seconds on Windows);
// the single file imports in a quarter of that. Run through `npm run build`.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const path = (relative) => fileURLToPath(new URL(relative, root));

await build({
	entryPoints: [path("branding/atom-wordmark.ts")],
	outfile: path("branding/generated/header.mjs"),
	bundle: true,
	platform: "node",
	format: "esm",
	jsx: "automatic",
	// Ink imports react-devtools-core for its DEV=true mode only; the stub keeps that optional package out of the bundle.
	alias: { "react-devtools-core": path("branding/stubs/react-devtools-core.mjs") },
	// Ink's CommonJS dependencies call require(), which a native ES module has to provide itself.
	banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
	logLevel: "info",
});
