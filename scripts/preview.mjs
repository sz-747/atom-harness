import { renderAtomHeader } from "../branding/generated/header.mjs";

const width = Number(process.argv[2] ?? process.stdout.columns ?? 120);
const height = Number(process.argv[3] ?? process.stdout.rows ?? 48);
if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
	console.error("Usage: npm run preview -- [columns] [rows] (positive integers)");
	process.exitCode = 1;
} else {
	process.stdout.write(renderAtomHeader(width, process.env, height).join("\n") + "\n");
}
