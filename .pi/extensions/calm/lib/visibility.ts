// Atom Calm - shared presentation state.
//
// Adapted from Kun Chen's Pi Calm extension (itself adapted from Firstmate).
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// This module owns only the in-memory presentation flag. Presentation filtering
// never deletes or alters session or export data. Kun's separate "stock export
// rendering" flag is gone: Pi 0.85.1 renders /export through core/export-html and
// /share as JSONL, so neither passes through the patched TUI component.

let active = false;

/** True while Calm presentation filtering is enabled. */
export function calmPresentationIsActive(): boolean {
	return active;
}

export function setCalmPresentation(next: boolean): void {
	active = next;
}
