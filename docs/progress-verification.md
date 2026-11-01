# Outcome-oriented Calm: design and verification

## Contract

Maintenance change: help a person tell what the agent is accomplishing, what happened and what needs attention without reading tool names. Keep one stable transcript anchor per reported subtask. The current agent supplies its intent/result; scripts never classify arbitrary commands or invent success.

Primary view: short title, reported progress/result, and up to three recent factual operations. A count labels omitted earlier operations. Native Ctrl+O reveals original calls/results. Images and actual failed tool results remain visible. No percentages, task scheduler, agent delegation, authentication change or model-provider override is introduced. Existing reasoning, footer and boat ownership remain with Pi/the legacy extension.

Progress states are working, explicitly reported done, explicitly reported blocked, or stopped before completion was reported. Earlier operation errors remain marked. Done is a model report, not independent acceptance. A still-running operation prevents a premature final progress update. A new subtask does not silently complete the old one. Titles/summaries are bounded, single-line and terminal-control sanitized.

The UI adds a tool declaration, interactive guidance and normal progress tool calls. These can add context and model-turn latency. It does not call a second model or add an intent classifier. Keep updates at meaningful subtask boundaries; do not claim zero inference overhead. Plain Pi without this extension is not modified.

## Checks

Run `npm ci --ignore-scripts` and `npm test` from this repository with an installed Pi runtime. Tests use disposable state, fictional data and deterministic streams; no real-provider inference is required.

- Existing branding, strict TypeScript, boat lifecycle, preference persistence and real Pi extension/component tests remain covered.
- Progress tests cover in-place grouping, nested operation ownership, bounded recent steps, error preservation, no inferred completion, stopping, independent runs, terminal-control/CJK/emoji handling, narrow widths, native expansion/images, saved-view reconstruction and interactive-guidance removal when off/non-interactive/tool-disabled.
- A native Pi SDK flow uses a synthetic stream to call progress, write an actual disposable output file, report the result/limits and settle once. The test reads the exact output bytes and retained metadata. The stream is deterministic; this does not establish real-model reporting quality.
- A computation fixture grows to 1,000 subtasks, then samples 1,000 card renders 20 times. The state projection retains three steps per group and introduces no refresh timer. Printed timing is computation only, not input-to-screen latency or model response time.

## Terminal observation

`node scripts/preview-progress.mjs` uses the installed Pi loader, tool components and native TUI in an isolated terminal. Its title visibly labels the scenario as simulated, with no model calls or project operations. `--plain` emits a deterministic compact snapshot.

The simulated preview was exercised in Windows Terminal at 1100x430 and 760x650 pixels. Injected Ctrl+O expanded the original operation details and returned to compact cards; resizing preserved the visible task structure; Q closed only the preview. The compact screenshot in progress-preview.png was inspected for private content. This is a real terminal rendering of fixture data, not a screenshot of a real model performing the investigation. The native SDK flow is checked separately.

Not checked: real-provider latency/token cost, whether a real model consistently uses useful titles/results, physical-device input feel, screen-reader accessibility, and Pi versions other than the installed 1.4.0/Node.js 24 runtime. Already-running Atom/Pi sessions were not reloaded. The original checkout and unrelated pending work were left unchanged.

## Acceptance and reversal

Leading signal: the compact view shows a specific subtask/result rather than raw tool names, while error/image/details remain recoverable. Lagging signal: a person can follow a long real run without asking what happened; this is unmeasured. Revert if original evidence disappears, completion is fabricated from tool settlement, or measured terminal input responsiveness materially regresses under the same workload. Disable Calm to restore native rendering immediately; source rollback requires no data migration. Native progress records remain available in raw session history.
