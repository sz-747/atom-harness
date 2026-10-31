// Atom Calm - persisted on/off preference.
//
// Adapted from Kun Chen's Pi Calm extension.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// The preference is a plain file named "calm" in Pi's agent directory
// (~/.pi/agent by default, PI_CODING_AGENT_DIR when set). It contains exactly
// "on" or "off"; anything else, including a missing file, means off.

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as PiCodingAgent from "@earendil-works/pi-coding-agent";

export const CALM_PREFERENCE_FILE_NAME = "calm";

/** Pi's agent directory via its exported getAgentDir(), with a documented fallback. */
export function calmAgentDir(): string {
	if (typeof PiCodingAgent.getAgentDir === "function") return PiCodingAgent.getAgentDir();
	const envDir = process.env.PI_CODING_AGENT_DIR?.trim();
	if (envDir) return envDir;
	return join(homedir(), ".pi", "agent");
}

export function calmPreferencePath(): string {
	return join(calmAgentDir(), CALM_PREFERENCE_FILE_NAME);
}

/** Calm is off by default and on any read error. */
export function loadCalmPreference(): boolean {
	try {
		return readFileSync(calmPreferencePath(), "utf8").trim() === "on";
	} catch {
		return false;
	}
}

/**
 * Persist atomically (unique temp file plus rename) so a crashed write never leaves
 * a truncated state file. A failure throws with the path so /calm can report it.
 */
export function persistCalmPreference(active: boolean): void {
	const path = calmPreferencePath();
	try {
		mkdirSync(dirname(path), { recursive: true });
		const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
		try {
			writeFileSync(temporaryPath, active ? "on\n" : "off\n", { encoding: "utf8", flag: "wx" });
			renameSync(temporaryPath, path);
		} finally {
			rmSync(temporaryPath, { force: true });
		}
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`Calm could not save its preference to ${path}: ${reason}`);
	}
}
